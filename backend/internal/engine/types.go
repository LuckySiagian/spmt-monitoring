package engine

import (
	"time"

	"github.com/google/uuid"
)

// ─── 1. RAW TELEMETRY ────────────────────────────────────────────────────────

// Telemetry represents the objective facts gathered by the Probers.
// It contains NO assumptions or business logic.
type Telemetry struct {
	WebsiteID     uuid.UUID
	URL           string
	Timestamp     time.Time
	
	// DNS
	DNSResolved   bool
	IPAddress     string
	DNSLatencyMs  int
	
	// TCP / Network
	TCPPortOpen   bool
	TCPConnectMs  int
	
	// TLS / Security
	TLSValid      bool
	TLSLatencyMs  int
	SSLExpiryDate *time.Time
	SSLIssuer     string
	TLSError      string

	// HTTP / Application
	HTTPStatus    int
	ResponseTimeMs int
	TTFBLatencyMs  int
	ResponseBody  []byte // Might be truncated
	HTTPError     string
	
	// Headers / Context
	Headers       map[string][]string
	IsCDN         bool
	CDNProvider   string
	
	// Additional Info
	RedirectCount int
	NetworkType   string // Office, Public, VPN (dari NetworkService)
	NodeHealth    NodeHealth
}

type NodeHealth struct {
	IsHealthy         bool
	QueueBacklog      int
	WorkerStarvation  bool
	DNSLatencyMs      int
	InternetLatencyMs int
	CPUUsage          float64
	RAMUsageMB        float64
}

// ─── 2. SIGNALS ──────────────────────────────────────────────────────────────

type SignalSeverity int

const (
	SeverityInfo SignalSeverity = iota
	SeverityWarning
	SeverityCritical
)

// Signal represents an extracted symptom or evidence from the Telemetry.
type Signal struct {
	Name        string         // e.g., "DNS_RESOLUTION_FAILED", "HIGH_TTFB", "WAF_BLOCK_DETECTED"
	Description string         // Human readable description of the signal
	Severity    SignalSeverity
	Value       interface{}    // Optional raw value that triggered this (e.g., 5000 for a 5000ms latency)
}

// ─── 3. CONCLUSION & INFERENCE ───────────────────────────────────────────────

type Status string

const (
	StatusOnline           Status = "ONLINE"
	StatusWarning          Status = "WARNING"
	StatusDegraded         Status = "DEGRADED"
	StatusCritical         Status = "CRITICAL"
	StatusMonitoringIssue  Status = "MONITORING_ISSUE"
	StatusSuspectedOutage  Status = "SUSPECTED_OUTAGE"
	StatusOffline          Status = "OFFLINE"
	StatusUnknown          Status = "UNKNOWN"
)

// Conclusion is the final output of the Inference Engine.
type Conclusion struct {
	Status              Status
	PrimaryRootCauseKey string   // Machine readable key (e.g., "ERR_CONNECTION_REFUSED")
	PrimaryRootCauseMsg string   // Human readable explanation
	ConfidenceScore     int      // 0 - 100
	HealthScore         int      // 0 - 100
	IsBrowserAccessible bool     // True if a user can actually see a page (even if it's a 403 or WAF)
	Evidence            []Signal // The signals that led to this conclusion
}

// DiagnosticResult wraps the entire pipeline output.
type DiagnosticResult struct {
	WebsiteID  uuid.UUID
	Timestamp  time.Time
	Telemetry  Telemetry
	Conclusion Conclusion
}
