package worker

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/repository"
	ws "github.com/spmt/monitoring/internal/websocket"
)

type MonitorJob struct {
	Website model.Website
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
}

func NewPool(repo *repository.Repository, hub *ws.Hub, workerSize int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
	return &Pool{
		repo:       repo,
		hub:        hub,
		jobs:       make(chan MonitorJob, 500),
		workerSize: workerSize,
		tickers:    make(map[uuid.UUID]*time.Ticker),
		ctx:        ctx,
		cancel:     cancel,
		localNet:   true,
	}
}

func (p *Pool) Start() {
	log.Printf("[Worker] Starting %d workers", p.workerSize)
	for i := 0; i < p.workerSize; i++ {
		go p.worker(i)
	}
	go p.scheduler()
}

func (p *Pool) Stop() { p.cancel() }

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
		log.Printf("[Worker] Failed to load websites: %v", err)
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
			log.Printf("[Worker] Removed ticker for %s", id)
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
	p.jobs <- MonitorJob{Website: w}
	t := time.NewTicker(time.Duration(interval) * time.Second)
	p.tickers[w.ID] = t
	website := w
	go func() {
		for {
			select {
			case <-p.ctx.Done():
				return
			case <-t.C:
				p.jobs <- MonitorJob{Website: website}
			}
		}
	}()
	log.Printf("[Worker] Scheduled %s every %ds", website.Name, interval)
}

func (p *Pool) RestartWebsite(w model.Website) {
	p.mu.Lock()
	if old, ok := p.tickers[w.ID]; ok {
		old.Stop()
		delete(p.tickers, w.ID)
		log.Printf("[Worker] Stopped old ticker for %s", w.Name)
	}
	p.startTicker(w)
	p.mu.Unlock()
	log.Printf("[Worker] Restarted monitoring for %s → %s", w.Name, w.URL)
}

func (p *Pool) TriggerCheck(w model.Website) {
	p.jobs <- MonitorJob{Website: w}
}

func (p *Pool) worker(id int) {
	log.Printf("[Worker %d] Started", id)
	for {
		select {
		case <-p.ctx.Done():
			return
		case job := <-p.jobs:
			p.check(job.Website)
		}
	}
}

// ── URL Validation ────────────────────────────────────────────
func isValidURL(rawURL string) bool {
	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

// ── STEP 1: DNS Resolution with latency ───────────────────────
func dnsResolve(host string) (resolved bool, ipAddr string, latencyMs int) {
	start := time.Now()
	addrs, err := net.LookupHost(host)
	latencyMs = int(time.Since(start).Milliseconds())
	if err != nil || len(addrs) == 0 {
		return false, "", latencyMs
	}
	return true, addrs[0], latencyMs
}

// ── STEP 2: ICMP Ping ─────────────────────────────────────────
// Requires root/CAP_NET_RAW. Falls back to alive=true if no permission.
func icmpPing(host string) (ok bool, latencyMs int) {
	start := time.Now()
	addrs, err := net.LookupHost(host)
	if err != nil || len(addrs) == 0 {
		return false, 0
	}
	ip := addrs[0]

	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		// No raw socket permission — fallback: assume reachable if DNS resolves
		return true, int(time.Since(start).Milliseconds())
	}
	defer conn.Close()

	msg := icmp.Message{
		Type: ipv4.ICMPTypeEcho, Code: 0,
		Body: &icmp.Echo{ID: os.Getpid() & 0xffff, Seq: 1, Data: []byte("spmt")},
	}
	b, err := msg.Marshal(nil)
	if err != nil {
		return false, 0
	}
	dst, err := net.ResolveIPAddr("ip4", ip)
	if err != nil {
		return false, 0
	}
	conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.WriteTo(b, dst); err != nil {
		return false, 0
	}
	rb := make([]byte, 1500)
	n, _, err := conn.ReadFrom(rb)
	latencyMs = int(time.Since(start).Milliseconds())
	if err != nil {
		return false, 0
	}
	rm, err := icmp.ParseMessage(1, rb[:n])
	if err != nil {
		return false, 0
	}
	if rm.Type == ipv4.ICMPTypeEchoReply {
		return true, latencyMs
	}
	return false, 0
}

// ── STEP 3: TCP Port Check ────────────────────────────────────
func tcpCheck(host string, port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 5*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// ── Local Connectivity Check ─────────────────────────────────
func (p *Pool) checkLocalConnectivity() bool {
	p.mu.Lock()
	if time.Since(p.lastCheck) < 10*time.Second {
		status := p.localNet
		p.mu.Unlock()
		return status
	}
	p.mu.Unlock()

	// Try to resolve a highly reliable host
	_, err := net.LookupHost("google.com")
	ok := err == nil
	
	p.mu.Lock()
	p.localNet = ok
	p.lastCheck = time.Now()
	p.mu.Unlock()
	return ok
}

// ── Main check flow: DNS→ICMP→TCP→HTTP→SSL→RESPONSE ──────────
func (p *Pool) check(w model.Website) {
	start := time.Now()
	logEntry := &model.MonitoringLog{
		WebsiteID: w.ID,
		CheckedAt: start,
		Status:    model.StatusUnknown,
		RootCause: "Initializing check...",
	}

	// ── PRE-CHECK: Local Network Health ──────────────────────
	localOK := p.checkLocalConnectivity()
	if !localOK {
		errMsg := "Local monitor connectivity issue (Network Down/Unstable)"
		logEntry.ErrorMessage = &errMsg
		logEntry.Status = model.StatusUnknown
		logEntry.RootCause = "MONITOR_OFFLINE: Jaringan lokal/komputer monitoring bermasalah."
		p.saveAndBroadcast(w, logEntry)
		return
	}

	// ── Validate URL ──────────────────────────────────────────
	if !isValidURL(w.URL) {
		errMsg := "Invalid URL format: " + w.URL
		logEntry.ErrorMessage = &errMsg
		logEntry.Status = model.StatusUnknown
		logEntry.RootCause = "Invalid URL format"
		p.saveAndBroadcast(w, logEntry)
		return
	}

	host := extractHost(w.URL)
	isHTTPS := strings.HasPrefix(w.URL, "https://")
	port := 80
	if isHTTPS {
		port = 443
	}

	// ── STEP 1: DNS ───────────────────────────────────────────
	dnsOK, ipAddr, dnsLatency := dnsResolve(host)
	logEntry.DNSResolved = dnsOK
	logEntry.DNSLatencyMs = &dnsLatency
	logEntry.IPAddress = ipAddr

	if !dnsOK {
		errMsg := "DNS resolution failed for: " + host
		logEntry.ErrorMessage = &errMsg
		logEntry.Status = model.StatusOffline
		logEntry.RootCause = "DNS lookup failed"
		p.saveAndBroadcast(w, logEntry)
		return
	}

	// ── STEP 2: ICMP ─────────────────────────────────────────
	icmpOK, icmpLatency := icmpPing(host)
	logEntry.ICMPStatus = icmpOK
	if icmpOK {
		logEntry.ICMPLatencyMs = &icmpLatency
	}

	// ── STEP 3: TCP ───────────────────────────────────────────
	logEntry.TCPPortOpen = tcpCheck(host, port)

	// ── STEP 4: HTTP ──────────────────────────────────────────
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Timeout: 15 * time.Second,
		Jar:     jar, // Enable cookie support to handle auth/redirect loops (e.g., ASP.NET Cookie Support detection)
		Transport: &http.Transport{
			// Allow connection even if SSL is invalid/expired (fixes the "Offline in monitoring but OK in browser" issue)
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, 
			DisableKeepAlives:   true,
			MaxIdleConnsPerHost: 1,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 15 {
				return fmt.Errorf("too many redirects (%d)", len(via))
			}
			// Important: Maintain headers during redirects (useful for headers we set manually)
			if len(via) > 0 {
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
			}
			return nil
		},
	}

	httpStart := time.Now()
	// Create a new request to add browser-like headers
	req, _ := http.NewRequest("GET", w.URL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,id;q=0.8")

	resp, httpErr := client.Do(req)
	elapsed := int(time.Since(httpStart).Milliseconds())
	logEntry.ResponseTimeMs = &elapsed

	if httpErr != nil {
		errMsg := httpErr.Error()
		logEntry.ErrorMessage = &errMsg
		logEntry.Status = model.StatusOffline
		logEntry.RootCause = diagnoseConnError(errMsg)
		p.saveAndBroadcast(w, logEntry)
		return
	}
	defer resp.Body.Close()

	code := resp.StatusCode
	logEntry.StatusCode = &code

	// ── STEP 5: SSL Certificate Analysis (Manual Check because SkipVerify is true) ──
	if isHTTPS && resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		expiry := cert.NotAfter
		logEntry.SSLExpiryDate = &expiry
		
		// Use the hostname of the FINAL URL after redirects for validation
		finalHost := extractHost(resp.Request.URL.String())
		
		// Re-verify SSL validity manually for reporting
		now := time.Now()
		isExpired := now.After(expiry)
		isDNSMatch := cert.VerifyHostname(finalHost) == nil
		
		logEntry.SSLValid = !isExpired && isDNSMatch
	} else if !isHTTPS {
		logEntry.SSLValid = true
	}

	// ── STEP 6 + Status Decision ─────────────────────────────
	logEntry.Status = determineStatus(code, elapsed, logEntry.SSLValid, isHTTPS)
	logEntry.RootCause = diagnoseRootCause(logEntry)

	p.saveAndBroadcast(w, logEntry)
}

// determineStatus maps results → ONLINE / CRITICAL / OFFLINE / UNKNOWN
func determineStatus(code, responseTimeMs int, sslValid, isHTTPS bool) model.LogStatus {
	// ── SECURITY COMPLIANCE CHECK ──
	// If the service is reachable but SSL is invalid, it's CRITICAL (Security Risk)
	if isHTTPS && !sslValid {
		return model.StatusCritical
	}

	// ── PERFORMANCE & SERVER HEALTH ──
	// 5xx server errors = CRITICAL
	if code >= 500 && code <= 599 {
		return model.StatusCritical
	}
	// Extreme latentcy (8s+) = CRITICAL
	if responseTimeMs > 8000 {
		return model.StatusCritical
	}

	// ── SUCCESSFUL RESPONSES ──
	if code >= 200 && code <= 399 {
		// Degraded Performance (3s - 8s) = CRITICAL
		if responseTimeMs >= 3000 {
			return model.StatusCritical
		}
		return model.StatusOnline
	}

	// ── CLIENT ERRORS / REJECTIONS ──
	// 4xx = OFFLINE (The server is up but refusing the request/resource not found)
	if code >= 400 && code <= 499 {
		return model.StatusOffline
	}

	return model.StatusOffline
}

func diagnoseConnError(errMsg string) string {
	msg := strings.ToLower(errMsg)
	switch {
	case strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline"):
		return "Koneksi ke server terlalu lama (Timeout)"
	case strings.Contains(msg, "connection refused"):
		return "Port layanan (80/443) tertutup atau diblokir"
	case strings.Contains(msg, "no such host"):
		return "Domain tidak terdaftar atau DNS bermasalah"
	case strings.Contains(msg, "too many redirects"):
		return "Website mengalami perulangan redirect (Loop)"
	case strings.Contains(msg, "certificate"):
		return "Sertifikat SSL tidak valid atau sudah kadaluarsa"
	default:
		return "Gagal menghubungi server"
	}
}

func diagnoseRootCause(l *model.MonitoringLog) string {
	switch l.Status {
	case model.StatusOnline:
		return "SISTEM NORMAL: Seluruh parameter (Layer 7) berjalan optimal."
	case model.StatusUnknown:
		if l.ErrorMessage != nil {
			return *l.ErrorMessage
		}
		return "CEK TERHENTI: Proses pengecekan kondisi tidak selesai."
	case model.StatusOffline:
		if !l.DNSResolved {
			return "LEVEL SISTEM: Domain tidak ditemukan (DNS Fail). Periksa registrasi domain."
		}
		if !l.ICMPStatus && !l.TCPPortOpen {
			return "LEVEL SERVER: Koneksi ke server terputus total (Unreachable). Cek fisik server/jaringan."
		}
		if !l.TCPPortOpen {
			return "LEVEL SISTEM: Port layanan (80/443) tertutup. Web server (Nginx/Apache) mungkin mati."
		}
		if l.ErrorMessage != nil {
			return "LEVEL APLIKASI: " + diagnoseConnError(*l.ErrorMessage)
		}
		if l.StatusCode != nil && *l.StatusCode >= 400 {
			return fmt.Sprintf("LEVEL APLIKASI (Layer 7): Akses ditolak oleh sistem (HTTP %d).", *l.StatusCode)
		}
		return "KONDISI OFFLINE: Website tidak dapat dijangkau."
	case model.StatusCritical:
		if l.StatusCode != nil && *l.StatusCode >= 200 && *l.StatusCode < 400 {
			if !l.SSLValid {
				return "LEVEL KEAMANAN: Sertifikat SSL Invalid/Expired. Risiko keamanan tinggi!"
			}
			if l.ResponseTimeMs != nil && *l.ResponseTimeMs >= 3000 {
				return "LEVEL APLIKASI: Performa melambat (Degraded). Aplikasi butuh optimasi."
			}
		}
		if l.StatusCode != nil && *l.StatusCode >= 500 {
			return fmt.Sprintf("LEVEL APLIKASI: Error pada kode sistem internal (HTTP %d).", *l.StatusCode)
		}
		return "KONDISI KRITIS: Layanan terganggu namun masih merespons."
	}
	return "Indikasi tidak diketahui secara pasti."
}

func (p *Pool) saveAndBroadcast(w model.Website, logEntry *model.MonitoringLog) {
	ctx := context.Background()

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
	}

	p.hub.Broadcast("monitor_update", model.WSMonitorUpdate{
		WebsiteID:      w.ID.String(),
		WebsiteName:    w.Name,
		URL:            w.URL,
		Status:         logEntry.Status,
		IPAddress:      logEntry.IPAddress,
		DNSResolved:    logEntry.DNSResolved,
		DNSLatencyMs:   logEntry.DNSLatencyMs,
		ICMPStatus:     logEntry.ICMPStatus,
		ICMPLatencyMs:  logEntry.ICMPLatencyMs,
		TCPPortOpen:    logEntry.TCPPortOpen,
		StatusCode:     logEntry.StatusCode,
		ResponseTimeMs: logEntry.ResponseTimeMs,
		SSLValid:       logEntry.SSLValid,
		SSLExpiryDate:  logEntry.SSLExpiryDate,
		ErrorMessage:   logEntry.ErrorMessage,
		RootCause:      logEntry.RootCause,
		CheckedAt:      logEntry.CheckedAt,
	})

	rtVal := 0
	if logEntry.ResponseTimeMs != nil {
		rtVal = *logEntry.ResponseTimeMs
	}

	log.Printf("[Worker] %s → %s | rt=%vms dns=%v icmp=%v tcp=%v ip=%s | %s",
		w.Name, logEntry.Status, rtVal,
		logEntry.DNSResolved, logEntry.ICMPStatus, logEntry.TCPPortOpen,
		logEntry.IPAddress, logEntry.RootCause)
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
