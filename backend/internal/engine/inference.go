package engine

type InferenceEngine struct{}

func NewInferenceEngine() *InferenceEngine {
	return &InferenceEngine{}
}

func (e *InferenceEngine) Infer(telemetry Telemetry, signals []Signal) Conclusion {
	conclusion := Conclusion{
		Status:              StatusOnline, // Default assumption
		PrimaryRootCauseKey: "ONLINE_NORMAL",
		PrimaryRootCauseMsg: "Service is operating normally.",
		ConfidenceScore:     100,
		HealthScore:         100,
		IsBrowserAccessible: true,
		Evidence:            signals,
	}

	// 1. Evaluate Monitoring Node Health First (Node Failure Isolation)
	if !telemetry.NodeHealth.IsHealthy || telemetry.NodeHealth.WorkerStarvation {
		conclusion.Status = StatusMonitoringIssue
		conclusion.PrimaryRootCauseKey = "MONITORING_NODE_UNHEALTHY"
		conclusion.PrimaryRootCauseMsg = "Monitoring node is experiencing network or resource issues. Target status is unknown."
		conclusion.ConfidenceScore = 20
		conclusion.HealthScore = 100 // Protect SLA
		// We still process signals, but we don't let them override if they are timeouts
	}

	if len(signals) == 0 {
		return conclusion
	}

	// 2. Identify highest severity signal
	var highestSeverity SignalSeverity = SeverityInfo
	criticalCount := 0
	warningCount := 0

	var primarySignal *Signal

	for i, sig := range signals {
		if sig.Severity > highestSeverity {
			highestSeverity = sig.Severity
			primarySignal = &signals[i]
		} else if sig.Severity == highestSeverity && primarySignal == nil {
			primarySignal = &signals[i]
		}

		if sig.Severity == SeverityCritical {
			criticalCount++
		} else if sig.Severity == SeverityWarning {
			warningCount++
		}
	}

	// 3. Status Classification & Reasoning
	if primarySignal != nil {
		if conclusion.Status != StatusMonitoringIssue {
			conclusion.PrimaryRootCauseKey = primarySignal.Name
			conclusion.PrimaryRootCauseMsg = primarySignal.Description

			if highestSeverity == SeverityCritical {
				// Base critical mapping (usually OFFLINE if unreachable)
				conclusion.Status = StatusOffline
				conclusion.HealthScore = 0
				conclusion.IsBrowserAccessible = false

				if primarySignal.Name == "NETWORK_TIMEOUT" {
					// Timeout might be Suspected instead of Offline if evidence is weak
					conclusion.Status = StatusSuspectedOutage
					conclusion.HealthScore = 50
				}

				// Special handling for security blocks (WAF/CAPTCHA) - Server is alive!
				if primarySignal.Name == "POSSIBLE_WAF_BLOCK" || 
				   primarySignal.Name == "CAPTCHA_DETECTED" {
					conclusion.Status = StatusWarning
					conclusion.PrimaryRootCauseMsg = "Access restricted by WAF/security policy"
					conclusion.HealthScore = 50
					conclusion.IsBrowserAccessible = true 
				}

				if primarySignal.Name == "CONTENT_BLOCKED_ISP" {
					conclusion.Status = StatusWarning
					conclusion.PrimaryRootCauseMsg = "Access restricted by ISP / Internet Positif"
					conclusion.HealthScore = 50
					conclusion.IsBrowserAccessible = true 
				}

				// HTTP 5xx means server is alive but app is broken
				if primarySignal.Name == "HTTP_5XX_ERROR" {
					conclusion.Status = StatusDegraded
					conclusion.HealthScore = 20
					conclusion.IsBrowserAccessible = true
					if telemetry.HTTPStatus == 500 {
						conclusion.PrimaryRootCauseMsg = "Internal Server Error"
					} else if telemetry.HTTPStatus == 503 {
						conclusion.PrimaryRootCauseMsg = "Service temporarily unavailable"
					}
				}

			} else if highestSeverity == SeverityWarning {
				// Default warning mapping
				conclusion.Status = StatusWarning
				conclusion.HealthScore = 70
				conclusion.IsBrowserAccessible = true

				if primarySignal.Name == "TLS_CERT_UNTRUSTED" {
					conclusion.Status = StatusDegraded
					conclusion.PrimaryRootCauseMsg = "Self-signed SSL certificate"
				} else if primarySignal.Name == "TLS_CERT_MISMATCH" {
					conclusion.Status = StatusDegraded
					conclusion.PrimaryRootCauseMsg = "SSL hostname mismatch"
				} else if primarySignal.Name == "SLOW_TTFB" || primarySignal.Name == "HIGH_RESPONSE_TIME" {
					if telemetry.ResponseTimeMs > 10000 {
						conclusion.Status = StatusCritical
						conclusion.PrimaryRootCauseMsg = "Extreme latency detected (>10s)"
						conclusion.HealthScore = 20
					} else if telemetry.ResponseTimeMs > 5000 {
						conclusion.Status = StatusDegraded
						conclusion.PrimaryRootCauseMsg = "Server overloaded / High Latency"
						conclusion.HealthScore = 40
					} else {
						conclusion.Status = StatusWarning
						conclusion.PrimaryRootCauseMsg = "Latency tinggi ringan"
					}
				}
			}
		}
	}

	// 4. Contradiction Resolvers & Dynamic Confidence Scoring (Step 5 & 6)
	confidence := 100

	// Node monitoring health penalty
	if !telemetry.NodeHealth.IsHealthy || telemetry.NodeHealth.InternetLatencyMs > 500 {
		confidence -= 40
	}
	
	// Contradiction: HTTP 200 but TLS Warning
	if telemetry.HTTPStatus >= 200 && telemetry.HTTPStatus < 400 && !telemetry.TLSValid {
		conclusion.Status = StatusDegraded
		conclusion.PrimaryRootCauseKey = "SECURITY_ISSUE_HTTP_OK"
		conclusion.PrimaryRootCauseMsg = "Target is responding normally (HTTP 200) but has a TLS/Certificate issue."
		confidence += 20 // High confidence because we literally got HTTP 200
		conclusion.HealthScore = 80 // Protect SLA mostly
	}

	// Correlated Evidence (High confidence)
	if primarySignal != nil && primarySignal.Name == "TCP_CONNECTION_FAILED" && !telemetry.DNSResolved {
		confidence += 10 // Outage strongly validated
		conclusion.Status = StatusOffline
	}

	// Timeout Ambiguity
	if primarySignal != nil && primarySignal.Name == "NETWORK_TIMEOUT" {
		confidence -= 20
	}

	if conclusion.Status == StatusMonitoringIssue {
		// Cap confidence very low so we know it's a guess
		confidence = 10
	}

	// Cap confidence
	if confidence > 100 { confidence = 100 }
	if confidence < 10 { confidence = 10 }

	conclusion.ConfidenceScore = confidence

	return conclusion
}
