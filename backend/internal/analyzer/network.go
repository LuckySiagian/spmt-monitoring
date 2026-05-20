package analyzer

import (
	"strings"
	"github.com/spmt/monitoring/internal/engine"
)

type NetworkAnalyzer struct {}

func NewNetworkAnalyzer() *NetworkAnalyzer {
	return &NetworkAnalyzer{}
}

func (a *NetworkAnalyzer) Analyze(t engine.Telemetry) []engine.Signal {
	var signals []engine.Signal

	if !t.DNSResolved && t.HTTPError != "" {
		signals = append(signals, engine.Signal{
			Name:        "DNS_RESOLUTION_FAILED",
			Description: "Could not resolve domain name to an IP address.",
			Severity:    engine.SeverityCritical,
		})
	}

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

	if t.TCPConnectMs > 2000 {
		signals = append(signals, engine.Signal{
			Name:        "HIGH_TCP_LATENCY",
			Description: "TCP handshake took abnormally long.",
			Severity:    engine.SeverityWarning,
			Value:       t.TCPConnectMs,
		})
	}

	// Also parse HTTPError for broader network layer issues
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
