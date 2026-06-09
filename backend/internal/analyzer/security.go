package analyzer

import (
	"strings"
	"github.com/spmt/monitoring/internal/engine"
)

type SecurityAnalyzer struct {}

func NewSecurityAnalyzer() *SecurityAnalyzer {
	return &SecurityAnalyzer{}
}

func (a *SecurityAnalyzer) Analyze(t engine.Telemetry) []engine.Signal {
	var signals []engine.Signal

	// 1. TLS Checks
	if t.TCPPortOpen && strings.HasPrefix(t.URL, "https://") && !t.TLSValid && t.TLSError != "" {
		errStr := strings.ToLower(t.TLSError)
		sigName := "TLS_HANDSHAKE_FAILED"
		
		if strings.Contains(errStr, "expired") {
			sigName = "TLS_CERT_EXPIRED"
		} else if strings.Contains(errStr, "authority") || strings.Contains(errStr, "self signed") {
			sigName = "TLS_CERT_UNTRUSTED"
		} else if strings.Contains(errStr, "match") {
			sigName = "TLS_CERT_MISMATCH"
		}
		
		signals = append(signals, engine.Signal{
			Name:        sigName,
			Description: "SSL/TLS validation warning: " + t.TLSError,
			Severity:    engine.SeverityWarning,
		})
	}

	// 2. WAF / Security Blocks
	bodyStr := strings.ToLower(string(t.ResponseBody))
	
	// Server Header Heuristics
	var serverHeader string
	if vals, ok := t.Headers["Server"]; ok && len(vals) > 0 {
		serverHeader = strings.ToLower(vals[0])
	}
	isWafHeader := strings.Contains(serverHeader, "cloudflare") || 
				   strings.Contains(serverHeader, "imperva") || 
				   strings.Contains(serverHeader, "akamai") ||
				   strings.Contains(serverHeader, "sucuri")

	// Body Heuristics (More robust patterns)
	isWafBody := strings.Contains(bodyStr, "fortigate") || 
				 strings.Contains(bodyStr, "zscaler") || 
				 strings.Contains(bodyStr, "palo alto") || 
				 strings.Contains(bodyStr, "firewall block") ||
				 strings.Contains(bodyStr, "policy restricted") ||
				 strings.Contains(bodyStr, "attention required")
				 
	isCaptcha := strings.Contains(bodyStr, "recaptcha") || 
				 strings.Contains(bodyStr, "h-captcha") || 
				 strings.Contains(bodyStr, "turnstile") || 
				 strings.Contains(bodyStr, "cf-challenge")

	isCaptivePortal := strings.Contains(bodyStr, "captive portal") || 
					   strings.Contains(bodyStr, "login to wifi") || 
					   strings.Contains(bodyStr, "mikrotik")

	isInternetPositif := strings.Contains(bodyStr, "internet positif") || 
						 strings.Contains(bodyStr, "mercusuar") || 
						 strings.Contains(bodyStr, "kategori terlarang") ||
						 strings.Contains(bodyStr, "content blocked")

	if t.HTTPStatus == 403 || isWafBody || (isWafHeader && t.HTTPStatus >= 400 && t.HTTPStatus != 404) {
		signals = append(signals, engine.Signal{
			Name:        "POSSIBLE_WAF_BLOCK",
			Description: "Access likely blocked by a Web Application Firewall, CDN, or Geo-blocking policy.",
			Severity:    engine.SeverityWarning,
		})
	}

	if isCaptcha {
		signals = append(signals, engine.Signal{
			Name:        "CAPTCHA_DETECTED",
			Description: "Target is demanding a CAPTCHA challenge. Access is restricted.",
			Severity:    engine.SeverityWarning,
		})
	}

	if isCaptivePortal {
		signals = append(signals, engine.Signal{
			Name:        "CAPTIVE_PORTAL_DETECTED",
			Description: "Redirected to a local network captive portal.",
			Severity:    engine.SeverityWarning,
		})
	}
	
	if isInternetPositif {
		signals = append(signals, engine.Signal{
			Name:        "CONTENT_BLOCKED_ISP",
			Description: "Blocked by ISP / Internet Positif.",
			Severity:    engine.SeverityCritical,
		})
	}

	return signals
}
