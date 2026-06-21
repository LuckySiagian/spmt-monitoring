package worker

import (
	"context"
	"crypto/tls"
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
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

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
	muFails              sync.Mutex
	monitorBaselineLatMs int
	netReader            NetworkContextReader
	asnCache             *ASNCache
	chromeSem            chan struct{}
	allocCancel          context.CancelFunc
	browserCtx           context.Context
	browserCancel        context.CancelFunc

	// monitorInternetHealthy() cache — avoids re-probing the node's own connectivity
	// on every status change. Guarded by netHealthMu.
	netHealthMu        sync.Mutex
	netHealthOK        bool
	netHealthCheckedAt time.Time
}

type websiteState struct {
	mu                   sync.Mutex
	consecutiveFailures  int
	recentLatencies      []int
	lastStatus           model.LogStatus
	statusStartTime      time.Time
	lastHeadlessCheck    time.Time
	lastChromeSuccess    bool   // True if the last executed Chrome diagnostic succeeded
	lastChromeTitle      string // Last loaded page title from Chrome diagnostic
	lastChromeScreenshot string // Last captured screenshot (base64)
	lastChromePageText   string // Cached page text
}

// probeExtras carries additional evidence that doesn't fit in MonitoringLog.
// All fields here are collected during probing and serialized into the evidence JSON.
type probeExtras struct {
	AllResolvedIPs       []string   // All IPs returned by DNS
	RedirectChain        []string   // Full HTTP redirect chain
	ContentType          string     // HTTP Content-Type header
	ServerHeader         string     // HTTP Server header
	CDNProvider          string     // CDN name if detected (e.g. "Cloudflare")
	IsCDN                bool       // True if CDN signature was detected
	TLSError             string     // TLS/SSL error code (no narrative, machine-readable)
	TCPLatencyMs         int        // TCP connect latency in milliseconds
	SSLIssuer            string     // SSL certificate issuer (from strict SSL check)
	SSLExpiry            *time.Time // SSL certificate expiry date
	WAFDetected          string     // Name of WAF if detected, or "Not Detected"
	DynamicIsMigrated    bool
	DynamicMigrationHint string
	Screenshot           string // Base64 screenshot image if taken during headless check
	PageTitle            string // Title of page loaded by headless browser
	PageText             string // Body text loaded by headless browser
}

func NewPool(repo *repository.Repository, hub *ws.Hub, notif *notification.Service, workerSize int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
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
	// Incident escalation auto-notifications were removed: re-alerting an unhandled
	// incident every cycle produced Telegram spam. Telegram now pings only on the
	// real transitions (OFFLINE / CRITICAL / recovery to ONLINE) via NotifyStatusChange.
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
	go p.check(w, -1, true)
}

func (p *Pool) RevalidateAll() {
	websites, err := p.repo.GetAllWebsites(context.Background())
	if err != nil {
		slog.Error("Failed to load websites for revalidation", slog.Any("error", err))
		return
	}

	slog.Info("Triggering instant revalidation", slog.Int("count", len(websites)))

	// Reset states to ensure fresh diagnosis
	p.mu.Lock()
	p.websiteStates = make(map[uuid.UUID]*websiteState)
	p.mu.Unlock()

	for _, w := range websites {
		go p.check(*w, -1, true)
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

func (p *Pool) checkSSL(host string, ip string, manual bool) (bool, *time.Time, string, string, string) {
	sslTimeout := 10 * time.Second
	if manual {
		sslTimeout = 2 * time.Second
	}
	dialer := &net.Dialer{Timeout: sslTimeout}
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

	// 2. SSL/TLS Validation (Source of Truth — strict check, no InsecureSkipVerify)
	isHTTPS := strings.HasPrefix(w.URL, "https://")
	if isHTTPS {
		sslOk, expiry, rc, _, issuer := p.checkSSL(host, l.IPAddress, manual)
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
			dialTimeout := 20 * time.Second
			if manual {
				dialTimeout = 2 * time.Second
			}
			dialer := &net.Dialer{
				// 20s (naik dari 10s): beri server yang lambat-tapi-hidup cukup waktu
				// menyelesaikan handshake TCP, agar tidak dicap OFFLINE padahal hanya lambat.
				Timeout:   dialTimeout,
				KeepAlive: 30 * time.Second,
			}
			return dialer.DialContext(ctx, network, targetAddr)
		},
	}
	_ = http2.ConfigureTransport(transport)

	clientTimeout := 40 * time.Second
	if manual {
		clientTimeout = 2 * time.Second
	}
	client := &http.Client{
		// 40s total (naik dari 30s): muat untuk dial 20s + TLS handshake + respons lambat,
		// sehingga situs lambat jatuh ke WARNING (>3s) — bukan OFFLINE karena timeout dini.
		Timeout: clientTimeout,
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

	// If HTTPS request fails, try plain HTTP as fallback — but with a SHORTER timeout.
	// If HTTPS already timed out (~20s), re-trying HTTP for another full 20s would make
	// an OFFLINE verdict take ~40s and report a misleading 40000ms "response time". A
	// 10s fallback is enough to tell whether port 80 is open, capping the worst case at
	// ~30s without losing the "HTTPS blocked but HTTP reachable" detection.
	if httpErr != nil && isHTTPS {
		if strings.Contains(httpErr.Error(), "refused") || strings.Contains(httpErr.Error(), "timeout") {
			fbTimeout := 10 * time.Second
			if manual {
				fbTimeout = 2 * time.Second
			}
			fbClient := &http.Client{Timeout: fbTimeout, Jar: jar, Transport: transport, CheckRedirect: client.CheckRedirect}
			fallbackURL := strings.Replace(w.URL, "https://", "http://", 1)
			fallbackReq, _ := http.NewRequest("GET", fallbackURL, nil)
			fallbackReq.Header = req.Header.Clone()
			fallbackResp, fallbackErr := fbClient.Do(fallbackReq)
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
		// Limit body read to 1MB to protect the monitor from oversized responses.
		body, _ = io.ReadAll(io.LimitReader(resp.Body, 1*1024*1024))

		// Dynamic alert / migration scanning DISABLED: content-based heuristics must
		// not influence status determination. Status is DNS + HTTP only.

		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
		code := resp.StatusCode
		l.StatusCode = &code

		// Collect response headers into extras
		extras.ContentType = resp.Header.Get("Content-Type")
		extras.ServerHeader = resp.Header.Get("Server")

		// WAF / edge detection. Used downstream to tell a genuine application
		// 4xx apart from our monitoring agent being fingerprinted as a bot by an
		// edge/WAF (see the bot-block refinement in evaluateFinalStatus).
		extras.WAFDetected = "Not Detected"
		serverLower := strings.ToLower(extras.ServerHeader)
		viaLower := strings.ToLower(resp.Header.Get("Via"))
		hasXCache := resp.Header.Get("X-Cache") != "" || resp.Header.Get("X-Cache-Hits") != ""
		if resp.Header.Get("x-sucuri-id") != "" || serverLower == "sucuri/cloudproxy" {
			extras.WAFDetected = "Sucuri WAF"
		} else if resp.Header.Get("x-amz-cf-id") != "" || strings.Contains(serverLower, "cloudfront") {
			extras.WAFDetected = "AWS WAF / CloudFront"
		} else if resp.Header.Get("cf-ray") != "" || serverLower == "cloudflare" {
			extras.WAFDetected = "Cloudflare"
		} else if resp.Header.Get("x-waf-name") != "" {
			extras.WAFDetected = resp.Header.Get("x-waf-name")
		} else if strings.Contains(serverLower, "akamai") || strings.Contains(viaLower, "akamai") {
			extras.WAFDetected = "Akamai"
		} else if strings.Contains(serverLower, "imperva") || strings.Contains(serverLower, "incapsula") || resp.Header.Get("x-iinfo") != "" {
			extras.WAFDetected = "Imperva WAF"
		} else if strings.Contains(serverLower, "fastly") || strings.Contains(viaLower, "varnish") {
			extras.WAFDetected = "Fastly"
		}

		// CDN/edge presence — a broader signal than WAF, used as a secondary
		// hint that a 403/429 is bot-fingerprinting rather than a real outage.
		cfRay := resp.Header.Get("Cf-Ray")
		if strings.Contains(serverLower, "cloudflare") || cfRay != "" {
			extras.IsCDN = true
			extras.CDNProvider = "Cloudflare"
		} else if extras.WAFDetected != "Not Detected" {
			extras.IsCDN = true
			extras.CDNProvider = extras.WAFDetected
		} else if viaLower != "" || hasXCache {
			extras.IsCDN = true
			extras.CDNProvider = "CDN/Edge"
		}
	}

	// ─── Headless Chrome Diagnostic: DISABLED ────────────────────
	// Chrome, screenshots, DOM/keyword content analysis, and migration detection are
	// intentionally removed from the status path. They were the primary source of
	// false positives (a Chrome OOM/timeout marked every site OFFLINE; a single
	// keyword like "iag"/"error"/"forbidden" in page text flipped healthy sites to
	// OFFLINE/CRITICAL). Status is now decided purely from DNS + HTTP telemetry.
	extras.Screenshot = ""
	extras.PageTitle = ""
	extras.PageText = ""

	icmpOk, icmpLat := PingHost(host)
	l.ICMPStatus = icmpOk
	if icmpOk {
		l.ICMPLatencyMs = &icmpLat
	} else {
		l.ICMPLatencyMs = nil
	}

	p.evaluateFinalStatus(l, w, body, extras, manual)

	// Final Safety: If status is still unknown, it's a logic error, default to OFFLINE
	if l.Status == "" {
		l.Status = model.StatusOffline
	}

	p.saveAndBroadcast(w, l, workerID)
}

func (p *Pool) evaluateFinalStatus(l *model.MonitoringLog, w model.Website, body []byte, extras probeExtras, manual bool) {
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
		"waf_detected": extras.WAFDetected,

		// ── Body ─────────────────────────────
		"response_body_preview": bodyPreview,
		"is_migrated":           isMigrated,
		"migration_hint":        migHintVal,
		"chrome_success":        state.lastChromeSuccess,
		"screenshot":            extras.Screenshot,
		"page_title":            extras.PageTitle,
		"page_text_preview": func() string {
			if len(extras.PageText) > 500 {
				return extras.PageText[:500]
			}
			return extras.PageText
		}(),
	}

	// ─── Deterministic Status Classification (DNS + HTTP only) ───
	// Chrome, screenshots, keyword/content analysis, ASN, migration, AI, and WAF
	// detection no longer participate in status determination.
	newStatus, healthScore, interpretation, recommendation := classifyStatus(l)

	// ─── WAF / human-verification refinement ─────────────────────
	// A 403/429/503 carrying a WAF/CDN/CAPTCHA fingerprint is almost always our
	// monitoring agent being challenged as a bot, NOT a real outage or a genuine
	// authorization error from the application. The server clearly answered
	// (TCP+TLS+HTTP all succeeded); only the anti-bot layer refused our agent, so
	// for real human visitors the site works. We therefore report it ONLINE — but
	// relabel the reason so operators know the automated check was limited and can
	// tell this apart from a genuine application 4xx (a pure 403 stays CRITICAL).
	botBlocked, wafName := detectHumanVerification(l, extras, body)
	if botBlocked {
		newStatus = model.StatusOnline
		healthScore = 90
		interpretation = fmt.Sprintf(
			"ONLINE (terlindungi %s): server merespons HTTP %d untuk verifikasi manusia/anti-bot. Situs normal untuk pengunjung biasa, tetapi pengecekan otomatis tidak dapat menembus verifikasi.",
			wafName, *l.StatusCode)
		recommendation = []string{
			fmt.Sprintf("Daftarkan IP server monitoring ke allowlist %s pada target agar status terverifikasi penuh.", wafName),
		}
	}

	report := map[string]interface{}{
		"primary_key":        string(newStatus),
		"evidence":           buildEvidenceList(l),
		"interpretation":     interpretation,
		"confidence_score":   100,
		"confidence_label":   "Deterministik (DNS + HTTP)",
		"recommended_action": recommendation,
		"bot_blocked":        botBlocked,
		"waf_name":           wafName,
	}
	evidence["investigation_report"] = report

	jsonBytes, jerr := json.MarshalIndent(evidence, "", "  ")
	if jerr == nil {
		l.RootCause = string(jsonBytes)
	} else {
		l.RootCause = `{"error":"failed to marshal evidence"}`
	}
	if len(recommendation) > 0 {
		l.Recommendation = recommendation[0]
	}
	l.FinalReason = interpretation
	l.FinalDecisionSource = "DETERMINISTIC_DNS_HTTP"

	l.Status = newStatus
	l.HealthScore = healthScore
	l.IsBrowserAccessible = (newStatus == model.StatusOnline || newStatus == model.StatusWarning)

	// Anti-Flapping: require failConfirmThreshold consecutive hard-down samples
	// (OFFLINE/CRITICAL) before reporting one, so a single transient blip — a momentary
	// timeout or a one-off 5xx during a deploy — cannot raise a false incident.
	isDown := newStatus == model.StatusOffline || newStatus == model.StatusCritical
	if isDown {
		if manual {
			state.consecutiveFailures = failConfirmThreshold
		} else {
			state.consecutiveFailures++
		}
		if state.consecutiveFailures < failConfirmThreshold &&
			(state.lastStatus == model.StatusOnline || state.lastStatus == model.StatusWarning) {
			// Not yet confirmed: hold the previous healthy-ish status.
			l.Status = state.lastStatus
			if l.Status == "" {
				l.Status = model.StatusOnline
			}
			l.HealthScore = 100
			l.FinalDecisionSource += "_DEBOUNCE_PENDING"
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

// ─── Deterministic status classification (DNS + HTTP only) ──────
const (
	// warningResponseThresholdMs: a 2xx/3xx response slower than this is reported as
	// WARNING ("lambat") instead of ONLINE. 2000 ms follows the widely used "2-second
	// rule" for acceptable web response time (Nielsen response-time limits; Google/Akamai
	// page-speed research): under ~2 s a page still feels responsive, beyond it users
	// perceive lag and abandonment rises sharply.
	warningResponseThresholdMs = 2000
	// severeResponseThresholdMs: above this a 2xx/3xx response is still WARNING but
	// labelled "sangat lambat" (Apdex "frustrated" zone). Slowness by itself never
	// escalates to CRITICAL or OFFLINE — a site that still answers is degraded, not
	// down. Treating slowness as an outage is the single biggest source of false
	// alarms, so a slow site stays a (silent, non-notifying) WARNING.
	severeResponseThresholdMs = 5000
	// failConfirmThreshold: consecutive hard-down samples required before a site is
	// reported OFFLINE/CRITICAL (debounce against transient blips).
	failConfirmThreshold = 3
)

// detectHumanVerification reports whether a 403/429/503 response is an anti-bot
// challenge (CDN/WAF/CAPTCHA) rather than a genuine outage or authorization error.
// It returns true plus a human-readable label for the protection layer.
//
// The server having answered at all (we received an HTTP status) means TCP+TLS
// succeeded and the origin/edge is alive; only our automated agent was refused.
// Detection uses two tiers: explicit WAF/CDN header fingerprints (strongest), and
// challenge/CAPTCHA markers in the response body (catches cases with no CDN header).
func detectHumanVerification(l *model.MonitoringLog, extras probeExtras, body []byte) (bool, string) {
	if l.StatusCode == nil {
		return false, ""
	}
	switch *l.StatusCode {
	case 403, 429, 503:
		// eligible
	default:
		return false, ""
	}

	// Tier 1: header-based WAF/CDN fingerprint detected during probing.
	if extras.WAFDetected != "" && extras.WAFDetected != "Not Detected" {
		return true, extras.WAFDetected
	}
	if extras.IsCDN && extras.CDNProvider != "" {
		return true, extras.CDNProvider
	}

	// Tier 2: challenge / CAPTCHA fingerprint in the response body.
	if len(body) > 0 {
		b := strings.ToLower(string(body))
		markers := []string{
			"just a moment", "checking your browser", "checking if the site connection is secure",
			"__cf_chl", "cf_chl_opt", "cf-challenge", "challenge-platform", "cf-mitigated",
			"g-recaptcha", "recaptcha/api.js", "www.google.com/recaptcha",
			"h-captcha", "hcaptcha.com", "challenges.cloudflare.com/turnstile", "cf-turnstile",
			"verify you are human", "are you a robot", "verifikasi", "captcha",
		}
		for _, m := range markers {
			if strings.Contains(b, m) {
				return true, "Human Verification"
			}
		}
	}

	return false, ""
}

// classifyStatus decides status purely from DNS resolution + HTTP outcome.
//
//	HEALTHY  (ONLINE)  = DNS OK + HTTP 200-399 within the latency budget
//	WARNING            = HTTP 200-399 but slow, or any 4xx (server up, page not OK)
//	CRITICAL           = HTTP 5xx (500/502/503/504/…)
//	OFFLINE            = DNS failure, timeout, connection refused/reset, or no response
func classifyStatus(l *model.MonitoringLog) (model.LogStatus, int, string, []string) {
	// 1. DNS gate.
	if !l.DNSResolved {
		return model.StatusOffline, 0,
			"OFFLINE: domain tidak dapat di-resolve (DNS gagal).",
			[]string{"Periksa pendaftaran domain dan konfigurasi DNS."}
	}

	// 2. Transport error after DNS success = timeout / connection refused / reset.
	if l.ErrorMessage != nil && *l.ErrorMessage != "" {
		es := strings.ToLower(*l.ErrorMessage)
		reason := "koneksi ke server gagal"
		switch {
		case strings.Contains(es, "timeout") || strings.Contains(es, "deadline") || strings.Contains(es, "timed out"):
			reason = "timeout (server tidak merespons tepat waktu)"
		case strings.Contains(es, "refused"):
			reason = "connection refused (port tertutup / layanan mati)"
		case strings.Contains(es, "reset"):
			reason = "connection reset oleh server/jaringan"
		case strings.Contains(es, "no such host") || strings.Contains(es, "no route"):
			reason = "host tidak dapat dijangkau"
		}
		return model.StatusOffline, 0,
			"OFFLINE: " + reason + ".",
			[]string{"Pastikan web server hidup dan dapat dijangkau dari jaringan."}
	}

	// 3. HTTP status code.
	code := 0
	if l.StatusCode != nil {
		code = *l.StatusCode
	}
	rt := 0
	if l.ResponseTimeMs != nil {
		rt = *l.ResponseTimeMs
	}

	switch {
	case code >= 500:
		return model.StatusCritical, 20,
			fmt.Sprintf("CRITICAL: server mengembalikan HTTP %d (server error).", code),
			[]string{"Periksa aplikasi dan layanan backend (error 5xx)."}
	case code == 403:
		// A 403 with a WAF/CDN/CAPTCHA fingerprint is upgraded to ONLINE by the
		// human-verification refinement after this call. A 403 WITHOUT any such
		// signal is a genuine "Forbidden" — the site is not reachable as intended.
		return model.StatusCritical, 20,
			"CRITICAL: akses ditolak HTTP 403 (Forbidden) tanpa tanda verifikasi manusia.",
			[]string{"Periksa otorisasi/izin akses atau aturan firewall pada target."}
	case code >= 400:
		return model.StatusWarning, 60,
			fmt.Sprintf("WARNING: server merespons HTTP %d (client error).", code),
			[]string{"Periksa konfigurasi rute/otorisasi halaman."}
	case code >= 200 && code < 400:
		switch {
		case rt > severeResponseThresholdMs:
			return model.StatusWarning, 55,
				fmt.Sprintf("WARNING: respons sangat lambat (%d ms, HTTP %d).", rt, code),
				[]string{"Periksa beban server, kapasitas, dan latensi jaringan — performa jauh di bawah normal."}
		case rt > warningResponseThresholdMs:
			return model.StatusWarning, 70,
				fmt.Sprintf("WARNING: respons lambat (%d ms, HTTP %d).", rt, code),
				[]string{"Periksa beban server dan latensi jaringan."}
		}
		return model.StatusOnline, 100,
			fmt.Sprintf("HEALTHY: HTTP %d, waktu respons %d ms.", code, rt),
			[]string{"Tidak ada tindakan diperlukan."}
	default:
		return model.StatusOffline, 0,
			"OFFLINE: tidak ada respons HTTP yang valid.",
			[]string{"Periksa kondisi server dan jaringan."}
	}
}

// buildEvidenceList produces the human-readable evidence shown on the dashboard.
func buildEvidenceList(l *model.MonitoringLog) []string {
	ev := []string{}
	if l.DNSResolved {
		ev = append(ev, "✓ DNS resolved")
	} else {
		ev = append(ev, "✗ DNS failed")
	}
	if l.StatusCode != nil {
		ev = append(ev, fmt.Sprintf("✓ HTTP %d", *l.StatusCode))
	} else if l.ErrorMessage != nil && *l.ErrorMessage != "" {
		ev = append(ev, "✗ HTTP error: "+*l.ErrorMessage)
	} else {
		ev = append(ev, "✗ No HTTP response")
	}
	if l.ResponseTimeMs != nil {
		ev = append(ev, fmt.Sprintf("Response time: %d ms", *l.ResponseTimeMs))
	}
	if l.ICMPStatus {
		ev = append(ev, "✓ ICMP reachable")
	}
	return ev
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

		// ③ False-alarm brake: an OFFLINE verdict means our node got NO response at all.
		// If the monitoring node's OWN internet is down, that verdict can't be trusted
		// (we can't tell "target down" from "we're offline"), so suppress the incident,
		// push notification, and mass-failure grouping. CRITICAL/WARNING are exempt:
		// those required an HTTP response, which already proves our connectivity was fine.
		suppressFalseAlarm := logEntry.Status == model.StatusOffline && !p.monitorInternetHealthy()
		if suppressFalseAlarm {
			log.Printf("[Worker] SUPPRESS false alarm for %s: monitoring node has no internet — %s not reported (likely our connection, not the target)", w.Name, logEntry.Status)
		}

		// Only hard-down states (CRITICAL / OFFLINE) open an incident. WARNING is a
		// degraded-but-up condition (slow response or a 4xx page) — recording it as an
		// incident only adds noise on a flaky local network, so it is intentionally
		// excluded. These are exactly the states that also notify on Telegram.
		isHardDown := logEntry.Status == model.StatusOffline || logEntry.Status == model.StatusCritical
		if isHardDown && !inMaintenance && !suppressFalseAlarm {
			// Check if there is an active incident
			activeInc, err := p.repo.GetActiveIncidentByWebsite(ctx, w.ID)
			if err != nil || activeInc == nil {
				// Create new incident
				title := fmt.Sprintf("Website %s is %s", w.Name, logEntry.Status)
				severity := "CRITICAL"
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
		if (logEntry.Status == model.StatusOffline || logEntry.Status == model.StatusCritical) && !suppressFalseAlarm {
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

		if p.notif != nil && !suppressFalseAlarm {
			go p.notif.NotifyStatusChange(w.ID, w.Name, w.URL, prevStatus, string(logEntry.Status), logEntry.RootCause)
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

// monitorInternetHealthy reports whether the monitoring node itself currently has
// working internet access. It dials a few highly-available anchors (DNS/HTTPS ports
// on public resolvers); if NONE are reachable, our node is effectively offline and any
// OFFLINE verdict it produces for a target is untrustworthy — almost certainly a false
// alarm caused by OUR connection, not the target's. The result is cached for a short
// window so the status-change path stays cheap.
//
// Assumption: the node reaches the internet directly (no mandatory outbound proxy).
// In a proxy-only environment these direct dials may fail; tune the anchors if so.
func (p *Pool) monitorInternetHealthy() bool {
	p.netHealthMu.Lock()
	if !p.netHealthCheckedAt.IsZero() && time.Since(p.netHealthCheckedAt) < 15*time.Second {
		v := p.netHealthOK
		p.netHealthMu.Unlock()
		return v
	}
	p.netHealthMu.Unlock()

	anchors := []string{"8.8.8.8:53", "1.1.1.1:53", "1.1.1.1:443"}
	ok := false
	for _, a := range anchors {
		conn, err := net.DialTimeout("tcp", a, 2*time.Second)
		if err == nil {
			conn.Close()
			ok = true
			break
		}
	}

	p.netHealthMu.Lock()
	p.netHealthOK = ok
	p.netHealthCheckedAt = time.Now()
	p.netHealthMu.Unlock()
	return ok
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
		// Live throughput — without these the dashboard's SystemHealth readout
		// (topology header ↓/↑ Kbps) is stuck at 0 even though NetworkService measures it.
		p.health.NetRxMbps = netCtx.RxMbps
		p.health.NetTxMbps = netCtx.TxMbps
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
