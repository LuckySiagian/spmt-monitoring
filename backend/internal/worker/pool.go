package worker

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/notification"
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
	notif      *notification.Service
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
	}
}

func (p *Pool) Start() {
	log.Printf("[Worker] Starting %d lightweight workers", p.workerSize)
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
		if c.ID == id { return c.Name }
	}
	for _, c := range tls.InsecureCipherSuites() {
		if c.ID == id { return c.Name + " (Insecure)" }
	}
	return "Unknown"
}

func (p *Pool) isLocalNetworkOK() bool {
	p.mu.Lock()
	if time.Since(p.lastCheck) < 15*time.Second {
		status := p.localNet
		p.mu.Unlock()
		return status
	}
	p.mu.Unlock()

	dialer := &net.Dialer{Timeout: 3 * time.Second}
	conn, err := dialer.Dial("tcp", "8.8.8.8:53")
	ok := err == nil
	if ok { conn.Close() }
	
	p.mu.Lock()
	p.localNet = ok
	p.lastCheck = time.Now()
	p.mu.Unlock()
	return ok
}

func (p *Pool) check(w model.Website) {
	start := time.Now()
	l := &model.MonitoringLog{
		WebsiteID: w.ID,
		CheckedAt: start,
		Status:    model.StatusUnknown,
	}

	if !p.isLocalNetworkOK() {
		l.Status = model.StatusUnknown
		l.RootCause = "MONITOR_NETWORK_UNSTABLE: Local network issue detected."
		p.saveAndBroadcast(w, l)
		return
	}

	host := extractHost(w.URL)
	isHTTPS := strings.HasPrefix(w.URL, "https://")
	port := 80
	if isHTTPS { port = 443 }

	// 1. DNS
	addrs, err := net.LookupHost(host)
	if err != nil || len(addrs) == 0 {
		l.Status = model.StatusOffline
		l.RootCause = "DOWN (DNS FAILURE): Domain could not be resolved."
		p.saveAndBroadcast(w, l)
		return
	}
	l.DNSResolved = true
	l.IPAddress = addrs[0]

	// 2. TCP
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 5*time.Second)
	if err != nil {
		l.Status = model.StatusOffline
		l.RootCause = "DOWN (HOST UNREACHABLE): Port " + fmt.Sprint(port) + " closed."
		p.saveAndBroadcast(w, l)
		return
	}
	l.TCPPortOpen = true
	conn.Close()

	// 3. SSL/TLS
	var tlsInfo string
	if isHTTPS {
		tlsConfig := &tls.Config{ServerName: host, InsecureSkipVerify: false}
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		tlsConn, tlsErr := tls.DialWithDialer(dialer, "tcp", fmt.Sprintf("%s:%d", host, port), tlsConfig)
		
		if tlsErr != nil {
			l.SSLValid = false
			errStr := strings.ToLower(tlsErr.Error())
			if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "reset") || strings.Contains(errStr, "refused") {
				l.RootCause = "DOWN (TLS RESET): Connection aborted during handshake. Likely blocked by WAF/Bot Protection."
			} else {
				l.RootCause = "SECURITY_FAULT: SSL Handshake failed. " + tlsErr.Error()
			}
			
			// Try insecure fallback to at least get expiry if possible
			tlsConfig.InsecureSkipVerify = true
			if insConn, insErr := tls.DialWithDialer(dialer, "tcp", fmt.Sprintf("%s:%d", host, port), tlsConfig); insErr == nil {
				if len(insConn.ConnectionState().PeerCertificates) > 0 {
					exp := insConn.ConnectionState().PeerCertificates[0].NotAfter
					l.SSLExpiryDate = &exp
				}
				insConn.Close()
			}
		} else {
			l.SSLValid = true
			state := tlsConn.ConnectionState()
			tlsInfo = fmt.Sprintf("[%s | %s]", getTLSVersionName(state.Version), getCipherSuiteName(state.CipherSuite))
			if len(state.PeerCertificates) > 0 {
				exp := state.PeerCertificates[0].NotAfter
				l.SSLExpiryDate = &exp
			}
			tlsConn.Close()
		}
	} else {
		l.SSLValid = true
	}

	// 4. HTTP LAYER
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Timeout: 35 * time.Second,
		Jar:     jar,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true, ServerName: host},
		},
	}
	req, _ := http.NewRequest("GET", w.URL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,id;q=0.8")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Cache-Control", "max-age=0")
	req.Header.Set("Sec-Ch-Ua", "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"")

	httpStart := time.Now()
	resp, httpErr := client.Do(req)
	rt := int(time.Since(httpStart).Milliseconds())
	l.ResponseTimeMs = &rt

	if httpErr != nil {
		if l.RootCause == "" {
			l.RootCause = "DOWN (CONN ERROR): " + httpErr.Error()
		}
		l.Status = model.StatusOffline
	} else {
		defer resp.Body.Close()
		code := resp.StatusCode
		l.StatusCode = &code
		p.evaluateStatusV5(l, tlsInfo)
	}

	p.saveAndBroadcast(w, l)
}

func (p *Pool) evaluateStatusV5(l *model.MonitoringLog, tlsInfo string) {
	code := *l.StatusCode
	rt := *l.ResponseTimeMs

	if code >= 200 && code <= 399 {
		if rt > 30000 {
			l.Status = model.StatusOffline
			l.RootCause = fmt.Sprintf("DOWN (TOO SLOW): Response took %dms (Max 30s).", rt)
			return
		}

		l.Status = model.StatusOnline
		l.RootCause = "UP: Service is healthy " + tlsInfo
		
		if !l.SSLValid && !strings.Contains(l.RootCause, "TLS RESET") {
			l.Status = model.StatusCritical
			l.RootCause = "UP (INSECURE): SSL validation failed."
		} else if rt > 15000 {
			l.Status = model.StatusCritical
			l.RootCause = "UP (DEGRADED): Response is slow (15s - 30s)."
		}
		return
	}

	if code == 403 || code == 401 || code == 429 {
		l.Status = model.StatusOnline
		l.RootCause = fmt.Sprintf("UP (RESTRICTED): Server returned %d. %s", code, tlsInfo)
		return
	}

	l.Status = model.StatusOffline
	l.RootCause = fmt.Sprintf("DOWN (ERROR %d): Server returned error status.", code)
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
