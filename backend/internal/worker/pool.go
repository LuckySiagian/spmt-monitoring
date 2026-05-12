package worker

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/notification"
	"github.com/spmt/monitoring/internal/repository"
	ws "github.com/spmt/monitoring/internal/websocket"
	"runtime"
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
	notif      *notification.Service
	chaos      struct {
		SlowResponse    bool
		PacketLoss      bool
		DNSIntermittent bool
		SSLExpiry       bool
		FirewallDrop    bool
		RandomTimeout   bool
	}
	websiteStates map[uuid.UUID]*websiteState
	health        model.SystemHealth
	recentFails   []time.Time
	muFails       sync.Mutex
	monitorBaselineLatMs int
}

type websiteState struct {
	consecutiveFailures int
	recentLatencies    []int
	lastStatus         model.LogStatus
	statusStartTime    time.Time
}

func NewPool(repo *repository.Repository, hub *ws.Hub, notif *notification.Service, workerSize int) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
	return &Pool{
		repo:       repo,
		hub:        hub,
		notif:      notif,
		jobs:       make(chan MonitorJob, 500),
		workerSize: workerSize,
		tickers:    make(map[uuid.UUID]*time.Ticker),
		ctx:        ctx,
		cancel:     cancel,
		localNet:   true,
		websiteStates: make(map[uuid.UUID]*websiteState),
		recentFails:   []time.Time{},
	}
}

func (p *Pool) Start() {
	// Increased worker size for production scalability (handled up to 500 sites)
	size := p.workerSize
	if size < 50 { size = 50 }
	
	log.Printf("[Worker] Starting %d lightweight workers", size)
	for i := 0; i < size; i++ {
		go p.worker(i)
	}
	go p.scheduler()
	go p.healthMonitor()
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

func (p *Pool) RevalidateAll() {
	websites, err := p.repo.GetAllWebsites(context.Background())
	if err != nil {
		log.Printf("[Worker] Failed to load websites for revalidation: %v", err)
		return
	}

	log.Printf("[Worker] Triggering instant revalidation for %d websites due to network change", len(websites))
	
	// Reset states to ensure fresh diagnosis
	p.mu.Lock()
	p.websiteStates = make(map[uuid.UUID]*websiteState)
	p.mu.Unlock()

	for _, w := range websites {
		p.jobs <- MonitorJob{Website: *w}
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
			p.check(job.Website)
		}
	}
}

// ── TLS Helpers ────────────────────────────────────────────────
func getTLSVersionName(v uint16) string {
	switch v {
	case tls.VersionTLS10: return "TLS 1.0"
	case tls.VersionTLS11: return "TLS 1.1"
	case tls.VersionTLS12: return "TLS 1.2"
	case tls.VersionTLS13: return "TLS 1.3"
	default: return "Unknown"
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
	if strings.Contains(errStr, "expired") || strings.Contains(errStr, "validate certificate") {
		return "SSL_EXPIRED", "Sertifikat keamanan website kedaluwarsa. Perlu pembaruan segera."
	}
	if strings.Contains(errStr, "self signed") || strings.Contains(errStr, "authority") {
		return "SSL_INTERCEPTION_BY_NETWORK", "Koneksi terganggu atau dimodifikasi oleh sistem keamanan jaringan (SSL Interception)."
	}
	if strings.Contains(errStr, "hostname") || strings.Contains(errStr, "doesn't match") {
		return "HOSTNAME_MISMATCH", "Nama domain tidak sesuai dengan sertifikat yang diterima."
	}
	if strings.Contains(errStr, "handshake failure") || strings.Contains(errStr, "protocol version") || strings.Contains(errStr, "remote error") {
		return "PROXY_INTERVENTION", "Intervensi proxy atau firewall terdeteksi saat proses jabat tangan (handshake) SSL."
	}
	if strings.Contains(errStr, "timeout") {
		return "FIREWALL_INTERRUPTION", "Koneksi SSL terputus oleh firewall karena waktu tunggu habis."
	}
	if strings.Contains(errStr, "reset") || strings.Contains(errStr, "refused") || strings.Contains(errStr, "eof") {
		return "NETWORK_POLICY_BLOCK", "Koneksi diputus paksa oleh kebijakan jaringan yang sedang digunakan."
	}
	return "SSL_GENERAL_ERROR", "Terjadi gangguan pada lapisan keamanan (SSL/TLS): " + err.Error()
}

func (p *Pool) checkSSL(host string) (bool, *time.Time, string, string, string) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	// We use a strict TLS dial to verify the certificate chain
	conn, err := tls.DialWithDialer(dialer, "tcp", host+":443", &tls.Config{
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
		for _, l := range latencies { sum += l }
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
	case "slow": p.chaos.SlowResponse = active
	case "loss": p.chaos.PacketLoss = active
	case "dns": p.chaos.DNSIntermittent = active
	case "ssl": p.chaos.SSLExpiry = active
	case "firewall": p.chaos.FirewallDrop = active
	case "timeout": p.chaos.RandomTimeout = active
	}
	log.Printf("[Chaos] %s mode: %v", mode, active)
}

func (p *Pool) check(w model.Website) {
	start := time.Now()
	l := &model.MonitoringLog{
		WebsiteID:   w.ID,
		CheckedAt:   start,
		Status:      "",
		HealthScore: 0,     // Start at 0, build up if successful
		Confidence:  100,   // Start at 100 confidence
		IsBrowserAccessible: true, // Start as accessible, prove otherwise
	}

	if !p.isLocalNetworkOK() {
		log.Printf("[Network] SKIP CHECK for %s: Local node has NO internet (Quorum fail).", w.Name)
		return
	}

	// Chaos: Packet Loss Simulator
	if p.chaos.PacketLoss && rand.Float32() < 0.3 {
		l.Status = model.StatusCritical
		l.RootCause = "INTERMITTENT_PACKET_LOSS: Simulated packet loss detected."
		l.HealthScore = 50
		p.saveAndBroadcast(w, l)
		return
	}

	host := extractHost(w.URL)

	// 1. DNS
	dnsStart := time.Now()
	// Chaos: DNS Intermittent
	if p.chaos.DNSIntermittent && rand.Float32() < 0.4 {
		l.Status = model.StatusOffline
		l.RootCause = "DNS_FAILURE (Simulated): Intermittent resolver failure."
		p.saveAndBroadcast(w, l)
		return
	}

	addrs, err := net.LookupHost(host)
	dnsDuration := int(time.Since(dnsStart).Milliseconds())
	l.DNSLatencyMs = &dnsDuration

	if err != nil || len(addrs) == 0 {
		l.Status = model.StatusOffline
		l.RootCause = "TARGET_SERVER_OFFLINE: DNS failure (Domain could not be resolved)."
		l.Recommendation = "Verify domain DNS records and nameservers."
		l.HealthScore = 0
		p.saveAndBroadcast(w, l)
		return
	}
	l.DNSResolved = true
	l.IPAddress = addrs[0]

	// 2. SSL/TLS Validation (Source of Truth)
	isHTTPS := strings.HasPrefix(w.URL, "https://")
	var sslIssuer string
	if isHTTPS {
		sslOk, expiry, rc, rec, issuer := p.checkSSL(host)
		sslIssuer = issuer
		
		// Chaos: SSL Expiry
		if p.chaos.SSLExpiry {
			sslOk = false
			rc = "SSL_EXPIRED (Simulated)"
			rec = "Chaos testing: SSL certificate marked as expired."
		}

		l.SSLValid = sslOk
		l.SSLExpiryDate = expiry
		if !sslOk {
			l.RootCause = rc
			l.Recommendation = rec
		}
	}

	// 3. HTTP & Observability Probing
	// Chaos: Firewall Drop
	if p.chaos.FirewallDrop && rand.Float32() < 0.5 {
		l.Status = model.StatusOffline
		l.RootCause = "FIREWALL_DROP (Simulated): Packet dropped by target security policy."
		p.saveAndBroadcast(w, l)
		return
	}

	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Timeout: 30 * time.Second,
		Jar:     jar,
		Transport: &http.Transport{
			TLSClientConfig:   &tls.Config{InsecureSkipVerify: true, ServerName: host},
			ForceAttemptHTTP2: true,
			DisableKeepAlives: true,
		},
	}

	// Chaos: Random Timeout
	if p.chaos.RandomTimeout && rand.Float32() < 0.3 {
		client.Timeout = 1 * time.Millisecond
	}

	req, _ := http.NewRequest("GET", w.URL, nil)
	req.Header.Set("User-Agent", getRandomUserAgent())
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	var tDnsStart, tTlsStart time.Time
	var tDnsEnd, tTlsEnd, tTtfbEnd time.Time

	trace := &httptrace.ClientTrace{
		DNSStart: func(info httptrace.DNSStartInfo) { tDnsStart = time.Now() },
		DNSDone:  func(info httptrace.DNSDoneInfo) { tDnsEnd = time.Now() },
		ConnectStart: func(network, addr string) {},
		ConnectDone: func(network, addr string, err error) {
			if err == nil { l.TCPPortOpen = true }
		},
		TLSHandshakeStart: func() { tTlsStart = time.Now() },
		TLSHandshakeDone: func(state tls.ConnectionState, err error) {
			if err == nil { tTlsEnd = time.Now() }
		},
		GotFirstResponseByte: func() { tTtfbEnd = time.Now() },
	}
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	httpStart := time.Now()
	resp, httpErr := client.Do(req)

	// Chaos: Slow Response
	if p.chaos.SlowResponse {
		time.Sleep(9 * time.Second)
	}

	if !tDnsEnd.IsZero() && !tDnsStart.IsZero() {
		dnsLat := int(tDnsEnd.Sub(tDnsStart).Milliseconds())
		l.DNSLatencyMs = &dnsLat
	}
	
	if !tTlsEnd.IsZero() && !tTlsStart.IsZero() {
		tlsLat := int(tTlsEnd.Sub(tTlsStart).Milliseconds())
		l.TLSLatencyMs = &tlsLat
	}
	
	if !tTtfbEnd.IsZero() {
		ttfbLat := int(tTtfbEnd.Sub(httpStart).Milliseconds())
		l.TTFBLatencyMs = &ttfbLat
	}

	var cloudInfo string
	if httpErr != nil {
		l.ErrorMessage = model.PtrString(httpErr.Error())
		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
		
		// IMPORTANT: Don't give up yet! 
		// Even if HTTP failed, we evaluate to see if it's an ISP block or WAF drop.
		p.evaluateFinalStatus(l, cloudInfo, w, nil, sslIssuer)
	} else {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		
		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
		code := resp.StatusCode
		l.StatusCode = &code

		serverHeader := resp.Header.Get("Server")
		cfRay := resp.Header.Get("Cf-Ray")
		if strings.Contains(strings.ToLower(serverHeader), "cloudflare") || cfRay != "" {
			cloudInfo = "[CDN: Cloudflare] "
		}

		p.evaluateFinalStatus(l, cloudInfo, w, body, sslIssuer)
	}

	// Final Safety: If status is still unknown, it's a logic error, default to OFFLINE
	if l.Status == "" {
		l.Status = model.StatusOffline
	}

	p.saveAndBroadcast(w, l)
}

func (p *Pool) evaluateFinalStatus(l *model.MonitoringLog, cloudInfo string, w model.Website, body []byte, sslIssuer string) {
	state := p.getWebsiteState(w.ID)
	
	code := 0
	if l.StatusCode != nil { code = *l.StatusCode }
	bodyStr := strings.ToLower(string(body))
	errStr := ""
	if l.ErrorMessage != nil { errStr = strings.ToLower(*l.ErrorMessage) }
	
	l.ResolverStage = "INIT"
	l.IsBrowserAccessible = true // Default to true

	// Declare all variables used in goto scopes to avoid "jumps over declaration" errors
	var isWafBlock, isCaptcha, isHardSSLError, shouldCheckContent bool
	var isSuspiciouslySmall bool
	isHttps := strings.HasPrefix(w.URL, "https://")
	isOnlineCode := (code >= 200 && code < 410)
	isTimeout := strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline")
	isUnreachable := strings.Contains(errStr, "no route") || strings.Contains(errStr, "unreachable")
	isRefused := strings.Contains(errStr, "refused") || strings.Contains(errStr, "reset")
	isDNSFail := !l.DNSResolved || strings.Contains(errStr, "no such host")

	// ─── STAGE 1: CONNECTIVITY (OFFLINE) ──────────────────────────
	l.ResolverStage = "NETWORK_CHECK"
	if isDNSFail || isTimeout || isUnreachable || isRefused || (code == 0 && errStr != "") {
		l.Status = model.StatusOffline
		l.IsBrowserAccessible = false
		l.HealthScore = 0
		l.FinalDecisionSource = "NET_OFFLINE"

		if isDNSFail {
			l.RootCause = "OFFLINE: Domain gagal di-resolve (DNS Error)."
		} else if isTimeout {
			l.RootCause = "OFFLINE: RTO (Request Time Out) - Server tidak merespon."
		} else if isRefused {
			l.RootCause = "OFFLINE: Koneksi ditolak oleh server (Connection Refused)."
		} else {
			l.RootCause = "OFFLINE: Masalah jaringan atau server tidak dapat dijangkau."
		}
		goto FINALIZE
	}

	// ─── STAGE 2: SSL/SECURITY (CRITICAL) ─────────────────────────
	l.ResolverStage = "SSL_CHECK"
	// Hard SSL Errors that always trigger CRITICAL
	isHardSSLError = l.SSLValid == false && (l.RootCause == "SSL_EXPIRED" || l.RootCause == "HOSTNAME_MISMATCH")

	if isHttps && !l.SSLValid {
		// Only mark as CRITICAL if it's a hard server-side failure
		if isHardSSLError || code == 0 {
			l.Status = model.StatusCritical
			l.IsBrowserAccessible = false 
			l.HealthScore = 40
			l.FinalDecisionSource = "SSL_CRITICAL"
			l.RootCause = "CRITICAL: Sertifikat SSL tidak valid atau kedaluwarsa (Keamanan Terancam)."
		} else {
			// Proxy/Env issue on monitoring node, we log but keep looking for ONLINE status
			l.FinalDecisionSource = "SSL_ENV_WARNING"
		}
	}

	// ─── STAGE 3: HTTP RESPONSE (ONLINE / CRITICAL) ───────────────
	l.ResolverStage = "HTTP_CHECK"
	if isOnlineCode {
		// If status wasn't already set to CRITICAL by SSL
		if l.Status == "" {
			l.Status = model.StatusOnline
			l.IsBrowserAccessible = true
			l.HealthScore = 100
			l.FinalDecisionSource = "HTTP_ONLINE"
			l.RootCause = fmt.Sprintf("ONLINE: Website dapat diakses dengan normal (HTTP %d).", code)
		} else {
			// It's CRITICAL (likely SSL), but we log the HTTP code
			l.RootCause += fmt.Sprintf(" (Server merespon HTTP %d)", code)
		}
	} else if code >= 500 {
		l.Status = model.StatusCritical
		l.IsBrowserAccessible = false
		l.HealthScore = 10
		l.FinalDecisionSource = "HTTP_5XX"
		l.RootCause = fmt.Sprintf("CRITICAL: Server mengalami kegagalan internal (HTTP %d).", code)
		goto FINALIZE
	}

	// ─── STAGE 4: CONTENT / SECURITY BLOCKS (CRITICAL) ────────────
	l.ResolverStage = "CONTENT_CHECK"
	
	// Only run deep content inspection for blocks if:
	// 1. We got an error code (401, 403, 503, etc)
	// 2. OR the response is 200 but suspiciously small (< 5KB) - block pages are usually tiny
	isSuspiciouslySmall = len(body) < 5000
	shouldCheckContent = code != 200 || isSuspiciouslySmall

	if shouldCheckContent {
		isWafBlock = strings.Contains(bodyStr, "fortigate") || strings.Contains(bodyStr, "zscaler") || 
					   strings.Contains(bodyStr, "palo alto") || strings.Contains(bodyStr, "firewall block") ||
					   strings.Contains(bodyStr, "policy restricted") || strings.Contains(bodyStr, "web filter")

		isCaptcha = strings.Contains(bodyStr, "recaptcha") || strings.Contains(bodyStr, "h-captcha") || 
					   strings.Contains(bodyStr, "turnstile") || strings.Contains(bodyStr, "cf-challenge") ||
					   strings.Contains(bodyStr, "verifikasi keamanan")

		if isWafBlock || isCaptcha {
			l.Status = model.StatusCritical
			l.IsBrowserAccessible = false
			l.HealthScore = 30
			l.FinalDecisionSource = "SECURITY_BLOCK"
			if isWafBlock {
				l.RootCause = "CRITICAL: Akses diblokir oleh Firewall/WAF Perusahaan."
			} else {
				l.RootCause = "CRITICAL: Website terhambat verifikasi keamanan (CAPTCHA)."
			}
			goto FINALIZE
		}
	}

	// ─── STAGE 5: LATENCY HANDLING (INFORMATION ONLY) ─────────────
	l.ResolverStage = "FINAL"
	if l.Status == "" {
		l.Status = model.StatusOnline // Default fallback
		l.IsBrowserAccessible = true
		l.RootCause = "ONLINE: Website merespon."
	}

FINALIZE:
	l.FinalReason = l.RootCause
	
	// Anti-Flapping (2-failure rule)
	if l.Status != model.StatusOnline {
		state.consecutiveFailures++
		if state.consecutiveFailures < 2 && state.lastStatus == model.StatusOnline {
			l.Status = model.StatusOnline
			l.RootCause = "Memvalidasi kestabilan koneksi..."
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
		TLSLatencyMs:   logEntry.TLSLatencyMs,
		TTFBLatencyMs:  logEntry.TTFBLatencyMs,
		StatusCode:     logEntry.StatusCode,
		ResponseTimeMs: logEntry.ResponseTimeMs,
		SSLValid:       logEntry.SSLValid,
		SSLExpiryDate:  logEntry.SSLExpiryDate,
		ErrorMessage:   logEntry.ErrorMessage,
		RootCause:      logEntry.RootCause,
		Recommendation: logEntry.Recommendation,
		HealthScore:    logEntry.HealthScore,
		Confidence:     logEntry.Confidence,
		IsBrowserAccessible:    logEntry.IsBrowserAccessible,
		FinalReason:         logEntry.FinalReason,
		FinalDecisionSource: logEntry.FinalDecisionSource,
		ResolverStage:       logEntry.ResolverStage,
		CheckedAt:           logEntry.CheckedAt,
	})

	rtVal := 0
	if logEntry.ResponseTimeMs != nil {
		rtVal = *logEntry.ResponseTimeMs
	}

	log.Printf("[Worker] %s → %s | rt=%vms dns=%v tcp=%v ip=%s | %s",
		w.Name, logEntry.Status, rtVal,
		logEntry.DNSResolved, logEntry.TCPPortOpen,
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

func (p *Pool) updateHealth() {
	p.mu.Lock()
	defer p.mu.Unlock()
	
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	p.health.ActiveWorkers = p.workerSize
	p.health.WorkerQueueSize = len(p.jobs)
	p.health.ActiveGoroutines = runtime.NumGoroutine()
	p.health.WSConnections = p.hub.ConnectionCount()
	p.health.BackendRAM = float64(m.Alloc) / 1024 / 1024 // MB
	p.health.MonitorLatencyMs = p.monitorBaselineLatMs
	p.health.UpdatedAt = time.Now()
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
			"type": "INCIDENT_GROUP",
			"count": len(p.recentFails),
			"msg": "Mass Incident Detected: Multiple services failing simultaneously.",
		})
	}
}
