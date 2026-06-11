package worker

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/spmt/monitoring/internal/model"
	"github.com/google/uuid"
)

// ─── SIMPLIFIED CHECK LOGIC (4 PARAMETERS ONLY) ────────────────

// SimpleCheckResult contains only 4 core parameters
type SimpleCheckResult struct {
	CheckedAt        time.Time
	DNSResolved      bool
	ICMPStatus       bool
	HTTPStatusCode   *int
	HTTPErrorMessage *string
}

// CheckSimplified performs a simplified check with 4 parameters only
func (p *Pool) checkSimplified(w model.Website, workerID int) {
	state := p.getWebsiteState(w.ID)

	if !state.mu.TryLock() {
		slog.Debug("Skipping check for website — previous check still in progress",
			slog.String("website_id", w.ID.String()),
			slog.String("website_name", w.Name),
		)
		return
	}
	defer state.mu.Unlock()

	start := time.Now()

	result := SimpleCheckResult{
		CheckedAt: start,
	}

	// ─── PARAMETER 1: DNS Resolution ─────────────────────────────
	result.DNSResolved = p.checkDNS(w.URL)

	// ─── PARAMETER 2: ICMP Ping ──────────────────────────────────
	result.ICMPStatus = p.checkICMP(w.URL)

	// ─── PARAMETER 3: HTTP Status Code ───────────────────────────
	statusCode, errMsg := p.checkHTTP(w.URL)
	result.HTTPStatusCode = statusCode
	result.HTTPErrorMessage = errMsg

	// Convert result to MonitoringLog
	log := p.convertResultToLog(w.ID, result)

	// Save & Broadcast in goroutine so worker is not blocked on I/O
	go p.saveAndBroadcast(w, log, workerID)
}

// checkDNS performs DNS resolution
func (p *Pool) checkDNS(url string) bool {
	host := extractHost(url)
	if host == "" {
		return false
	}

	// Try system resolver first (timeout 5s)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := net.DefaultResolver.LookupHost(ctx, host)
	if err == nil {
		return true
	}

	// Fallback to Google DNS (8.8.8.8)
	fallbackResolver := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "udp", "8.8.8.8:53")
		},
	}

	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()

	_, err = fallbackResolver.LookupHost(ctx2, host)
	return err == nil
}

// checkICMP sends ICMP ping
func (p *Pool) checkICMP(url string) bool {
	host := extractHost(url)
	if host == "" {
		return false
	}

	// Use existing PingHost function
	ok, _ := PingHost(host)
	return ok
}

// checkHTTP performs HTTP GET request and returns status code
func (p *Pool) checkHTTP(url string) (*int, *string) {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		errMsg := fmt.Sprintf("Request creation failed: %v", err)
		return nil, &errMsg
	}

	req.Header.Set("User-Agent", "SPMT-Monitor/2.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(req)
	if err != nil {
		errMsg := err.Error()
		return nil, &errMsg
	}
	defer resp.Body.Close()

	return &resp.StatusCode, nil
}

// convertResultToLog converts SimpleCheckResult to MonitoringLog
func (p *Pool) convertResultToLog(websiteID uuid.UUID, result SimpleCheckResult) *model.MonitoringLog {
	log := &model.MonitoringLog{
		ID:               uuid.New(),
		WebsiteID:        websiteID,
		CheckedAt:        result.CheckedAt,
		DNSResolved:      result.DNSResolved,
		ICMPStatus:       result.ICMPStatus,
		HTTPStatusCode:   result.HTTPStatusCode,
		HTTPErrorMessage: result.HTTPErrorMessage,
	}

	// Compute IsOnline
	log.IsOnline = log.ComputeIsOnline()

	return log
}
