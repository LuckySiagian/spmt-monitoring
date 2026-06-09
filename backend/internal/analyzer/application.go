package analyzer

import (
	"strings"
	"github.com/spmt/monitoring/internal/engine"
)

type ApplicationAnalyzer struct {}

func NewApplicationAnalyzer() *ApplicationAnalyzer {
	return &ApplicationAnalyzer{}
}

func (a *ApplicationAnalyzer) Analyze(t engine.Telemetry) []engine.Signal {
	var signals []engine.Signal

	// Only proceed if we got an HTTP response
	if t.HTTPStatus == 0 {
		return signals
	}

	if t.HTTPStatus >= 500 {
		sigName := "HTTP_5XX_ERROR"
		desc := "Server returned a fatal 5xx application error."
		if t.HTTPStatus == 502 {
			sigName = "HTTP_502_BAD_GATEWAY"
			desc = "Bad Gateway (Nginx/Apache running, but upstream app/backend is down)."
		} else if t.HTTPStatus == 504 {
			sigName = "HTTP_504_GATEWAY_TIMEOUT"
			desc = "Gateway Timeout (Backend application took too long to respond)."
		} else if t.HTTPStatus == 500 {
			sigName = "HTTP_500_INTERNAL_ERROR"
			desc = "Internal Server Error (Application crash or unhandled exception)."
		}

		signals = append(signals, engine.Signal{
			Name:        sigName,
			Description: desc,
			Severity:    engine.SeverityCritical,
			Value:       t.HTTPStatus,
		})
	}

	if t.HTTPStatus == 429 {
		signals = append(signals, engine.Signal{
			Name:        "RATE_LIMIT_EXCEEDED",
			Description: "Target is rate limiting the monitoring node (HTTP 429). Website is likely healthy.",
			Severity:    engine.SeverityWarning,
		})
	}

	if t.TTFBLatencyMs > 3000 {
		signals = append(signals, engine.Signal{
			Name:        "SLOW_TTFB",
			Description: "Time to First Byte is exceptionally slow, indicating backend performance issues.",
			Severity:    engine.SeverityWarning,
			Value:       t.TTFBLatencyMs,
		})
	}

	if t.ResponseTimeMs > 10000 {
		signals = append(signals, engine.Signal{
			Name:        "HIGH_RESPONSE_TIME",
			Description: "Overall response time exceeded 10 seconds.",
			Severity:    engine.SeverityWarning,
			Value:       t.ResponseTimeMs,
		})
	}

	if t.RedirectCount >= 5 {
		signals = append(signals, engine.Signal{
			Name:        "REDIRECT_LOOP",
			Description: "Excessive HTTP redirects detected.",
			Severity:    engine.SeverityCritical,
		})
	}
	
	bodyStr := strings.ToLower(string(t.ResponseBody))
	
	// Database Down Heuristic
	if strings.Contains(bodyStr, "error establishing a database connection") || 
	   strings.Contains(bodyStr, "database error") ||
	   strings.Contains(bodyStr, "db connection failed") {
		signals = append(signals, engine.Signal{
			Name:        "DATABASE_CONNECTION_ERROR",
			Description: "Application failed to connect to its database.",
			Severity:    engine.SeverityCritical,
		})
	}

	hasRetryAfter := false
	if vals, ok := t.Headers["Retry-After"]; ok && len(vals) > 0 {
		hasRetryAfter = true
	}

	if strings.Contains(bodyStr, "maintenance") || strings.Contains(bodyStr, "pemeliharaan") || strings.Contains(bodyStr, "perbaikan sistem") || (t.HTTPStatus == 503 && hasRetryAfter) {
		signals = append(signals, engine.Signal{
			Name:        "MAINTENANCE_MODE",
			Description: "Website explicitly indicates it is under maintenance.",
			Severity:    engine.SeverityWarning,
		})
	}

	// Detect if website has been migrated / moved to a new URL
	// Common patterns: announcement popups, banners, or notices
	isMigrated := strings.Contains(bodyStr, "telah dipindah") ||
		strings.Contains(bodyStr, "silakan kunjungi") ||
		strings.Contains(bodyStr, "has been moved") ||
		strings.Contains(bodyStr, "has moved to") ||
		strings.Contains(bodyStr, "please visit") ||
		strings.Contains(bodyStr, "untuk mengakses") && (strings.Contains(bodyStr, "dilakukan pada") || strings.Contains(bodyStr, "landing page"))

	if isMigrated && t.HTTPStatus >= 200 && t.HTTPStatus < 500 {
		signals = append(signals, engine.Signal{
			Name:        "WEBSITE_MIGRATED",
			Description: "Website displays a migration notice — service may have moved to a new URL.",
			Severity:    engine.SeverityWarning,
		})
	}

	if t.HTTPStatus >= 200 && t.HTTPStatus < 300 && len(t.ResponseBody) == 0 {
		signals = append(signals, engine.Signal{
			Name:        "EMPTY_RESPONSE_BODY",
			Description: "Server returned 200 OK but with no content.",
			Severity:    engine.SeverityWarning,
		})
	}

	return signals
}
