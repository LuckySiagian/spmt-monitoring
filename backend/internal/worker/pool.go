package worker

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
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
	if interval < 10 {
		interval = 30
	}
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

// ── Main check flow: DNS→ICMP→TCP→HTTP→SSL→RESPONSE ──────────
func (p *Pool) check(w model.Website) {
	start := time.Now()
	logEntry := &model.MonitoringLog{
		WebsiteID: w.ID,
		CheckedAt: start,
		Status:    model.StatusUnknown,
		RootCause: "Monitoring not completed",
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
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			// Allow connection even if SSL is invalid/expired (fixes the "Offline in monitoring but OK in browser" issue)
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, 
			DisableKeepAlives:   true,
			MaxIdleConnsPerHost: 1,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects (%d)", len(via))
			}
			return nil
		},
	}

	httpStart := time.Now()
	resp, httpErr := client.Get(w.URL)
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
		
		// Re-verify SSL validity manually for reporting
		now := time.Now()
		isExpired := now.After(expiry)
		isDNSMatch := cert.VerifyHostname(host) == nil
		
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
		return "Connection timeout"
	case strings.Contains(msg, "connection refused"):
		return "TCP port closed"
	case strings.Contains(msg, "no such host"):
		return "DNS lookup failed"
	case strings.Contains(msg, "too many redirects"):
		return "Too many redirects"
	case strings.Contains(msg, "certificate"):
		return "SSL validation failed"
	default:
		return "Service unreachable"
	}
}

func diagnoseRootCause(l *model.MonitoringLog) string {
	switch l.Status {
	case model.StatusOnline:
		return "Service healthy - All checks passed"
	case model.StatusUnknown:
		if l.ErrorMessage != nil {
			return *l.ErrorMessage
		}
		return "Monitoring task incomplete"
	case model.StatusOffline:
		if !l.DNSResolved {
			return "DNS resolution failed"
		}
		if !l.ICMPStatus && !l.TCPPortOpen {
			return "Network routing issue / Host unreachable"
		}
		if !l.TCPPortOpen {
			return "Service port (80/443) closed"
		}
		if l.ErrorMessage != nil {
			return diagnoseConnError(*l.ErrorMessage)
		}
		if l.StatusCode != nil && *l.StatusCode >= 400 {
			return fmt.Sprintf("HTTP %d Client Error (Service Active)", *l.StatusCode)
		}
		return "Service unreachable"
	case model.StatusCritical:
		if l.StatusCode != nil && *l.StatusCode >= 200 && *l.StatusCode < 400 {
			if !l.SSLValid {
				return "Security Alert: Invalid SSL Certificate (Reachable in Browser)"
			}
			if l.ResponseTimeMs != nil && *l.ResponseTimeMs >= 3000 {
				return "Performance Alert: High latency detected"
			}
		}
		if l.StatusCode != nil && *l.StatusCode >= 500 {
			return fmt.Sprintf("Server Error: HTTP %d response", *l.StatusCode)
		}
		return "Service degraded"
	}
	return "Indeterminate cause"
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

	log.Printf("[Worker] %s → %s | rt=%vms dns=%v icmp=%v tcp=%v ip=%s | %s",
		w.Name, logEntry.Status, logEntry.ResponseTimeMs,
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
