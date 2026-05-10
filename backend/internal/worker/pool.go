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
		return "SSL_EXPIRED", "SSL certificate has expired. Immediate renewal required."
	}
	if strings.Contains(errStr, "self signed") || strings.Contains(errStr, "authority") {
		return "SELF_SIGNED_CERT", "Untrusted self-signed certificate detected. Not recommended for production."
	}
	if strings.Contains(errStr, "hostname") || strings.Contains(errStr, "doesn't match") {
		return "HOSTNAME_MISMATCH", "Certificate hostname does not match the requested domain."
	}
	if strings.Contains(errStr, "handshake failure") || strings.Contains(errStr, "protocol version") {
		return "TLS_HANDSHAKE_FAILED", "TLS handshake failed. Possibly unsupported protocol version."
	}
	if strings.Contains(errStr, "timeout") {
		return "TLS_TIMEOUT", "TLS handshake timed out. Potential network bottleneck or WAF blocking."
	}
	if strings.Contains(errStr, "reset") || strings.Contains(errStr, "refused") {
		return "TLS_CONN_RESET", "Connection reset during TLS handshake. Likely blocked by Firewall/WAF."
	}
	return "SSL_GENERAL_ERROR", "SSL/TLS error: " + err.Error()
}

func (p *Pool) checkSSL(host string) (bool, *time.Time, string, string) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	// We use a strict TLS dial to verify the certificate chain
	conn, err := tls.DialWithDialer(dialer, "tcp", host+":443", &tls.Config{
		ServerName: host,
		// InsecureSkipVerify is FALSE here by default, which is what we want for validation
	})
	if err != nil {
		rc, rec := parseTLSError(err)
		return false, nil, rc, rec
	}
	defer conn.Close()
	
	state := conn.ConnectionState()
	if len(state.PeerCertificates) > 0 {
		exp := state.PeerCertificates[0].NotAfter
		return true, &exp, "", ""
	}
	return false, nil, "SSL_NO_CERTIFICATE", "No certificate found on the target host."
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
	if time.Since(p.lastCheck) < 15*time.Second {
		status := p.localNet
		p.mu.Unlock()
		return status
	}
	p.mu.Unlock()

	// Quorum internet check: 3 targets
	targets := []string{"8.8.8.8:53", "1.1.1.1:53", "208.67.222.222:53"}
	successCount := 0
	
	var wg sync.WaitGroup
	var mu sync.Mutex
	
	for _, target := range targets {
		wg.Add(1)
		go func(t string) {
			defer wg.Done()
			dialer := &net.Dialer{Timeout: 2 * time.Second}
			conn, err := dialer.Dial("tcp", t)
			if err == nil {
				conn.Close()
				mu.Lock()
				successCount++
				mu.Unlock()
			}
		}(target)
	}
	wg.Wait()

	ok := successCount >= 2 // Majority quorum
	
	p.mu.Lock()
	p.localNet = ok
	p.lastCheck = time.Now()
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
		Status:      model.StatusUnknown,
		HealthScore: 0,     // Start at 0, build up if successful
		Confidence:  100,   // Start at 100 confidence in the monitor itself
		IsBrowserOK: false, // Start as failed
	}

	if !p.isLocalNetworkOK() {
		l.Status = model.StatusUnknown
		l.RootCause = "MONITORING_NODE_OFFLINE: Local quorum check failed."
		l.Recommendation = "Check monitoring server network interface and internet gateway."
		l.HealthScore = 0
		p.saveAndBroadcast(w, l)
		return
	}

	// Chaos: Packet Loss Simulator
	if p.chaos.PacketLoss && rand.Float32() < 0.3 {
		l.Status = model.StatusDegraded
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
	if isHTTPS {
		sslOk, expiry, rc, rec := p.checkSSL(host)
		
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
			// Root Cause Locked: If SSL is invalid, we don't need further layer metrics to determine status
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

	if httpErr != nil {
		l.Status = model.StatusOffline
		l.ErrorMessage = model.PtrString(httpErr.Error())
		
		if l.RootCause == "" {
			errStr := strings.ToLower(httpErr.Error())
			if strings.Contains(errStr, "timeout") {
				l.Status = model.StatusOffline
				l.RootCause = "TARGET_SERVER_OFFLINE: Connection timed out."
			} else if strings.Contains(errStr, "connection refused") {
				l.RootCause = "TARGET_SERVER_OFFLINE: Connection refused."
			} else {
				l.RootCause = "CONNECTION_ERROR: " + httpErr.Error()
			}
		}
		
		l.Recommendation = "Check server firewall or hosting provider."
		l.IsBrowserOK = false
		l.HealthScore = 0
		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
	} else {
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		
		rt := int(time.Since(httpStart).Milliseconds())
		l.ResponseTimeMs = &rt
		code := resp.StatusCode
		l.StatusCode = &code

		serverHeader := resp.Header.Get("Server")
		cfRay := resp.Header.Get("Cf-Ray")
		var cloudInfo string
		if strings.Contains(strings.ToLower(serverHeader), "cloudflare") || cfRay != "" {
			cloudInfo = "[CDN: Cloudflare] "
		}

			p.evaluateStatusV7(l, cloudInfo, w)
	}

	p.saveAndBroadcast(w, l)
}

func (p *Pool) evaluateStatusV7(l *model.MonitoringLog, cloudInfo string, w model.Website) {
	state := p.getWebsiteState(w.ID)
	
	// Track rolling average latency
	if l.ResponseTimeMs != nil {
		state.recentLatencies = append(state.recentLatencies, *l.ResponseTimeMs)
		if len(state.recentLatencies) > 10 {
			state.recentLatencies = state.recentLatencies[1:]
		}
	}
	
	avgRT := 0
	if len(state.recentLatencies) > 0 {
		sum := 0
		for _, v := range state.recentLatencies { sum += v }
		avgRT = sum / len(state.recentLatencies)
	}

	code := 0
	if l.StatusCode != nil { code = *l.StatusCode }
	ttfb := 0
	if l.TTFBLatencyMs != nil { ttfb = *l.TTFBLatencyMs }

	// Reset for clean evaluation
	l.HealthScore = 100
	l.Confidence = 100
	l.IsBrowserOK = true
	newStatus := model.StatusOnline

	// 1. ROOT CAUSE LOCKING: Layer 6 (SSL) or DNS
	if l.RootCause != "" && !l.SSLValid {
		newStatus = model.StatusCritical
		l.HealthScore = 30
		l.IsBrowserOK = false
	} else if code >= 500 {
		// 2. OFFLINE (Layer 7 Fatal)
		newStatus = model.StatusOffline
		l.RootCause = cloudInfo + fmt.Sprintf("SERVER_CRITICAL: HTTP %d (Application Crash).", code)
		l.Recommendation = "Check backend services and database status."
		l.HealthScore = 0
		l.IsBrowserOK = false
	} else if code == 401 || code == 403 || code == 429 {
		// 3. CRITICAL (Security & WAF)
		newStatus = model.StatusCritical
		l.RootCause = cloudInfo + fmt.Sprintf("TARGET_ACCESS_RESTRICTED: HTTP %d (WAF/Bot Policy).", code)
		l.Recommendation = "Whitelist monitoring node IP in security policies."
		l.HealthScore = 10
		l.IsBrowserOK = false
	} else if ttfb > 5000 || avgRT > 8000 {
		// 4. DEGRADED (Severe Performance - using rolling average)
		newStatus = model.StatusDegraded
		l.RootCause = cloudInfo + fmt.Sprintf("DEGRADED_PERFORMANCE: TTFB %dms | AvgRT %dms.", ttfb, avgRT)
		l.Recommendation = "Optimize application bottlenecks or server resources."
		l.HealthScore = 40
	} else if avgRT > 3000 {
		// 5. WARNING (Mild Latency)
		newStatus = model.StatusWarning
		l.RootCause = cloudInfo + fmt.Sprintf("WARNING_LATENCY: High avg response time (%dms).", avgRT)
		l.HealthScore = 70
	}

	// 6. SSL WARNINGS (Expiry < 14 days)
	if l.SSLValid && l.SSLExpiryDate != nil {
		daysLeft := int(time.Until(*l.SSLExpiryDate).Hours() / 24)
		if daysLeft < 14 {
			if newStatus == model.StatusOnline {
				newStatus = model.StatusWarning
				l.HealthScore = 70
				l.RootCause = fmt.Sprintf("SSL_EXPIRING_SOON: %d days left.", daysLeft)
			}
		}
	}

	// --- ANTI-FLAPPING LOGIC ---
	
	// If the new status is bad, we need consecutive failures
	isBad := newStatus != model.StatusOnline
	if isBad {
		state.consecutiveFailures++
		if state.consecutiveFailures < 3 && state.lastStatus == model.StatusOnline {
			// Not yet confirmed, keep it ONLINE (Transient suppression)
			l.Status = model.StatusOnline
			l.RootCause = "TRANSIENT_ANOMALY_SUPPRESSED: Awaiting confirmation."
			return
		}
	} else {
		// Trying to move to ONLINE
		// 1. Check Cooldown: Minimum 60s in bad state
		if state.lastStatus != model.StatusOnline && state.lastStatus != model.StatusUnknown {
			if time.Since(state.statusStartTime) < 60*time.Second {
				l.Status = state.lastStatus
				l.RootCause = fmt.Sprintf("COOLDOWN_ACTIVE: Retaining %s to prevent flapping.", state.lastStatus)
				return
			}
		}
		state.consecutiveFailures = 0
	}

	// Commit Status Change
	if newStatus != state.lastStatus {
		state.lastStatus = newStatus
		state.statusStartTime = time.Now()
	}
	
	l.Status = newStatus
	if l.Status == model.StatusOnline && l.RootCause == "" {
		l.RootCause = cloudInfo + "HEALTHY: Service performing within NOC limits."
		l.Recommendation = "Normal operations."
	}
}

func (p *Pool) saveAndBroadcast(w model.Website, logEntry *model.MonitoringLog) {
	ctx := context.Background()

	prevStatus, err := p.repo.GetLatestStatus(ctx, w.ID)
	statusChanged := err == nil && prevStatus != "" && prevStatus != string(logEntry.Status)

	// Truncate RootCause to fit DB column (VARCHAR 200)
	if len(logEntry.RootCause) > 200 {
		logEntry.RootCause = logEntry.RootCause[:197] + "..."
	}

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
		IsBrowserOK:    logEntry.IsBrowserOK,
		CheckedAt:      logEntry.CheckedAt,
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
		lastStatus:      model.StatusUnknown,
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
