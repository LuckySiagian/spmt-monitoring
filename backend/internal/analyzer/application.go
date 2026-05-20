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
		signals = append(signals, engine.Signal{
			Name:        "HTTP_5XX_ERROR",
			Description: "Server returned a fatal 5xx application error.",
			Severity:    engine.SeverityCritical,
			Value:       t.HTTPStatus,
		})
	}

	if t.HTTPStatus == 429 {
		signals = append(signals, engine.Signal{
			Name:        "RATE_LIMIT_EXCEEDED",
			Description: "Target is rate limiting the monitoring node (HTTP 429).",
			Severity:    engine.SeverityCritical,
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
	if strings.Contains(bodyStr, "maintenance") || strings.Contains(bodyStr, "pemeliharaan") || strings.Contains(bodyStr, "perbaikan sistem") {
		signals = append(signals, engine.Signal{
			Name:        "MAINTENANCE_MODE",
			Description: "Website explicitly indicates it is under maintenance.",
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
