package analyzer

import (
	"strings"
	"github.com/spmt/monitoring/internal/engine"
)

type NetworkAnalyzer struct{}

func NewNetworkAnalyzer() *NetworkAnalyzer {
	return &NetworkAnalyzer{}
}

func (a *NetworkAnalyzer) Analyze(t engine.Telemetry) []engine.Signal {
	var signals []engine.Signal

	// 1. Intranet / Private IP Detection (PRIORITY: check before generic DNS/TCP errors)
	// This catches websites like internal corporate apps where DNS resolves to a private IP
	// but the monitoring server's SSRF protection (correctly) blocks the connection.
	isSSRFBlocked := strings.Contains(t.HTTPError, "SSRF prevention") ||
		strings.Contains(t.HTTPError, "private IP")

	if t.IsPrivateIP && isSSRFBlocked {
		signals = append(signals, engine.Signal{
			Name:        "INTRANET_ONLY_ACCESS",
			Description: "DNS resolves to a private/internal IP (" + t.IPAddress + "). Website is only accessible from its internal network.",
			Severity:    engine.SeverityWarning,
			Value:       t.IPAddress,
		})
		// Return early — no further network checks make sense for intranet sites
		return signals
	}

	// 2. Private IP resolved but no SSRF error message (e.g. 192.168.x.x via other error path)
	if t.IsPrivateIP && t.DNSResolved && t.HTTPStatus == 0 {
		signals = append(signals, engine.Signal{
			Name:        "INTRANET_ONLY_ACCESS",
			Description: "DNS resolves to a private/internal IP (" + t.IPAddress + "). Website is only accessible from its internal network.",
			Severity:    engine.SeverityWarning,
			Value:       t.IPAddress,
		})
		return signals
	}

	// 3. Standard DNS failure
	if !t.DNSResolved && t.HTTPError != "" {
		signals = append(signals, engine.Signal{
			Name:        "DNS_RESOLUTION_FAILED",
			Description: "Could not resolve domain name to an IP address.",
			Severity:    engine.SeverityCritical,
		})
	}

	// 4. TCP connection failure (DNS succeeded but TCP failed)
	if t.DNSResolved && !t.TCPPortOpen && t.HTTPError != "" {
		desc := "Connection refused or timed out at TCP layer."
		if strings.Contains(strings.ToLower(t.HTTPError), "refused") || strings.Contains(strings.ToLower(t.HTTPError), "reset") {
			desc = "TCP Connection actively refused by target."
		}
		signals = append(signals, engine.Signal{
			Name:        "TCP_CONNECTION_FAILED",
			Description: desc,
			Severity:    engine.SeverityCritical,
		})
	}

	// 5. High TCP latency
	if t.TCPConnectMs > 2000 {
		signals = append(signals, engine.Signal{
			Name:        "HIGH_TCP_LATENCY",
			Description: "TCP handshake took abnormally long.",
			Severity:    engine.SeverityWarning,
			Value:       t.TCPConnectMs,
		})
	}

	// 6. Parse HTTPError for broader network layer issues
	if t.HTTPError != "" {
		errStr := strings.ToLower(t.HTTPError)
		if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline") {
			signals = append(signals, engine.Signal{
				Name:        "NETWORK_TIMEOUT",
				Description: "The network request timed out before completing.",
				Severity:    engine.SeverityCritical,
			})
		}
		if strings.Contains(errStr, "no route") || strings.Contains(errStr, "unreachable") {
			signals = append(signals, engine.Signal{
				Name:        "NETWORK_UNREACHABLE",
				Description: "No route to host network.",
				Severity:    engine.SeverityCritical,
			})
		}
	}

	return signals
}
