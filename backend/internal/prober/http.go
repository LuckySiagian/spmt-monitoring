package prober

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"strings"
	"time"

	"github.com/spmt/monitoring/internal/engine"
	"github.com/spmt/monitoring/internal/model"
)

func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}
	// Explicitly block AWS/GCP Metadata IP just to be safe
	if ip.Equal(net.ParseIP("169.254.169.254")) {
		return true
	}
	return false
}

type HTTPProber struct {
	transport *http.Transport
}

func NewHTTPProber() *HTTPProber {
	return &HTTPProber{
		transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(addr)
				if err != nil {
					return nil, err
				}

				ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
				if err != nil {
					return nil, err
				}

				if len(ips) == 0 {
					return nil, fmt.Errorf("no IP found for host %s", host)
				}

				// SSRF Protection: Check if any resolved IP is private
				for _, ip := range ips {
					if isPrivateIP(ip) {
						return nil, fmt.Errorf("SSRF prevention: blocked attempt to connect to private IP %s", ip.String())
					}
				}

				// DNS Rebinding Mitigation: Dial the exact validated IP, not the hostname
				safeAddr := net.JoinHostPort(ips[0].String(), port)

				dialer := &net.Dialer{
					Timeout:   10 * time.Second,
					KeepAlive: 30 * time.Second,
				}
				return dialer.DialContext(ctx, network, safeAddr)
			},
			MaxIdleConns:          200,
			MaxIdleConnsPerHost:   10,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			DisableKeepAlives:     false,
		},
	}
}

func getRandomUserAgent() string {
	agents := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	}
	return agents[rand.Intn(len(agents))]
}

func (p *HTTPProber) Probe(ctx context.Context, target model.Website) (engine.Telemetry, error) {
	start := time.Now()
	
	telemetry := engine.Telemetry{
		WebsiteID: target.ID,
		URL:       target.URL,
		Timestamp: start,
		Headers:   make(map[string][]string),
	}

	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Timeout:   time.Duration(target.IntervalSeconds-2) * time.Second, // Dynamic timeout based on interval
		Jar:       jar,
		Transport: p.transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("REDIRECT_LOOP")
			}
			telemetry.RedirectCount++
			return nil
		},
	}

	// Prevent timeout exceeding a hard maximum (e.g., 30s)
	if client.Timeout > 30*time.Second {
		client.Timeout = 30 * time.Second
	} else if client.Timeout <= 0 {
		client.Timeout = 10 * time.Second
	}

	req, err := http.NewRequestWithContext(ctx, "GET", target.URL, nil)
	if err != nil {
		return telemetry, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", getRandomUserAgent())
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	var tDnsStart, tTlsStart, tTcpStart time.Time
	var tDnsEnd, tTlsEnd, tTcpEnd, tTtfbEnd time.Time

	trace := &httptrace.ClientTrace{
		DNSStart: func(info httptrace.DNSStartInfo) { tDnsStart = time.Now() },
		DNSDone: func(info httptrace.DNSDoneInfo) {
			tDnsEnd = time.Now()
			telemetry.DNSResolved = (info.Err == nil)
			if len(info.Addrs) > 0 {
				telemetry.IPAddress = info.Addrs[0].IP.String()
			}
		},
		ConnectStart: func(network, addr string) { tTcpStart = time.Now() },
		ConnectDone: func(network, addr string, err error) {
			tTcpEnd = time.Now()
			telemetry.TCPPortOpen = (err == nil)
		},
		TLSHandshakeStart: func() { tTlsStart = time.Now() },
		TLSHandshakeDone: func(state tls.ConnectionState, err error) {
			tTlsEnd = time.Now()
			telemetry.TLSValid = (err == nil)
			if err != nil {
				telemetry.TLSError = err.Error()
			}
			if len(state.PeerCertificates) > 0 {
				cert := state.PeerCertificates[0]
				exp := cert.NotAfter
				telemetry.SSLExpiryDate = &exp
				telemetry.SSLIssuer = cert.Issuer.String()
			}
		},
		GotFirstResponseByte: func() { tTtfbEnd = time.Now() },
	}

	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	httpStart := time.Now()
	resp, httpErr := client.Do(req)

	// Calculate granular latencies
	if !tDnsEnd.IsZero() && !tDnsStart.IsZero() {
		telemetry.DNSLatencyMs = int(tDnsEnd.Sub(tDnsStart).Milliseconds())
	}
	if !tTcpEnd.IsZero() && !tTcpStart.IsZero() {
		telemetry.TCPConnectMs = int(tTcpEnd.Sub(tTcpStart).Milliseconds())
	}
	if !tTlsEnd.IsZero() && !tTlsStart.IsZero() {
		telemetry.TLSLatencyMs = int(tTlsEnd.Sub(tTlsStart).Milliseconds())
	}
	if !tTtfbEnd.IsZero() {
		telemetry.TTFBLatencyMs = int(tTtfbEnd.Sub(httpStart).Milliseconds())
	}

	telemetry.ResponseTimeMs = int(time.Since(httpStart).Milliseconds())

	if httpErr != nil {
		telemetry.HTTPError = httpErr.Error()
		// Even on error, we return the telemetry gathered so far!
		// No early exit.
		return telemetry, nil
	}
	defer resp.Body.Close()

	telemetry.HTTPStatus = resp.StatusCode
	telemetry.Headers = resp.Header

	// Check for common CDN signatures
	serverHeader := resp.Header.Get("Server")
	cfRay := resp.Header.Get("Cf-Ray")
	if strings.Contains(strings.ToLower(serverHeader), "cloudflare") || cfRay != "" {
		telemetry.IsCDN = true
		telemetry.CDNProvider = "Cloudflare"
	}

	// Memory Safety: Limit body read to 1MB
	limitedReader := io.LimitReader(resp.Body, 1*1024*1024)
	bodyBytes, readErr := io.ReadAll(limitedReader)
	if readErr == nil {
		telemetry.ResponseBody = bodyBytes
	}

	return telemetry, nil
}
