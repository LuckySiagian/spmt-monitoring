package worker

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"math/rand"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/cdproto/page"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/metrics"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/notification"
	"github.com/spmt/monitoring/internal/repository"
	ws "github.com/spmt/monitoring/internal/websocket"
	"golang.org/x/net/http2"
)

type NetworkContextReader interface {
	GetCurrentContext() model.NetworkContext
}

type MonitorJob struct {
	Website model.Website
	Manual  bool
}

type Pool struct {
	repo       *repository.Repository
	hub        *ws.Hub
	jobs       chan MonitorJob
	workerSize int
	tickers    map[uuid.UUID]*time.Ticker
	mu         sync.Mutex
	ctx        context.Context
	cancel     context.CancelFunc
	localNet   bool
	lastCheck  time.Time
	notif      *notification.Service
	chaos      struct {
		SlowResponse    bool
		PacketLoss      bool
		DNSIntermittent bool
		SSLExpiry       bool
		FirewallDrop    bool
		RandomTimeout   bool
	}
	websiteStates        map[uuid.UUID]*websiteState
	health               model.SystemHealth
	recentFails          []time.Time
	batchSize            int
	batchInterval        time.Duration
	muFails              sync.Mutex
	monitorBaselineLatMs int
	netReader            NetworkContextReader
	asnCache             *ASNCache
	chromeSem            chan struct{}
	allocCancel          context.CancelFunc
	browserCtx           context.Context
	browserCancel        context.CancelFunc
}

type websiteState struct {
	mu                  sync.Mutex
	consecutiveFailures int
	recentLatencies     []int
	lastStatus          model.LogStatus
	statusStartTime     time.Time
	lastHeadlessCheck   time.Time
	lastChromeSuccess   bool      // True if the last executed Chrome diagnostic succeeded
	lastChromeTitle     string    // Last loaded page title from Chrome diagnostic
	lastChromeScreenshot string    // Last captured screenshot (base64)
	lastChromePageText   string    // Cached page text
}

// probeExtras carries additional evidence that doesn't fit in MonitoringLog.
// All fields here are collected during probing and serialized into the evidence JSON.
type probeExtras struct {
	AllResolvedIPs []string   // All IPs returned by DNS
	RedirectChain  []string   // Full HTTP redirect chain
	ContentType    string     // HTTP Content-Type header
	ServerHeader   string     // HTTP Server header
	CDNProvider    string     // CDN name if detected (e.g. "Cloudflare")
	IsCDN          bool       // True if CDN signature was detected
	TLSError       string     // TLS/SSL error code (no narrative, machine-readable)
	TCPLatencyMs   int        // TCP connect latency in milliseconds
	SSLIssuer      string     // SSL certificate issuer (from strict SSL check)
	SSLExpiry      *time.Time // SSL certificate expiry date
	WAFDetected    string     // Name of WAF if detected, or "Not Detected"
	HostingASN     string     // ASN information (e.g. Google Cloud, AS13335)
	DynamicIsMigrated  bool
	DynamicMigrationHint string
	Screenshot     string     // Base64 screenshot image if taken during headless check
	PageTitle      string     // Title of page loaded by headless browser
	PageText       string     // Body text loaded by headless browser
}

func NewPool(repo *repository.Repository, hub *ws.Hub, notif *notification.Service, workerSize int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())

	batchSize := 10
	batchInterval := 2 * time.Second

	if b := os.Getenv("RECHECK_BATCH_SIZE"); b != "" {
		if v, err := strconv.Atoi(b); err == nil && v > 0 {
			batchSize = v
		}
	}
	if d := os.Getenv("RECHECK_BATCH_INTERVAL"); d != "" {
		if v, err := time.ParseDuration(d); err == nil && v > 0 {
			batchInterval = v
		}
	}

	return &Pool{
		repo:          repo,
		hub:           hub,
		notif:         notif,
		jobs:          make(chan MonitorJob, 500),
		workerSize:    workerSize,
		tickers:       make(map[uuid.UUID]*time.Ticker),
		ctx:           ctx,
		cancel:        cancel,
		localNet:      true,
		websiteStates: make(map[uuid.UUID]*websiteState),
		recentFails:   []time.Time{},
		batchSize:     batchSize,
		batchInterval: batchInterval,
		asnCache:      NewASNCache(24*time.Hour, 5000),
		chromeSem:     make(chan struct{}, 3),
	}
}

func (p *Pool) Start() {
	// Increased worker size for production scalability (handled up to 500 sites)
	size := p.workerSize

	slog.Info("Starting lightweight workers", slog.Int("size", size))
	if os.Getenv("DISABLE_CHROME_DIAGNOSTIC") == "true" {
		slog.Warn("⚠️ Headless Chrome diagnostics and screenshot capturing are DISABLED via env (DISABLE_CHROME_DIAGNOSTIC=true)")
	}
	for i := 0; i < size; i++ {
		go p.worker(i)
	}
	go p.scheduler()
	go p.healthMonitor()
	p.startEscalationMonitor()
	p.startRetentionWorker()
}

func (p *Pool) Stop() {
	p.cancel()
	p.mu.Lock()
	if p.browserCancel != nil {
		p.browserCancel()
	}
	if p.allocCancel != nil {
		p.allocCancel()
	}
	p.mu.Unlock()
}

func (p *Pool) scheduler() {
	p.reloadWebsites()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			p.reloadWebsites()
		}
	}
}

func (p *Pool) reloadWebsites() {
	websites, err := p.repo.GetAllWebsites(context.Background())
	if err != nil {
		slog.Error("Failed to load websites in scheduler", slog.Any("error", err))
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	activeIDs := make(map[uuid.UUID]bool)
	for _, w := range websites {
		activeIDs[w.ID] = true
	}
	for id, t := range p.tickers {
		if !activeIDs[id] {
			t.Stop()
			delete(p.tickers, id)
			slog.Info("Removed ticker for website", slog.String("website_id", id.String()))
		}
	}
	for _, w := range websites {
		if _, exists := p.tickers[w.ID]; !exists {
			p.startTicker(*w)
		}
	}
}

func (p *Pool) startTicker(w model.Website) {
	interval := w.IntervalSeconds
	p.jobs <- MonitorJob{Website: w, Manual: false}
	t := time.NewTicker(time.Duration(interval) * time.Second)
	p.tickers[w.ID] = t
	website := w
	go func() {
		for {
			select {
			case <-p.ctx.Done():
				return
			case <-t.C:
				p.jobs <- MonitorJob{Website: website, Manual: false}
			}
		}
	}()
	slog.Info("Scheduled website monitoring", slog.String("website_name", website.Name), slog.String("website_id", website.ID.String()), slog.Int("interval_seconds", interval))
}

func (p *Pool) RestartWebsite(w model.Website) {
	p.mu.Lock()
	if old, ok := p.tickers[w.ID]; ok {
		old.Stop()
		delete(p.tickers, w.ID)
		slog.Info("Stopped old ticker for website", slog.String("website_name", w.Name), slog.String("website_id", w.ID.String()))
	}
	p.startTicker(w)
	p.mu.Unlock()
	slog.Info("Restarted monitoring for website", slog.String("website_name", w.Name), slog.String("url", w.URL))
}

func (p *Pool) TriggerCheck(w model.Website) {
	p.jobs <- MonitorJob{Website: w, Manual: false}
}

func (p *Pool) RevalidateAll() {
	websites, err := p.repo.GetAllWebsites(context.Background())
	if err != nil {
		slog.Error("Failed to load websites for revalidation", slog.Any("error", err))
		return
	}

	slog.Info("Triggering instant revalidation due to network change", slog.Int("count", len(websites)))

	// Reset states to ensure fresh diagnosis
	p.mu.Lock()
	p.websiteStates = make(map[uuid.UUID]*websiteState)
	p.mu.Unlock()

	batchSize := p.batchSize
	if batchSize <= 0 {
		batchSize = 10
	}
	interval := p.batchInterval
	if interval <= 0 {
		interval = 2 * time.Second
	}

	total := len(websites)
	for i := 0; i < total; i += batchSize {
		end := i + batchSize
		if end > total {
			end = total
		}
		batch := websites[i:end]

		for _, w := range batch {
			p.jobs <- MonitorJob{Website: *w, Manual: true}
		}

		// Delay antar batch — kasih napas biar server & network gak kaget
		if end < total {
			time.Sleep(interval)
		}
	}
}

func (p *Pool) worker(id int) {
	for {
		select {
		case <-p.ctx.Done():
			return
		case job := <-p.jobs:
			// Staleness check: If job is too old, skip to prevent retry storm
			// We skip if the job is delayed by more than half its interval
			// But for now, let's just log if it's delayed > 10s
			p.check(job.Website, id, job.Manual)
		}
	}
}

// ── TLS Helpers ────────────────────────────────────────────────
func getTLSVersionName(v uint16) string {
	switch v {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return "Unknown"
	}
}

func getCipherSuiteName(id uint16) string {
	for _, c := range tls.CipherSuites() {
		if c.ID == id {
			return c.Name
		}
	}
	for _, c := range tls.InsecureCipherSuites() {
		if c.ID == id {
			return c.Name + " (Insecure)"
		}
	}
	return "Unknown"
}

func parseTLSError(err error) (string, string) {
	errStr := strings.ToLower(err.Error())

	// 1. Error NET::ERR_CERT_INVALID / SSL_EXPIRED
	if strings.Contains(errStr, "expired") || strings.Contains(errStr, "validate certificate") || strings.Contains(errStr, "not yet valid") {
		return "SSL_EXPIRED", "Masa berlaku sertifikat sudah habis (Expired) atau belum aktif."
	}

	// 2. Hostname Mismatch (Nama domain tidak sesuai)
	if strings.Contains(errStr, "hostname") || strings.Contains(errStr, "doesn't match") || (strings.Contains(errStr, "valid for") && strings.Contains(errStr, "not ")) {
		return "HOSTNAME_MISMATCH", "Nama domain tidak sesuai dengan sertifikat SSL yang digunakan."
	}

	// 3. Otoritas Tidak Tepercaya (Untrusted CA)
	if strings.Contains(errStr, "authority") || strings.Contains(errStr, "self-signed") || strings.Contains(errStr, "untrusted") || strings.Contains(errStr, "signed by unknown authority") {
		return "SSL_UNTRUSTED_CA", "Sertifikat diterbitkan oleh otoritas yang tidak diakui atau diintersepsi oleh jaringan."
	}

	// 4. Private Key Missing / Handshake Issues
	if strings.Contains(errStr, "private key") || strings.Contains(errStr, "bad tag") || strings.Contains(errStr, "no certificate found") {
		return "PRIVATE_KEY_MISSING", "Ada masalah pada kunci privat (Private Key) atau konfigurasi sertifikat di server."
	}

	// 5. ERR_SSL_PROTOCOL_ERROR
	if strings.Contains(errStr, "protocol version") || strings.Contains(errStr, "handshake failure") || strings.Contains(errStr, "remote error") || strings.Contains(errStr, "record layer") {
		return "SSL_PROTOCOL_ERROR", "Kegagalan pada protokol SSL. Browser gagal memverifikasi koneksi aman ke website."
	}

	if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline") {
		return "FIREWALL_INTERRUPTION", "Koneksi SSL terputus oleh firewall karena waktu tunggu habis."
	}

	if strings.Contains(errStr, "reset") || strings.Contains(errStr, "refused") || strings.Contains(errStr, "eof") {
		return "NETWORK_POLICY_BLOCK", "Koneksi diputus paksa oleh kebijakan jaringan yang sedang digunakan."
	}

	return "SSL_GENERAL_ERROR", "Terjadi gangguan pada lapisan keamanan (SSL/TLS): " + err.Error()
}

func (p *Pool) checkSSL(host string, ip string) (bool, *time.Time, string, string, string) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	targetAddr := host + ":443"
	if ip != "" {
		targetAddr = net.JoinHostPort(ip, "443")
	}
	// We use a strict TLS dial to verify the certificate chain
	conn, err := tls.DialWithDialer(dialer, "tcp", targetAddr, &tls.Config{
		ServerName: host,
	})
	if err != nil {
		rc, rec := parseTLSError(err)
		return false, nil, rc, rec, ""
	}
	defer conn.Close()

	state := conn.ConnectionState()
	if len(state.PeerCertificates) > 0 {
		exp := state.PeerCertificates[0].NotAfter
		issuer := state.PeerCertificates[0].Issuer.String()
		return true, &exp, "", "", issuer
	}
	return false, nil, "SSL_NO_CERTIFICATE", "Sertifikat tidak ditemukan pada host tujuan.", ""
}

func getRandomUserAgent() string {
	agents := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
	}
	return agents[rand.Intn(len(agents))]
}

func (p *Pool) isLocalNetworkOK() bool {
	p.mu.Lock()
	// Cache for 10 seconds to avoid excessive pinging
	if time.Since(p.lastCheck) < 10*time.Second {
		status := p.localNet
		p.mu.Unlock()
		return status
	}
	p.mu.Unlock()

	// Quorum internet check: 3 targets
	targets := []string{"8.8.8.8:53", "1.1.1.1:53", "208.67.222.222:53"}
	successCount := 0
	var latencies []int

	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, target := range targets {
		wg.Add(1)
		go func(t string) {
			defer wg.Done()
			start := time.Now()
			dialer := &net.Dialer{Timeout: 2 * time.Second}
			conn, err := dialer.Dial("tcp", t)
			lat := int(time.Since(start).Milliseconds())

			if err == nil {
				conn.Close()
				mu.Lock()
				successCount++
				latencies = append(latencies, lat)
				mu.Unlock()
			}
		}(target)
	}
	wg.Wait()

	ok := successCount >= 2 // Majority quorum

	avgLat := 0
	if len(latencies) > 0 {
		sum := 0
		for _, l := range latencies {
			sum += l
		}
		avgLat = sum / len(latencies)
	}

	p.mu.Lock()
	p.localNet = ok
	p.monitorBaselineLatMs = avgLat
	p.lastCheck = time.Now()
	if ok && avgLat > 500 {
		log.Printf("[Network] Local network is SLOW (Baseline: %dms). Applying compensation.", avgLat)
	}
	p.mu.Unlock()
	return ok
}

func (p *Pool) SetChaos(mode string, active bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	switch mode {
	case "slow":
		p.chaos.SlowResponse = active
	case "loss":
		p.chaos.PacketLoss = active
	case "dns":
		p.chaos.DNSIntermittent = active
	case "ssl":
		p.chaos.SSLExpiry = active
	case "firewall":
		p.chaos.FirewallDrop = active
	case "timeout":
		p.chaos.RandomTimeout = active
	}
	log.Printf("[Chaos] %s mode: %v", mode, active)
}

func (p *Pool) check(w model.Website, workerID int, manual bool) {
	start := time.Now()
	l := &model.MonitoringLog{
		WebsiteID:           w.ID,
		CheckedAt:           start,
		Status:              "",
		HealthScore:         0,    // Start at 0, build up if successful
		Confidence:          100,  // Start at 100 confidence
		IsBrowserAccessible: true, // Start as accessible, prove otherwise
	}

	if !manual && !p.isLocalNetworkOK() {
		slog.Warn("Skip checking website: local network has no internet (quorum failure)",
			slog.String("website_name", w.Name),
			slog.String("website_id", w.ID.String()),
			slog.Int("worker_id", workerID),
		)
		return
	}

	// Chaos: Packet Loss Simulator
	if p.chaos.PacketLoss && rand.Float32() < 0.3 {
		l.Status = model.StatusCritical
		ev, _ := json.Marshal(map[string]interface{}{"dns_resolved": false, "http_error": "INTERMITTENT_PACKET_LOSS_SIMULATED"})
		l.RootCause = string(ev)
		l.HealthScore = 50
		p.saveAndBroadcast(w, l, workerID)
		return
	}

	host := extractHost(w.URL)
	var extras probeExtras

	// 1. DNS — Collect ALL resolved IPs
	dnsStart := time.Now()
	// Chaos: DNS Intermittent
	if p.chaos.DNSIntermittent && rand.Float32() < 0.4 {
		l.Status = model.StatusOffline
		ev, _ := json.Marshal(map[string]interface{}{"dns_resolved": false, "http_error": "DNS_FAILURE_SIMULATED"})
		l.RootCause = string(ev)
		p.saveAndBroadcast(w, l, workerID)
		return
	}

	addrs, err := net.LookupHost(host)
	
	// Fallback to Public DNS (Google DNS 8.8.8.8) if system DNS fails, or resolves to unreachable local/intranet IP
	if err != nil || len(addrs) == 0 {
		slog.Warn("System DNS resolution failed, attempting public DNS fallback", "website", w.Name, "error", err)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		publicAddrs, pubErr := lookupPublicDNS(ctx, host)
		cancel()
		if pubErr == nil && len(publicAddrs) > 0 {
			addrs = publicAddrs
			err = nil // Clear error
			slog.Info("Public DNS fallback successful for failed DNS resolution", "website", w.Name, "public_ips", publicAddrs)
		}
	} else {
		// If resolved IP is private/local, check if it is reachable on port 443 or 80
		primaryIP := addrs[0]
		if isPrivateIPAddress(primaryIP) {
			isReachable := false
			for _, ip := range addrs {
				conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(ip, "443"), 2*time.Second)
				if dialErr == nil {
					conn.Close()
					isReachable = true
					break
				}
				conn, dialErr = net.DialTimeout("tcp", net.JoinHostPort(ip, "80"), 2*time.Second)
				if dialErr == nil {
					conn.Close()
					isReachable = true
					break
				}
			}

			// If unreachable, fallback to public DNS
			if !isReachable {
				slog.Warn("Intranet IP is unreachable, attempting public DNS fallback", "website", w.Name, "intranet_ips", addrs)
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				publicAddrs, pubErr := lookupPublicDNS(ctx, host)
				cancel()
				if pubErr == nil && len(publicAddrs) > 0 {
					// Check if public IP is reachable
					publicReachable := false
					for _, ip := range publicAddrs {
						conn, dialErr := net.DialTimeout("tcp", net.JoinHostPort(ip, "443"), 2*time.Second)
						if dialErr == nil {
							conn.Close()
							publicReachable = true
							break
						}
					}
					if publicReachable {
						slog.Info("Public DNS fallback successful", "website", w.Name, "public_ips", publicAddrs)
						addrs = publicAddrs
					} else {
						slog.Warn("Public DNS IPs are also unreachable", "website", w.Name, "public_ips", publicAddrs)
					}
				} else {
					slog.Warn("Public DNS fallback lookup failed", "website", w.Name, "error", pubErr)
				}
			}
		}
	}

	dnsDuration := int(time.Since(dnsStart).Milliseconds())
	l.DNSLatencyMs = &dnsDuration

	if err != nil || len(addrs) == 0 {
		l.Status = model.StatusOffline
		ev, _ := json.Marshal(map[string]interface{}{
			"dns_resolved": false, "dns_latency_ms": dnsDuration,
			"ip_address": "", "all_resolved_ips": []string{},
			"ip_classification": "UNKNOWN", "http_error": "DNS_RESOLUTION_FAILED",
		})
		l.RootCause = string(ev)
		l.HealthScore = 0
		p.saveAndBroadcast(w, l, workerID)
		return
	}
	l.DNSResolved = true
	l.IPAddress = addrs[0]
	extras.AllResolvedIPs = addrs
	extras.HostingASN = p.getASN(l.IPAddress)

	// 2. SSL/TLS Validation (Source of Truth — strict check, no InsecureSkipVerify)
	isHTTPS := strings.HasPrefix(w.URL, "https://")
	if isHTTPS {
		sslOk, expiry, rc, _, issuer := p.checkSSL(host, l.IPAddress)
		extras.SSLIssuer = issuer
		extras.SSLExpiry = expiry

		// Chaos: SSL Expiry
		if p.chaos.SSLExpiry {
			sslOk = false
			rc = "SSL_EXPIRED_SIMULATED"
		}

		l.SSLValid = sslOk
		l.SSLExpiryDate = expiry
		if !sslOk && rc != "" {
			extras.TLSError = rc
		}
	}

	// 3. HTTP & Observability Probing
	// Chaos: Firewall Drop
	if p.chaos.FirewallDrop && rand.Float32() < 0.5 {
		l.Status = model.StatusOffline
		ev, _ := json.Marshal(map[string]interface{}{
			"dns_resolved": l.DNSResolved, "ip_address": l.IPAddress,
			"http_error": "FIREWALL_DROP_SIMULATED",
		})
		l.RootCause = string(ev)
		p.saveAndBroadcast(w, l, workerID)
		return
	}

	// Network latency compensation — naikkan timeout proporsional biar gak false alarm pas jaringan lelet
	p.mu.Lock()
	baseline := p.monitorBaselineLatMs
	p.mu.Unlock()
	dialTimeout := 10 * time.Second
	httpTimeout := 30 * time.Second
	if baseline > 200 {
		extra := time.Duration(baseline*3/1000) * time.Second
		dialTimeout += extra
		httpTimeout += extra
	}

	jar, _ := cookiejar.New(nil)
	var redirectChain []string
	transport := &http.Transport{
		Proxy:             http.ProxyFromEnvironment,
		TLSClientConfig:   &tls.Config{InsecureSkipVerify: true, ServerName: host},
		ForceAttemptHTTP2: true,
		DisableKeepAlives: false,
		IdleConnTimeout:   10 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			targetAddr := addr
			if l.IPAddress != "" {
				targetAddr = net.JoinHostPort(l.IPAddress, port)
			}
			dialer := &net.Dialer{
				Timeout:   dialTimeout,
				KeepAlive: 30 * time.Second,
			}
			return dialer.DialContext(ctx, network, targetAddr)
		},
	}
	_ = http2.ConfigureTransport(transport)

	client := &http.Client{
		Timeout: httpTimeout,
		Jar:     jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			redirectChain = append(redirectChain, req.URL.String())
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			return nil
		},
		Transport: transport,
	}

	// Chaos: Random Timeout
	if p.chaos.RandomTimeout && rand.Float32() < 0.3 {
		client.Timeout = 1 * time.Millisecond
	}

	req, _ := http.NewRequest("GET", w.URL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
	req.Header.Set("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,ms;q=0.6")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	req.Header.Set("Priority", "u=0, i")

	var tDnsStart, tTlsStart, tTcpStart time.Time
	var tDnsEnd, tTlsEnd, tTcpEnd, tTtfbEnd time.Time

	trace := &httptrace.ClientTrace{
		DNSStart:     func(info httptrace.DNSStartInfo) { tDnsStart = time.Now() },
		DNSDone:      func(info httptrace.DNSDoneInfo) { tDnsEnd = time.Now() },
		ConnectStart: func(network, addr string) { tTcpStart = time.Now() },
		ConnectDone: func(network, addr string, err error) {
			tTcpEnd = time.Now()
			if err == nil {
				l.TCPPortOpen = true
			}
		},
		TLSHandshakeStart: func() { tTlsStart = time.Now() },
		TLSHandshakeDone: func(state tls.ConnectionState, err error) {
			if err == nil {
				tTlsEnd = time.Now()
			} else if extras.TLSError == "" {
				// Capture TLS error from HTTP transport (lower priority than checkSSL error)
				extras.TLSError = err.Error()
			}
		},
		GotFirstResponseByte: func() { tTtfbEnd = time.Now() },
	}
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	httpStart := time.Now()
	resp, httpErr := client.Do(req)

	// If HTTPS request fails, try plain HTTP as fallback
	if httpErr != nil && isHTTPS {
		if strings.Contains(httpErr.Error(), "refused") || strings.Contains(httpErr.Error(), "timeout") {
			fallbackURL := strings.Replace(w.URL, "https://", "http://", 1)
			fallbackReq, _ := http.NewRequest("GET", fallbackURL, nil)
			fallbackReq.Header = req.Header.Clone()
			fallbackResp, fallbackErr := client.Do(fallbackReq)
			if fallbackErr == nil && fallbackResp != nil {
				resp = fallbackResp
				httpErr = nil
				extras.TLSError = "FALLBACK_HTTP_SUCCESS" // HTTPS blocked, HTTP reachable
			}
		}
	}

	// Chaos: Slow Response
	if p.chaos.SlowResponse {
		time.Sleep(9 * time.Second)
	}

	if !tDnsEnd.IsZero() && !tDnsStart.IsZero() {
		dnsLat := int(tDnsEnd.Sub(tDnsStart).Milliseconds())
		l.DNSLatencyMs = &dnsLat
	}

	if !tTcpEnd.IsZero() && !tTcpStart.IsZero() {
		extras.TCPLatencyMs = int(tTcpEnd.Sub(tTcpStart).Milliseconds())
	}

	if !tTlsEnd.IsZero() && !tTlsStart.IsZero() {
		tlsLat := int(tTlsEnd.Sub(tTlsStart).Milliseconds())
		l.TLSLatencyMs = &tlsLat
	}

	if !tTtfbEnd.IsZero() {
		ttfbLat := int(tTtfbEnd.Sub(httpStart).Milliseconds())
		l.TTFBLatencyMs = &ttfbLat
	}

	extras.RedirectChain = redirectChain

	var body []byte
	if httpErr != nil {
		l.ErrorMessage = model.PtrString(httpErr.Error())
		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
	} else {
		defer resp.Body.Close()
		body, _ = io.ReadAll(resp.Body)

		if len(body) > 0 {
			if ok, hint := p.scanForDynamicAlerts(p.ctx, client, w.URL, body); ok {
				extras.DynamicIsMigrated = true
				extras.DynamicMigrationHint = hint
			}
		}

		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
		code := resp.StatusCode
		l.StatusCode = &code

		// Collect response headers into extras
		extras.ContentType = resp.Header.Get("Content-Type")
		extras.ServerHeader = resp.Header.Get("Server")
		
		// WAF Detection
		extras.WAFDetected = "Not Detected"
		serverLower := strings.ToLower(extras.ServerHeader)
		if resp.Header.Get("x-sucuri-id") != "" || serverLower == "sucuri/cloudproxy" {
			extras.WAFDetected = "Sucuri WAF"
		} else if resp.Header.Get("x-amz-cf-id") != "" || serverLower == "cloudfront" {
			extras.WAFDetected = "AWS WAF / CloudFront"
		} else if resp.Header.Get("cf-ray") != "" || serverLower == "cloudflare" {
			extras.WAFDetected = "Cloudflare"
		} else if resp.Header.Get("x-waf-name") != "" {
			extras.WAFDetected = resp.Header.Get("x-waf-name")
		} else if strings.Contains(serverLower, "akamai") {
			extras.WAFDetected = "Akamai WAF"
		} else if strings.Contains(serverLower, "imperva") || strings.Contains(serverLower, "incapsula") {
			extras.WAFDetected = "Imperva WAF"
		}

		cfRay := resp.Header.Get("Cf-Ray")
		if strings.Contains(serverLower, "cloudflare") || cfRay != "" {
			extras.IsCDN = true
			extras.CDNProvider = "Cloudflare"
		}
	}

	// ─── Headless Chrome Diagnostic (Rate-limited / Cached) ──────
	state := p.getWebsiteState(w.ID)

	shouldRunHeadless := false
	if os.Getenv("DISABLE_CHROME_DIAGNOSTIC") == "true" {
		// Headless Chrome is disabled to save memory / CPU locally
	} else {
		// Chrome always runs as the decision maker (screenshot only captured when enabled)
		shouldRunHeadless = true
	}

	if shouldRunHeadless {
		state.mu.Lock()
		state.lastHeadlessCheck = time.Now()
		state.mu.Unlock()

		slog.Info("[Headless] Launching Chrome diagnostic check", "website", w.Name, "url", w.URL)
		screenshot, pageText, pageTitle, err := p.runHeadlessDiagnostic(p.ctx, w.URL, w.SaveScreenshot)
		if err == nil {
			extras.Screenshot = screenshot
			extras.PageTitle = pageTitle
			extras.PageText = pageText
			
			// Update cache
			state.mu.Lock()
			state.lastChromeSuccess = true
			state.lastChromeTitle = pageTitle
			state.lastChromeScreenshot = screenshot
			state.lastChromePageText = pageText
			state.mu.Unlock()
			
			// Dynamic visual DOM text scanner for migrations
			textLower := strings.ToLower(pageText)
			migrationKeywords := []string{
				"migrated", "moved", "dialihkan", "akses melalui",
				"please access via", "gunakan alamat baru", "landing page",
				"telah dipindah", "silakan kunjungi", "has been moved", "has moved to", "please visit",
			}
			for _, kw := range migrationKeywords {
				if strings.Contains(textLower, kw) {
					extras.DynamicIsMigrated = true
					extras.DynamicMigrationHint = cleanPageTextExcerpt(pageText, kw)
					break
				}
			}
			slog.Info("[Headless] Chrome diagnostic success", "website", w.Name, "title", pageTitle, "screenshot_len", len(screenshot))
		} else {
			state.mu.Lock()
			state.lastChromeSuccess = false
			state.lastChromeTitle = ""
			state.lastChromeScreenshot = ""
			state.lastChromePageText = ""
			state.mu.Unlock()
			slog.Error("[Headless] Chrome diagnostic failed", "website", w.Name, "error", err)
		}
	} else {
		// If shouldRunHeadless is false, we do NOT run Chrome and we do NOT use cached values.
		// Pengecekan murni murni berdasarkan parameter jaringan.
		extras.Screenshot = ""
		extras.PageTitle = ""
		extras.PageText = ""
	}

	icmpOk, icmpLat := PingHost(host)
	l.ICMPStatus = icmpOk
	if icmpOk {
		l.ICMPLatencyMs = &icmpLat
	} else {
		l.ICMPLatencyMs = nil
	}

	p.evaluateFinalStatus(l, w, body, extras)

	// Final Safety: If status is still unknown, it's a logic error, default to OFFLINE
	if l.Status == "" {
		l.Status = model.StatusOffline
	}

	p.saveAndBroadcast(w, l, workerID)
}

func (p *Pool) correlateInvestigation(l *model.MonitoringLog, w model.Website, ev map[string]interface{}, isMigrated bool, migrationHint string) (map[string]interface{}, string, int, string) {
	evidence := []string{}
	primaryKey := "UNKNOWN_ERROR"
	recommendedAction := []string{}
	confidence := 100
	status := ""
	healthScore := 100

	isPrivate := false
	if ipClass, ok := ev["ip_classification"].(string); ok && ipClass == "PRIVATE" {
		isPrivate = true
	}
	tcpOk := false
	if t, ok := ev["tcp_connected"].(bool); ok {
		tcpOk = t
	}
	dnsOk := false
	if d, ok := ev["dns_resolved"].(bool); ok {
		dnsOk = d
	}
	tlsOk := false
	if t, ok := ev["tls_handshake_ok"].(bool); ok {
		tlsOk = t
	}
	var httpCode int
	if c, ok := ev["http_status_code"].(int); ok {
		httpCode = c
	} else if cFloat, ok := ev["http_status_code"].(float64); ok {
		httpCode = int(cFloat)
	}

	isSSO := false
	if chain, ok := ev["redirect_chain"].([]string); ok && len(chain) > 0 {
		lastUrl := chain[len(chain)-1]
		if strings.Contains(strings.ToLower(lastUrl), "login") || strings.Contains(strings.ToLower(lastUrl), "sso") {
			isSSO = true
		}
	}
	wafDetected, _ := ev["waf_detected"].(string)

	// 1. Evidence Collection
	if dnsOk {
		evidence = append(evidence, "✓ DNS resolved")
	} else {
		evidence = append(evidence, "✗ DNS failed")
	}
	if isPrivate {
		evidence = append(evidence, "✓ Private IP detected")
	}
	if tcpOk {
		evidence = append(evidence, "✓ TCP connected")
	} else {
		evidence = append(evidence, "✗ TCP failed")
	}
	if strings.HasPrefix(w.URL, "https://") {
		if tlsOk {
			evidence = append(evidence, "✓ TLS handshake OK")
		} else {
			errStr, _ := ev["tls_error"].(string)
			evidence = append(evidence, "✗ TLS failed ("+errStr+")")
		}
	}
	if wafDetected != "" && wafDetected != "Not Detected" {
		evidence = append(evidence, "✓ WAF Challenge / Interception detected ("+wafDetected+")")
	}
	if httpCode > 0 {
		evidence = append(evidence, "✓ HTTP "+fmt.Sprint(httpCode))
	} else {
		evidence = append(evidence, "✗ No HTTP Response")
	}

	// 2. Correlation & Status Decision
	screenshot, _ := ev["screenshot"].(string)
	pageTitle, _ := ev["page_title"].(string)
	pageText, _ := ev["page_text_preview"].(string)
	pageTitleLower := strings.ToLower(pageTitle)
	pageTextLower := strings.ToLower(pageText)

	// Check if Chrome Bot was active and loaded the page successfully without browser errors
	isChromeOk := false
	if screenshot != "" {
		isChromeOk = true
		browserErrorKeywords := []string{
			"site can't be reached", "err_", "connection refused", "connection timed out",
			"dns_probe_finished", "404 not found", "access denied", "blocked", "error",
		}
		for _, kw := range browserErrorKeywords {
			if pageTitle != "" && strings.Contains(pageTitleLower, kw) {
				isChromeOk = false
				break
			}
		}
	}

	var interpretation string

	if screenshot != "" {
		// Chrome Bot-First Status Determination (Absolute Decision Maker)

		// --- Deteksi Jaringan Corporate / Terbatas ---
		// Cek apakah halaman yang diload adalah halaman portal login jaringan kantor
		// atau gateway perusahaan (Sangfor IAG, Fortinet, Cisco, dll)
		isCorporateNetwork := false
		corporateNetworkName := ""
		corporateNetworkKeywords := [][]string{
			// Sangfor IAG (banyak dipakai di kampus/kantor Indonesia)
			{"sangfor", "Sangfor Internet Access Gateway"},
			{"internet access gateway", "Sangfor Internet Access Gateway"},
			{"iag", "Sangfor Internet Access Gateway"},
			// Fortinet / FortiGate
			{"fortigate", "Fortinet FortiGate"},
			{"fortinet", "Fortinet FortiGate"},
			{"fortios", "Fortinet FortiGate"},
			// Cisco Umbrella / ISE
			{"cisco umbrella", "Cisco Umbrella"},
			{"cisco ise", "Cisco ISE"},
			{"openroaming", "Cisco OpenRoaming"},
			// Bluecoat / Symantec Proxy
			{"bluecoat", "BlueCoat Proxy"},
			{"symantec proxy", "Symantec Web Gateway"},
			// Forcepoint
			{"forcepoint", "Forcepoint Web Security"},
			{"websense", "Forcepoint/Websense"},
			// Palo Alto
			{"palo alto", "Palo Alto Network Gateway"},
			{"globalprotect", "Palo Alto GlobalProtect"},
			// Generic captive portal / corporate block page
			{"captive portal", "Corporate Captive Portal"},
			{"network login", "Corporate Network Login"},
			{"acceptable use policy", "Corporate AUP Page"},
			{"internet usage policy", "Corporate Internet Policy"},
			{"block-sosmed", "Corporate Firewall (Blokir Media Sosial)"},
			{"block-game", "Corporate Firewall (Blokir Game)"},
			{"plc_name=block", "Corporate Firewall"},
			{"disable.htm", "Corporate Internet Gateway"},
		}
		for _, kw := range corporateNetworkKeywords {
			if strings.Contains(pageTitleLower, kw[0]) || strings.Contains(pageTextLower, kw[0]) {
				isCorporateNetwork = true
				corporateNetworkName = kw[1]
				break
			}
		}

		hasBlockIndicator := false
		blockIndicatorKeyword := ""
		blockKeywords := []string{
			"internet positif", "internet-positif", "mercusuar", "blokir", "aduan", 
			"akses diblokir", "access denied", "access_denied", "blocked", "forbidden", "403 forbidden",
		}
		for _, kw := range blockKeywords {
			if strings.Contains(pageTitleLower, kw) || strings.Contains(pageTextLower, kw) {
				hasBlockIndicator = true
				blockIndicatorKeyword = kw
				break
			}
		}

		hasServerErrorIndicator := false
		errorKeywords := []string{
			"500 internal server error", "502 bad gateway", "503 service unavailable", "504 gateway timeout",
			"database error", "system error", "error 500", "error 502", "error 503", "error 504",
		}
		for _, kw := range errorKeywords {
			if strings.Contains(pageTitleLower, kw) || strings.Contains(pageTextLower, kw) {
				hasServerErrorIndicator = true
				break
			}
		}

		if !isChromeOk {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "BROWSER_LOAD_FAILED"
			errDetail := pageTitle
			if errDetail == "" {
				errDetail = "halaman tidak dapat dibuka"
			}
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini tidak dapat diakses 🔴. Sistem pemantau kami sudah mencoba membuka website ini seperti layaknya pengguna biasa, namun gagal — halaman tidak mau terbuka sama sekali (browser menampilkan pesan: \"%s\"). Kemungkinan besar server website sedang mati atau ada gangguan jaringan di sisi server.", w.Name, errDetail)
			recommendedAction = append(recommendedAction, "Coba akses website secara manual. Jika memang tidak bisa dibuka, hubungi tim pengelola server.")
		} else if isCorporateNetwork {
			// Jaringan corporate terdeteksi — website mungkin sebenarnya normal,
			// tapi pemantau kita tertahan di portal/gateway jaringan kantor
			status = string(model.StatusOffline)
			healthScore = 10
			primaryKey = "CORPORATE_NETWORK_RESTRICTED"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini terpantau **tidak dapat diakses dari jaringan ini** 🏢🔒. Pemantau kami mendeteksi bahwa jaringan yang sedang digunakan adalah **jaringan kantor atau kampus yang dibatasi** (teridentifikasi: %s). Jaringan tersebut memiliki aturan yang menghalangi akses ke website tertentu — seperti media sosial, game, atau website luar yang dianggap tidak termasuk dalam kategori kerja.\n\n💡 **Ini bukan berarti website-nya mati.** Website tersebut kemungkinan besar tetap bisa diakses dari jaringan internet biasa (misalnya lewat hotspot pribadi). Namun dari jaringan kantor ini, akses ke website tersebut sengaja dibatasi oleh kebijakan IT kantor/kampus.", w.Name, corporateNetworkName)
			recommendedAction = append(recommendedAction, "Hasil pemantauan dari jaringan kantor ini mungkin tidak mencerminkan kondisi sebenarnya. Coba verifikasi akses website dari jaringan internet biasa (hotspot/ISP rumah).")
		} else if hasBlockIndicator {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "BLOCKED"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini terdeteksi **diblokir** 🚫. Pemantau kami berhasil terhubung ke internet, namun halaman yang tampil bukan website aslinya — melainkan halaman peringatan bahwa akses ke website ini diblokir oleh sistem keamanan atau peraturan internet di Indonesia (terdeteksi kata kunci: \"%s\").", w.Name, blockIndicatorKeyword)
			recommendedAction = append(recommendedAction, "Website mungkin diblokir oleh ISP atau Kominfo. Coba verifikasi menggunakan koneksi internet berbeda.")
		} else if hasServerErrorIndicator {
			status = string(model.StatusCritical)
			healthScore = 20
			primaryKey = "APPLICATION_ERROR"
			pingStr := "gagal"
			if l.ICMPStatus && l.ICMPLatencyMs != nil {
				pingStr = fmt.Sprintf("sukses (%d ms)", *l.ICMPLatencyMs)
			}
			rtVal := 0
			if l.ResponseTimeMs != nil {
				rtVal = *l.ResponseTimeMs
			}
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **gangguan serius** ⚠️. Pemantau kami berhasil membuka halaman websitenya (HTTP Code: %d, Waktu Respon: %d ms, ICMP Ping: %s), namun isi halaman menampilkan pesan error dari server — artinya sistem di balik website ini sedang mengalami masalah internal. Pengguna yang mencoba mengakses website ini kemungkinan akan melihat halaman error juga.", w.Name, httpCode, rtVal, pingStr)
			recommendedAction = append(recommendedAction, "Tim teknis perlu segera memeriksa kondisi server dan database aplikasi.")
		} else if isMigrated {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "SERVICE_MIGRATED"
			pingStr := "gagal"
			if l.ICMPStatus && l.ICMPLatencyMs != nil {
				pingStr = fmt.Sprintf("sukses (%d ms)", *l.ICMPLatencyMs)
			}
			sslStr := "tidak aktif (HTTP)"
			if strings.HasPrefix(w.URL, "https://") {
				if l.SSLValid {
					sslStr = "aktif & valid"
				} else {
					sslStr = "tidak valid"
				}
			}
			rtVal := 0
			if l.ResponseTimeMs != nil {
				rtVal = *l.ResponseTimeMs
			}
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online - Migrasi)** ✅. Pemantau kami berhasil membuka halaman dengan judul \"%s\". Terdeteksi bahwa website ini telah **berpindah alamat** ke lokasi baru (%s). Parameter jaringan terpantau normal: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s.", w.Name, pageTitle, migrationHint, httpCode, rtVal, sslStr, pingStr)
			recommendedAction = append(recommendedAction, "Perbarui URL di sistem monitoring ke alamat yang baru.")
		} else if isSSO || strings.Contains(pageTitleLower, "login") || strings.Contains(pageTitleLower, "sso") || strings.Contains(pageTitleLower, "auth") {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "AUTH_REQUIRED"
			pingStr := "gagal"
			if l.ICMPStatus && l.ICMPLatencyMs != nil {
				pingStr = fmt.Sprintf("sukses (%d ms)", *l.ICMPLatencyMs)
			}
			sslStr := "tidak aktif (HTTP)"
			if strings.HasPrefix(w.URL, "https://") {
				if l.SSLValid {
					sslStr = "aktif & valid"
				} else {
					sslStr = "tidak valid"
				}
			}
			rtVal := 0
			if l.ResponseTimeMs != nil {
				rtVal = *l.ResponseTimeMs
			}
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Pemantau kami berhasil membuka halaman dengan judul \"%s\" menggunakan browser Chrome. Halaman ini adalah halaman login — artinya website aktif dan berjalan dengan parameter: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s. Pengguna perlu login terlebih dahulu untuk masuk.", w.Name, pageTitle, httpCode, rtVal, sslStr, pingStr)
			recommendedAction = append(recommendedAction, "Tidak ada tindakan diperlukan. Layanan berjalan normal.")
		} else {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "OK"
			titleText := pageTitle
			if titleText == "" {
				titleText = "halaman berhasil dimuat"
			}
			pingStr := "gagal"
			if l.ICMPStatus && l.ICMPLatencyMs != nil {
				pingStr = fmt.Sprintf("sukses (%d ms)", *l.ICMPLatencyMs)
			}
			sslStr := "tidak aktif (HTTP)"
			if strings.HasPrefix(w.URL, "https://") {
				if l.SSLValid {
					sslStr = "aktif & valid"
				} else {
					sslStr = "tidak valid"
				}
			}
			rtVal := 0
			if l.ResponseTimeMs != nil {
				rtVal = *l.ResponseTimeMs
			}
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Pemantau kami berhasil memuat halaman website dengan judul \"%s\" menggunakan browser Chrome. Semua parameter terpantau normal: HTTP Code %d OK, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s. Semua layanan tampak berjalan dengan baik dan dapat diakses oleh pengguna.", w.Name, titleText, httpCode, rtVal, sslStr, pingStr)
			if httpCode == 400 || httpCode == 403 || httpCode == 401 {
				interpretation += fmt.Sprintf(" — Catatan: **%s** memblokir alat pemantau otomatis kami (HTTP %d), namun Chrome bot berhasil memverifikasi bahwa website berjalan normal. Status ini sudah ditentukan berdasarkan hasil Chrome bot sebagai sumber kebenaran utama.", w.Name, httpCode)
			}
			recommendedAction = append(recommendedAction, "Tidak ada tindakan diperlukan.")
		}
	} else {
		// Chrome Bot did NOT run (Safety Fallback to direct Go network prober metrics)
		confidence = 60
		pingStr := "gagal"
		if l.ICMPStatus && l.ICMPLatencyMs != nil {
			pingStr = fmt.Sprintf("sukses (%d ms)", *l.ICMPLatencyMs)
		}
		sslStr := "tidak aktif (HTTP)"
		if strings.HasPrefix(w.URL, "https://") {
			if l.SSLValid {
				sslStr = "aktif & valid"
			} else {
				sslStr = "tidak valid"
			}
		}
		rtVal := 0
		if l.ResponseTimeMs != nil {
			rtVal = *l.ResponseTimeMs
		}

		if !dnsOk {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "DNS_RESOLUTION_FAILED"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini **tidak dapat diakses** 🔴. Sistem pemantau kami tidak bisa menemukan alamat server dari nama domain website ini. Ini biasanya terjadi karena domain sudah tidak aktif, atau ada gangguan pada sistem penamaan domain (DNS).", w.Name)
			recommendedAction = append(recommendedAction, "Periksa apakah domain masih aktif dan terdaftar dengan benar.")
		} else if isPrivate && !tcpOk {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "PRIVATE_IP_UNREACHABLE"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini **tidak dapat dijangkau** 🔴. Website ini berada di jaringan internal/privat, namun pemantau kami tidak dapat terhubung ke server tersebut. Kemungkinan server sedang mati atau ada pemisahan jaringan.", w.Name)
			recommendedAction = append(recommendedAction, "Periksa kondisi server dari jaringan lokal secara langsung.")
		} else if dnsOk && !tcpOk {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "CONNECTION_REFUSED"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini **tidak merespons** 🔴. Alamat server berhasil ditemukan (IP: %s), namun ketika pemantau mencoba mengetuk pintu server tersebut, tidak ada jawaban. Server mungkin sedang mati atau memblokir koneksi dari luar.", w.Name, l.IPAddress)
			recommendedAction = append(recommendedAction, "Periksa apakah layanan web server masih berjalan dan tidak diblokir oleh firewall.")
		} else if !tcpOk {
			status = string(model.StatusOffline)
			healthScore = 0
			primaryKey = "NETWORK_UNREACHABLE"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini **tidak dapat dijangkau** 🔴. Pemantau kami tidak bisa menjangkau server website ini sama sekali — seperti mencoba menelepon tapi nomornya tidak dapat dihubungi. Ini biasanya tanda server sedang mati total atau ada gangguan jaringan besar.", w.Name)
			recommendedAction = append(recommendedAction, "Periksa kondisi server dan koneksi jaringan hosting.")
		} else if !tlsOk && strings.HasPrefix(w.URL, "https://") {
			status = string(model.StatusCritical)
			healthScore = 40
			errStr, _ := ev["tls_error"].(string)
			if strings.Contains(strings.ToLower(errStr), "expired") {
				primaryKey = "TLS_CERTIFICATE_EXPIRED"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **masalah keamanan** ⚠️. Server berhasil ditemukan dan dijangkau, namun sertifikat keamanan (SSL) website ini sudah **kedaluwarsa**. Akibatnya, browser pengguna akan menampilkan peringatan \"Koneksi tidak aman\" dan sebagian besar pengguna tidak bisa masuk ke website ini.", w.Name)
			} else {
				primaryKey = "TLS_HOSTNAME_MISMATCH"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **masalah keamanan** ⚠️. Server berhasil dijangkau, namun sertifikat keamanan (SSL) website ini **tidak valid atau tidak cocok** dengan nama domain yang diakses. Pengguna yang mencoba membuka website ini akan melihat peringatan keamanan dari browser mereka.", w.Name)
			}
			recommendedAction = append(recommendedAction, "Tim teknis perlu memperbarui atau memperbaiki sertifikat SSL website.")
		} else if isMigrated {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "SERVICE_MIGRATED"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online - Migrasi)** ✅. Terdeteksi bahwa website ini telah **berpindah ke alamat baru** (%s). Parameter jaringan terpantau normal: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s.", w.Name, migrationHint, httpCode, rtVal, sslStr, pingStr)
			recommendedAction = append(recommendedAction, "Perbarui URL di sistem monitoring ke alamat yang baru.")
		} else if isSSO && httpCode >= 200 && httpCode < 400 {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "OK"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Website aktif dan mengarahkan pengguna ke halaman login untuk masuk. Parameter jaringan terpantau normal: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s.", w.Name, httpCode, rtVal, sslStr, pingStr)
		} else if httpCode >= 200 && httpCode < 400 {
			status = string(model.StatusOnline)
			healthScore = 100
			primaryKey = "OK"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Pemantau kami berhasil memverifikasi website dengan parameter jaringan: HTTP Code %d OK, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s. Semua layanan berjalan dengan baik.", w.Name, httpCode, rtVal, sslStr, pingStr)
		} else if httpCode >= 400 && httpCode < 500 {
			if httpCode == 401 {
				status = string(model.StatusOnline)
				healthScore = 100
				primaryKey = "AUTH_REQUIRED"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Website aktif namun memerlukan login untuk bisa diakses. Parameter jaringan terpantau normal: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s.", w.Name, httpCode, rtVal, sslStr, pingStr)
			} else if httpCode == 403 || wafDetected != "Not Detected" {
				status = string(model.StatusOnline)
				healthScore = 100
				primaryKey = "WAF_PROTECTED"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini berstatus **Normal (Online)** ✅. Website aktif dan terlindungi oleh sistem keamanan (%s) yang membatasi akses dari bot/pemantau otomatis. Parameter jaringan terpantau normal: HTTP Code %d, Waktu Respon %d ms, SSL %s, dan ICMP Ping %s.", w.Name, wafDetected, httpCode, rtVal, sslStr, pingStr)
			} else if httpCode == 404 {
				status = string(model.StatusCritical)
				healthScore = 40
				primaryKey = "PAGE_NOT_FOUND"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **gangguan** ⚠️. Server aktif, namun halaman utama website tidak ditemukan (HTTP Code %d, Waktu Respon %d ms, SSL %s, ICMP Ping %s). Kemungkinan ada perubahan konfigurasi atau file website yang bermasalah.", w.Name, httpCode, rtVal, sslStr, pingStr)
			} else {
				status = string(model.StatusCritical)
				healthScore = 50
				primaryKey = "APPLICATION_ERROR"
				interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **gangguan** ⚠️. Server merespons, namun memberikan kode error (HTTP Code %d, Waktu Respon %d ms, SSL %s, ICMP Ping %s).", w.Name, httpCode, rtVal, sslStr, pingStr)
			}
		} else if httpCode >= 500 {
			status = string(model.StatusCritical)
			healthScore = 20
			primaryKey = "APPLICATION_ERROR"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **gangguan serius** ⚠️. Server memang aktif dan bisa dihubungi, namun sistem di dalamnya sedang mengalami error berat (HTTP Code %d, Waktu Respon %d ms, SSL %s, ICMP Ping %s). Pengguna yang mencoba membuka website ini kemungkinan akan menemui halaman error.", w.Name, httpCode, rtVal, sslStr, pingStr)
		} else {
			status = string(model.StatusCritical)
			healthScore = 10
			primaryKey = "UNKNOWN_ERROR"
			interpretation = fmt.Sprintf("Halo! Website **%s** saat ini mengalami **kondisi tidak diketahui** ⚠️. Pemantau kami tidak bisa menentukan kondisi pastinya — semua indikator memberikan hasil yang tidak jelas. Disarankan untuk memeriksa langsung kondisi website.", w.Name)
		}
	}

	confidenceLabel := ""
	if confidence >= 95 {
		confidenceLabel = "Hampir Pasti"
	} else if confidence >= 80 {
		confidenceLabel = "Sangat Mungkin"
	} else if confidence >= 60 {
		confidenceLabel = "Kemungkinan"
	} else {
		confidenceLabel = "Insufficient Evidence"
	}

	report := map[string]interface{}{
		"primary_key":        primaryKey,
		"evidence":           evidence,
		"interpretation":     interpretation,
		"confidence_score":   confidence,
		"confidence_label":   confidenceLabel,
		"recommended_action": recommendedAction,
	}

	return report, status, healthScore, interpretation
}

func (p *Pool) evaluateFinalStatus(l *model.MonitoringLog, w model.Website, body []byte, extras probeExtras) {
	state := p.getWebsiteState(w.ID)
	state.mu.Lock()
	defer state.mu.Unlock()

	l.ResolverStage = "EVIDENCE_COLLECTION_V2"
	l.IsBrowserAccessible = true

	// 1. IP Classification
	ipClassification := "UNKNOWN"
	if l.IPAddress != "" {
		ip := net.ParseIP(l.IPAddress)
		if ip != nil {
			if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				ipClassification = "PRIVATE"
			} else {
				ipClassification = "PUBLIC"
			}
		}
	}

	// 2. Body Preview & Migration Detection
	bodyPreview := ""
	isMigrated := false
	migrationHint := ""
	if body != nil {
		previewLen := 500
		if len(body) < 500 {
			previewLen = len(body)
		}
		bodyPreview = string(body[:previewLen])
		bodyStr := strings.ToLower(string(body))
		migrationKeywords := []string{
			"migrated", "moved", "dialihkan", "akses melalui",
			"please access via", "gunakan alamat baru", "landing page",
			"telah dipindah", "silakan kunjungi", "has been moved", "has moved to", "please visit",
		}
		for _, kw := range migrationKeywords {
			if strings.Contains(bodyStr, kw) {
				isMigrated = true
				migrationHint = "Keyword: " + kw
				break
			}
		}
		if strings.Contains(bodyStr, "http-equiv=\"refresh\"") {
			isMigrated = true
			migrationHint = "Meta Refresh detected"
		}
	}
	// Detect via Redirect to different domain
	if len(extras.RedirectChain) > 0 {
		lastUrl := extras.RedirectChain[len(extras.RedirectChain)-1]
		if !strings.Contains(lastUrl, w.URL) {
			isMigrated = true
			if migrationHint == "" {
				migrationHint = "Redirect to " + lastUrl
			}
		}
	}

	if extras.DynamicIsMigrated {
		isMigrated = true
		migrationHint = extras.DynamicMigrationHint
	}

	// 3. Build Complete 25-Field Evidence JSON (ALL fields, NO narrative)
	var dnsLatMs, rtMs, ttfbMs, tlsLatMs, statusCodeVal interface{}
	if l.DNSLatencyMs != nil {
		dnsLatMs = *l.DNSLatencyMs
	}
	if l.ResponseTimeMs != nil {
		rtMs = *l.ResponseTimeMs
	}
	if l.TTFBLatencyMs != nil {
		ttfbMs = *l.TTFBLatencyMs
	}
	if l.TLSLatencyMs != nil {
		tlsLatMs = *l.TLSLatencyMs
	}
	if l.StatusCode != nil {
		statusCodeVal = *l.StatusCode
	}

	var sslExpiryStr, tlsErrVal, httpErrVal, migHintVal, cdnVal interface{}
	if extras.SSLExpiry != nil {
		sslExpiryStr = extras.SSLExpiry.Format(time.RFC3339)
	}
	if extras.TLSError != "" {
		tlsErrVal = extras.TLSError
	}
	if l.ErrorMessage != nil && *l.ErrorMessage != "" {
		httpErrVal = *l.ErrorMessage
	}
	if migrationHint != "" {
		migHintVal = migrationHint
	}
	if extras.CDNProvider != "" {
		cdnVal = extras.CDNProvider
	}

	allIPs := extras.AllResolvedIPs
	if allIPs == nil {
		allIPs = []string{}
	}
	redirects := extras.RedirectChain
	if redirects == nil {
		redirects = []string{}
	}

	evidence := map[string]interface{}{
		// ── DNS ──────────────────────────────
		"dns_resolved":      l.DNSResolved,
		"dns_latency_ms":    dnsLatMs,
		"ip_address":        l.IPAddress,
		"all_resolved_ips":  allIPs,
		"ip_classification": ipClassification,
		// ── TCP ──────────────────────────────
		"tcp_connected":  l.TCPPortOpen,
		"tcp_latency_ms": extras.TCPLatencyMs,
		"icmp_status":    l.ICMPStatus,
		"icmp_latency_ms": func() interface{} {
			if l.ICMPLatencyMs != nil {
				return *l.ICMPLatencyMs
			}
			return nil
		}(),
		// ── TLS ──────────────────────────────
		"tls_handshake_ok": l.SSLValid,
		"tls_latency_ms":   tlsLatMs,
		"tls_cert_issuer":  extras.SSLIssuer,
		"tls_cert_expiry":  sslExpiryStr,
		"tls_error":        tlsErrVal,
		// ── HTTP ─────────────────────────────
		"http_status_code": statusCodeVal,
		"response_time_ms": rtMs,
		"ttfb_ms":          ttfbMs,
		"redirect_count":   len(redirects),
		"redirect_chain":   redirects,
		"content_type":     extras.ContentType,
		"server_header":    extras.ServerHeader,
		"is_cdn":           extras.IsCDN,
		"cdn_provider":     cdnVal,
		"http_error":       httpErrVal,
		// ── Fingerprint ──────────────────────────
		"waf_detected":     extras.WAFDetected,
		"hosting_asn":      extras.HostingASN,
		"hosting_provider": extractHostingProvider(extras.HostingASN),

		// ── Body ─────────────────────────────
		"response_body_preview": bodyPreview,
		"is_migrated":           isMigrated,
		"migration_hint":        migHintVal,
		"chrome_success":        state.lastChromeSuccess,
		"screenshot":            extras.Screenshot,
		"page_title":            extras.PageTitle,
		"page_text_preview":     func() string {
			if len(extras.PageText) > 500 {
				return extras.PageText[:500]
			}
			return extras.PageText
		}(),
	}

	report, correlatedStatus, correlatedHealth, correlatedRecommendation := p.correlateInvestigation(l, w, evidence, isMigrated, migrationHint)
	evidence["investigation_report"] = report

	jsonBytes, jerr := json.MarshalIndent(evidence, "", "  ")
	if jerr == nil {
		l.RootCause = string(jsonBytes)
	} else {
		l.RootCause = `{"error":"failed to marshal evidence"}`
	}
	l.Recommendation = correlatedRecommendation
	l.FinalReason = "Evidence Collected"
	l.FinalDecisionSource = "EVIDENCE_COLLECTION_V2"

	// 4. Status Classification based on correlation
	l.Status = model.LogStatus(correlatedStatus)
	l.HealthScore = correlatedHealth
	if l.Status == model.StatusOffline || l.Status == model.StatusCritical {
		l.IsBrowserAccessible = false
	}

	// Anti-Flapping (2-failure rule)
	if l.Status != model.StatusOnline && l.Status != model.StatusWarning { // Warning (like Intranet unreachable) is allowed to flap instantly or stay warning
		state.consecutiveFailures++
		if state.consecutiveFailures < 2 && state.lastStatus == model.StatusOnline {
			l.Status = model.StatusOnline
			l.FinalDecisionSource += "_FLAPPING_PENDING"
			return
		}
	} else {
		state.consecutiveFailures = 0
	}

	if l.Status != state.lastStatus {
		state.lastStatus = l.Status
		state.statusStartTime = time.Now()
	}
}

func (p *Pool) saveAndBroadcast(w model.Website, logEntry *model.MonitoringLog, workerID int) {
	ctx := context.Background()

	// Update Prometheus metrics
	metrics.TotalChecks.Inc()
	metrics.MonitoringDuration.WithLabelValues(w.Name, string(logEntry.Status)).Observe(time.Since(logEntry.CheckedAt).Seconds())
	if logEntry.Status != model.StatusOnline {
		metrics.FailedChecks.Inc()
	}

	prevStatus, err := p.repo.GetLatestStatus(ctx, w.ID)
	statusChanged := err == nil && prevStatus != "" && prevStatus != string(logEntry.Status)

	if err := p.repo.InsertLogEnhanced(ctx, logEntry); err != nil {
		log.Printf("[Worker] Failed to insert log for %s: %v", w.Name, err)
		return
	}

	if statusChanged {
		event := &model.StatusEvent{
			WebsiteID:   w.ID,
			WebsiteName: w.Name,
			OldStatus:   prevStatus,
			NewStatus:   string(logEntry.Status),
		}
		if err := p.repo.InsertStatusEvent(ctx, event); err != nil {
			log.Printf("[Worker] Failed to insert status_event for %s: %v", w.Name, err)
		}

		// Incident Auto-Trigger & Auto-Resolve
		inMaintenance, _ := p.repo.GetActiveMaintenanceForWebsite(ctx, w.ID)

		if logEntry.Status != model.StatusOnline && !inMaintenance {
			// Check if there is an active incident
			activeInc, err := p.repo.GetActiveIncidentByWebsite(ctx, w.ID)
			if err != nil || activeInc == nil {
				// Create new incident
				title := fmt.Sprintf("Website %s is %s", w.Name, logEntry.Status)
				severity := "WARNING"
				if logEntry.Status == model.StatusCritical || logEntry.Status == model.StatusOffline {
					severity = "CRITICAL"
				}
				inc := &model.Incident{
					WebsiteID: w.ID,
					Title:     title,
					Status:    "TRIGGERED",
					Severity:  severity,
				}
				createdInc, err := p.repo.CreateIncident(ctx, inc)
				if err == nil {
					hist := &model.IncidentHistory{
						IncidentID: createdInc.ID,
						Username:   "SYSTEM",
						Action:     "TRIGGER",
						Details:    fmt.Sprintf("System auto-triggered incident: status changed from %s to %s", prevStatus, logEntry.Status),
					}
					_ = p.repo.InsertIncidentHistory(ctx, hist)
				}
			}
		} else if logEntry.Status == model.StatusOnline {
			// Auto-resolve any active incident
			activeInc, err := p.repo.GetActiveIncidentByWebsite(ctx, w.ID)
			if err == nil && activeInc != nil {
				now := time.Now()
				activeInc.Status = "RESOLVED"
				activeInc.ResolvedAt = &now
				err = p.repo.UpdateIncident(ctx, activeInc)
				if err == nil {
					hist := &model.IncidentHistory{
						IncidentID: activeInc.ID,
						Username:   "SYSTEM",
						Action:     "RESOLVE",
						Details:    "System auto-resolved incident because website returned to ONLINE status",
					}
					_ = p.repo.InsertIncidentHistory(ctx, hist)
				}
			}
		}

		// Incident Grouping: Check if many sites are failing
		if logEntry.Status == model.StatusOffline || logEntry.Status == model.StatusCritical {
			p.trackFailure()
		}

		p.hub.Broadcast("status_change", model.WSStatusChange{
			Type:           "status_change",
			Website:        w.Name,
			WebsiteID:      w.ID.String(),
			URL:            w.URL,
			OldStatus:      prevStatus,
			NewStatus:      string(logEntry.Status),
			RootCause:      logEntry.RootCause,
			IPAddress:      logEntry.IPAddress,
			ResponseTimeMs: logEntry.ResponseTimeMs,
			Timestamp:      logEntry.CheckedAt,
		})
		log.Printf("[Worker] STATUS CHANGE %s: %s → %s (%s)", w.Name, prevStatus, logEntry.Status, logEntry.RootCause)

		if p.notif != nil {
			go p.notif.NotifyStatusChange(w.Name, prevStatus, string(logEntry.Status), logEntry.RootCause)
		}
	}

	p.hub.Broadcast("monitor_update", model.WSMonitorUpdate{
		WebsiteID:           w.ID.String(),
		WebsiteName:         w.Name,
		URL:                 w.URL,
		Status:              logEntry.Status,
		IPAddress:           logEntry.IPAddress,
		DNSResolved:         logEntry.DNSResolved,
		DNSLatencyMs:        logEntry.DNSLatencyMs,
		ICMPStatus:          logEntry.ICMPStatus,
		ICMPLatencyMs:       logEntry.ICMPLatencyMs,
		TCPPortOpen:         logEntry.TCPPortOpen,
		TLSLatencyMs:        logEntry.TLSLatencyMs,
		TTFBLatencyMs:       logEntry.TTFBLatencyMs,
		StatusCode:          logEntry.StatusCode,
		ResponseTimeMs:      logEntry.ResponseTimeMs,
		SSLValid:            logEntry.SSLValid,
		SSLExpiryDate:       logEntry.SSLExpiryDate,
		ErrorMessage:        logEntry.ErrorMessage,
		RootCause:           logEntry.RootCause,
		Recommendation:      logEntry.Recommendation,
		HealthScore:         logEntry.HealthScore,
		Confidence:          logEntry.Confidence,
		IsBrowserAccessible: logEntry.IsBrowserAccessible,
		FinalReason:         logEntry.FinalReason,
		FinalDecisionSource: logEntry.FinalDecisionSource,
		ResolverStage:       logEntry.ResolverStage,
		CheckedAt:           logEntry.CheckedAt,
	})

	rtVal := 0
	if logEntry.ResponseTimeMs != nil {
		rtVal = *logEntry.ResponseTimeMs
	}

	slog.Info("Website check completed",
		slog.String("website_name", w.Name),
		slog.String("website_id", w.ID.String()),
		slog.String("url", w.URL),
		slog.String("status", string(logEntry.Status)),
		slog.Int("response_time_ms", rtVal),
		slog.Bool("dns_resolved", logEntry.DNSResolved),
		slog.Bool("tcp_port_open", logEntry.TCPPortOpen),
		slog.String("ip_address", logEntry.IPAddress),
		slog.Int("worker_id", workerID),
		slog.Duration("execution_time", time.Since(logEntry.CheckedAt)),
	)
}

func extractHost(rawURL string) string {
	for _, prefix := range []string{"https://", "http://"} {
		if strings.HasPrefix(rawURL, prefix) {
			rawURL = rawURL[len(prefix):]
			break
		}
	}
	for i, c := range rawURL {
		if c == '/' || c == ':' || c == '?' {
			return rawURL[:i]
		}
	}
	return rawURL
}

func (p *Pool) getASN(ip string) string {
	if ip == "" {
		return ""
	}
	if val, ok := p.asnCache.Get(ip); ok {
		return val
	}

	// External Lookup to ip-api.com
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://ip-api.com/json/" + ip)
	if err != nil {
		return "Unknown"
	}
	defer resp.Body.Close()

	var data struct {
		As  string `json:"as"`
		Org string `json:"org"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "Unknown"
	}

	val := data.As
	if data.Org != "" && !strings.Contains(data.As, data.Org) {
		val = data.As + " (" + data.Org + ")"
	}
	if val == "" {
		val = "Unknown"
	}

	p.asnCache.Set(ip, val)
	return val
}

func (p *Pool) healthMonitor() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			p.updateHealth()
			p.hub.Broadcast("system_health", p.health)
		}
	}
}

func (p *Pool) SetNetworkReader(reader NetworkContextReader) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.netReader = reader
}

func (p *Pool) updateHealth() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.health.ActiveWorkers = p.workerSize
	p.health.WorkerQueueSize = len(p.jobs)
	p.health.ActiveGoroutines = runtime.NumGoroutine()
	p.health.WSConnections = p.hub.ConnectionCount()

	// Update Prometheus metric gauges
	metrics.ActiveWorkers.Set(float64(p.workerSize))
	metrics.WorkerQueueSize.Set(float64(len(p.jobs)))
	metrics.WebsocketClients.Set(float64(p.hub.ConnectionCount()))
	p.health.BackendCPU = GetSystemCPUUsage()
	p.health.BackendRAM = GetSystemRAMUsage()
	p.health.MonitorLatencyMs = p.monitorBaselineLatMs
	p.health.UpdatedAt = time.Now()

	if p.netReader != nil {
		netCtx := p.netReader.GetCurrentContext()
		p.health.PublicIP = netCtx.PublicIP
		p.health.NetworkType = netCtx.NetworkType
		p.health.NetworkName = netCtx.ConnectionName
		p.health.InterfaceAlias = netCtx.InterfaceAlias
		p.health.LocalGateway = netCtx.LocalGateway
		p.health.DNSResolver = netCtx.DNSResolver
	}
}

func (p *Pool) GetHealth() model.SystemHealth {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.health
}

func (p *Pool) getWebsiteState(id uuid.UUID) *websiteState {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.websiteStates[id]; ok {
		return s
	}
	s := &websiteState{
		recentLatencies: []int{},
		statusStartTime: time.Now(),
		lastStatus:      model.StatusOffline,
	}
	p.websiteStates[id] = s
	return s
}

func (p *Pool) trackFailure() {
	p.muFails.Lock()
	defer p.muFails.Unlock()

	now := time.Now()
	p.recentFails = append(p.recentFails, now)

	// Clean up old fails (older than 10s)
	cutoff := now.Add(-10 * time.Second)
	newFails := []time.Time{}
	for _, t := range p.recentFails {
		if t.After(cutoff) {
			newFails = append(newFails, t)
		}
	}
	p.recentFails = newFails

	if len(p.recentFails) >= 5 {
		// Potential mass incident
		p.hub.Broadcast("system_alert", map[string]interface{}{
			"type":  "INCIDENT_GROUP",
			"count": len(p.recentFails),
			"msg":   "Mass Incident Detected: Multiple services failing simultaneously.",
		})
	}
}

func (p *Pool) scanForDynamicAlerts(ctx context.Context, client *http.Client, baseURL string, body []byte) (bool, string) {
	bodyStr := string(body)

	// Regex to find endpoints in script files or body
	// Matching: url: '...' or url: "..." or url:"..." or url : '...'
	re := regexp.MustCompile(`(?i)(?:url|href)\s*:\s*['"]([^'"]*(?:alert|announcement|migration|pemberitahuan|notice)[^'"]*)['"]`)
	matches := re.FindAllStringSubmatch(bodyStr, -1)

	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		endpoint := match[1]

		// Resolve relative URL
		absoluteURL := endpoint
		if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
			base, err := url.Parse(baseURL)
			if err != nil {
				continue
			}
			rel, err := url.Parse(endpoint)
			if err != nil {
				continue
			}
			absoluteURL = base.ResolveReference(rel).String()
		}

		// Try POST with Content-Length 0 (needed by Peluit)
		reqPost, err := http.NewRequestWithContext(ctx, "POST", absoluteURL, nil)
		if err == nil {
			reqPost.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
			reqPost.Header.Set("Content-Length", "0")
			respPost, errPost := client.Do(reqPost)
			if errPost == nil {
				bodyPost, _ := io.ReadAll(respPost.Body)
				respPost.Body.Close()
				if isMigrated, hint := analyzeAlertBody(bodyPost); isMigrated {
					return true, hint
				}
			}
		}

		// Try GET as fallback
		reqGet, err := http.NewRequestWithContext(ctx, "GET", absoluteURL, nil)
		if err == nil {
			reqGet.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
			respGet, errGet := client.Do(reqGet)
			if errGet == nil {
				bodyGet, _ := io.ReadAll(respGet.Body)
				respGet.Body.Close()
				if isMigrated, hint := analyzeAlertBody(bodyGet); isMigrated {
					return true, hint
				}
			}
		}
	}

	return false, ""
}

func analyzeAlertBody(body []byte) (bool, string) {
	if len(body) == 0 {
		return false, ""
	}

	// Try JSON parsing
	var jsonMap map[string]interface{}
	if err := json.Unmarshal(body, &jsonMap); err == nil {
		for _, key := range []string{"MESSAGE", "message", "text", "content", "msg"} {
			if val, ok := jsonMap[key].(string); ok && val != "" {
				valLower := strings.ToLower(val)
				migrationKeywords := []string{
					"migrated", "moved", "dialihkan", "akses melalui",
					"please access via", "gunakan alamat baru", "landing page",
					"telah dipindah", "silakan kunjungi", "has been moved", "has moved to", "please visit",
				}
				for _, kw := range migrationKeywords {
					if strings.Contains(valLower, kw) {
						return true, stripHTML(val)
					}
				}
			}
		}
	}

	// Plain text fallback
	bodyStr := string(body)
	bodyLower := strings.ToLower(bodyStr)
	migrationKeywords := []string{
		"migrated", "moved", "dialihkan", "akses melalui",
		"please access via", "gunakan alamat baru", "landing page",
		"telah dipindah", "silakan kunjungi", "has been moved", "has moved to", "please visit",
	}
	for _, kw := range migrationKeywords {
		if strings.Contains(bodyLower, kw) {
			return true, stripHTML(bodyStr)
		}
	}

	return false, ""
}

func stripHTML(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return strings.TrimSpace(re.ReplaceAllString(s, ""))
}

func (p *Pool) runHeadlessDiagnostic(ctx context.Context, targetURL string, saveScreenshot bool) (string, string, string, error) {
	// Concurrency control: acquire semaphore slot
	select {
	case p.chromeSem <- struct{}{}:
		defer func() { <-p.chromeSem }()
	case <-ctx.Done():
		return "", "", "", ctx.Err()
	}

	onDemand := os.Getenv("CHROME_ON_DEMAND") == "true"

	var chromeCtx context.Context
	var cancelChrome context.CancelFunc
	var allocCancel context.CancelFunc

	if onDemand {
		slog.Info("[Headless] Launching fresh Chrome on-demand instance", "url", targetURL)
		opts := getChromeOpts()
		var allocCtx context.Context
		allocCtx, allocCancel = chromedp.NewExecAllocator(ctx, opts...)
		
		var cancel context.CancelFunc
		chromeCtx, cancel = chromedp.NewContext(allocCtx)
		cancelChrome = func() {
			cancel()
			allocCancel()
		}
	} else {
		if err := p.ensureBrowser(); err != nil {
			return "", "", "", fmt.Errorf("chrome not available: %w", err)
		}
		// Create a context with timeout derived from the shared browser context
		tabCtx, cancelTab := context.WithTimeout(p.browserCtx, 40*time.Second)
		
		var cancel context.CancelFunc
		chromeCtx, cancel = chromedp.NewContext(tabCtx)
		cancelChrome = func() {
			cancel()
			cancelTab()
		}
	}
	defer cancelChrome()

	var pageText string
	var pageTitle string
	var buf []byte

	// Construct actions list dynamically
	actions := []chromedp.Action{
		chromedp.ActionFunc(func(ctx context.Context) error {
			_, err := page.AddScriptToEvaluateOnNewDocument(`
				// 1. Overwrite navigator.webdriver to undefined
				Object.defineProperty(navigator, 'webdriver', {
					get: () => undefined
				});

				// 2. Mock navigator.plugins to be non-empty
				if (typeof PluginArray !== 'undefined') {
					const mockPlugins = [
						{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
						{ name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
					];
					const pluginList = [];
					for (let i = 0; i < mockPlugins.length; i++) {
						const p = mockPlugins[i];
						const plugin = Object.create(Plugin.prototype);
						Object.defineProperties(plugin, {
							name: { get: () => p.name },
							filename: { get: () => p.filename },
							description: { get: () => p.description },
							length: { get: () => 0 }
						});
						pluginList.push(plugin);
					}
					Object.defineProperty(navigator, 'plugins', {
						get: () => {
							const list = [...pluginList];
							Object.defineProperty(list, 'length', { get: () => mockPlugins.length });
							list.item = (index) => list[index];
							list.namedItem = (name) => list.find(p => p.name === name);
							return list;
						}
					});
				}

				// 3. Mock languages
				Object.defineProperty(navigator, 'languages', {
					get: () => ['en-US', 'en']
				});

				// 4. Mock window.chrome
				window.chrome = {
					app: {
						isInstalled: false,
						InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
						RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
					},
					runtime: {
						OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
						OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
						PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
						PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
						PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
						RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
					}
				};

				// 5. Mock WebGL vendor/renderer
				if (typeof WebGLRenderingContext !== 'undefined') {
					const getParameter = WebGLRenderingContext.prototype.getParameter;
					WebGLRenderingContext.prototype.getParameter = function(parameter) {
						// UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
						if (parameter === 0x9245) {
							return 'Intel Inc.';
						}
						if (parameter === 0x9246) {
							return 'Intel(R) UHD Graphics 620';
						}
						return getParameter.apply(this, arguments);
					};
				}

				// 6. Spoof navigator.userAgentData to match Chrome 148
				if (navigator.userAgentData) {
					const mockData = {
						brands: [
							{ brand: 'Google Chrome', version: '148' },
							{ brand: 'Not(A:Brand', version: '8' },
							{ brand: 'Chromium', version: '148' }
						],
						mobile: false,
						platform: 'Windows'
					};
					Object.defineProperty(navigator, 'userAgentData', {
						get: () => mockData
					});
				}
			`).Do(ctx)
			return err
		}),
		chromedp.Navigate(targetURL),
		chromedp.Sleep(3 * time.Second), // Let Javascript/SPA load
		chromedp.Title(&pageTitle),
		chromedp.Evaluate(`document.body.innerText`, &pageText),
	}

	if saveScreenshot && os.Getenv("SAVE_SCREENSHOT") != "false" {
		actions = append(actions, chromedp.CaptureScreenshot(&buf))
	}

	err := chromedp.Run(chromeCtx, actions...)

	if err != nil {
		if !onDemand {
			// If the error indicates browser connection was lost, cancel browser to force re-init next time
			errStr := err.Error()
			if strings.Contains(errStr, "channel is closed") || strings.Contains(errStr, "connection refused") || strings.Contains(errStr, "invalid session") {
				p.mu.Lock()
				if p.browserCancel != nil {
					p.browserCancel()
				}
				p.mu.Unlock()
			}
		}
		return "", "", "", err
	}

	base64Str := ""
	if len(buf) > 0 {
		base64Str = base64.StdEncoding.EncodeToString(buf)
	}

	if onDemand {
		slog.Info("[Headless] Closed on-demand Chrome instance cleanly", "url", targetURL)
	}
	return base64Str, pageText, pageTitle, nil
}

func getChromeOpts() []chromedp.ExecAllocatorOption {
	return []chromedp.ExecAllocatorOption{
		chromedp.NoSandbox,
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("headless", "new"), // Use newer headless engine
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("enable-features", "NetworkService,NetworkServiceInProcess"),
		chromedp.Flag("disable-background-timer-throttling", true),
		chromedp.Flag("disable-backgrounding-occluded-windows", true),
		chromedp.Flag("disable-breakpad", true),
		chromedp.Flag("disable-client-side-phishing-detection", true),
		chromedp.Flag("disable-default-apps", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-features", "site-per-process,Translate,BlinkGenPropertyTrees"),
		chromedp.Flag("disable-hang-monitor", true),
		chromedp.Flag("disable-ipc-flooding-protection", true),
		chromedp.Flag("disable-popup-blocking", true),
		chromedp.Flag("disable-prompt-on-repost", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("disable-sync", true),
		chromedp.Flag("force-color-profile", "srgb"),
		chromedp.Flag("metrics-recording-only", true),
		chromedp.Flag("safebrowsing-disable-auto-update", true),
		chromedp.Flag("password-store", "basic"),
		chromedp.Flag("use-mock-keychain", true),

		chromedp.Flag("ignore-certificate-errors", "true"),
		chromedp.Flag("disable-web-security", "true"),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.217 Safari/537.36"),
		chromedp.Flag("window-size", "1920,1080"),
	}
}

func (p *Pool) ensureBrowser() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.browserCtx == nil || p.browserCtx.Err() != nil {
		slog.Warn("Shared Chrome browser not running or crashed. Re-initializing...")
		if p.browserCancel != nil {
			p.browserCancel()
		}
		if p.allocCancel != nil {
			p.allocCancel()
		}

		opts := getChromeOpts()
		allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
		browserCtx, browserCancel := chromedp.NewContext(allocCtx)

		// Run an empty action to spawn the process
		if err := chromedp.Run(browserCtx); err != nil {
			allocCancel()
			return fmt.Errorf("failed to start Chrome: %w", err)
		}

		p.allocCancel = allocCancel
		p.browserCtx = browserCtx
		p.browserCancel = browserCancel
		slog.Info("Shared Chrome browser initialized/re-initialized successfully")
	}
	return nil
}

func cleanPageTextExcerpt(text string, keyword string) string {
	text = strings.ReplaceAll(text, "\n", " ")
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	
	idx := strings.Index(strings.ToLower(text), strings.ToLower(keyword))
	if idx == -1 {
		if len(text) > 150 {
			return text[:150] + "..."
		}
		return text
	}
	
	start := idx - 50
	if start < 0 {
		start = 0
	}
	end := idx + 100
	if end > len(text) {
		end = len(text)
	}
	
	excerpt := text[start:end]
	if start > 0 {
		excerpt = "..." + excerpt
	}
	if end < len(text) {
		excerpt = excerpt + "..."
	}
	return strings.TrimSpace(excerpt)
}

func PingHost(host string) (bool, int) {
	if host == "" {
		return false, 0
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ping", "-n", "1", host)
	outputBytes, err := cmd.Output()
	if err != nil {
		return false, 0
	}

	output := string(outputBytes)
	re := regexp.MustCompile(`(?i)(?:time|waktu)\s*[=<]\s*(\d+)\s*ms`)
	match := re.FindStringSubmatch(output)
	if len(match) > 1 {
		lat, err := strconv.Atoi(match[1])
		if err == nil {
			return true, lat
		}
	}

	reAvg := regexp.MustCompile(`(?i)(?:Average|Rata-rata)\s*=\s*(\d+)\s*ms`)
	matchAvg := reAvg.FindStringSubmatch(output)
	if len(matchAvg) > 1 {
		lat, err := strconv.Atoi(matchAvg[1])
		if err == nil {
			return true, lat
		}
	}

	return false, 0
}

func extractHostingProvider(asnStr string) string {
	if asnStr == "" || asnStr == "Unknown" {
		return "Unknown"
	}
	if strings.Contains(asnStr, "(") && strings.Contains(asnStr, ")") {
		start := strings.Index(asnStr, "(")
		end := strings.Index(asnStr, ")")
		if start < end {
			return asnStr[start+1 : end]
		}
	}
	parts := strings.Fields(asnStr)
	if len(parts) > 1 && strings.HasPrefix(strings.ToUpper(parts[0]), "AS") {
		return strings.Join(parts[1:], " ")
	}
	return asnStr
}

func isPrivateIPAddress(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()
}

func lookupPublicDNS(ctx context.Context, host string) ([]string, error) {
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{
				Timeout: 3 * time.Second,
			}
			return d.DialContext(ctx, "udp", "8.8.8.8:53")
		},
	}
	return r.LookupHost(ctx, host)
}

