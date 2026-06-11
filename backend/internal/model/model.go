package model

import (
	"time"

	"github.com/google/uuid"
)

func PtrString(s string) *string {
	return &s
}

// ─── User ────────────────────────────────────────────────────

type Role string

const (
	RoleSuperAdmin   Role = "superadmin"
	RoleAdmin        Role = "admin"
	RoleAdminPelindo Role = "adminpelindo"
	RoleViewer       Role = "viewer"
)

type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Username     string    `json:"username" db:"username"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Email        string    `json:"email" db:"email"`
	TelegramID   *string   `json:"telegram_id" db:"telegram_id"`
	Role         Role      `json:"role" db:"role"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type UserResponse struct {
	ID         uuid.UUID `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	TelegramID *string   `json:"telegram_id,omitempty"`
	Role       Role      `json:"role"`
	CreatedAt  time.Time `json:"created_at"`
}

// ─── Website ─────────────────────────────────────────────────

type Website struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	Name            string     `json:"name" db:"name"`
	URL             string     `json:"url" db:"url"`
	Description     string     `json:"description" db:"description"`
	IntervalSeconds int        `json:"interval_seconds" db:"interval_seconds"`
	SaveScreenshot  bool       `json:"save_screenshot" db:"save_screenshot"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	Status          string     `json:"status,omitempty"`
	StatusCode      *int       `json:"status_code,omitempty"`
	ResponseTimeMs  *int       `json:"response_time_ms,omitempty"`
	DNSLatencyMs    *int       `json:"dns_latency_ms,omitempty"`
	TLSLatencyMs    *int       `json:"tls_latency_ms,omitempty"`
	TTFBLatencyMs   *int       `json:"ttfb_latency_ms,omitempty"`
	DNSResolved     bool       `json:"dns_resolved,omitempty"`
	SSLValid        *bool      `json:"ssl_valid,omitempty"`
	SSLExpiryDate   *time.Time `json:"ssl_expiry_date,omitempty"`
	LastChecked     *time.Time `json:"last_checked,omitempty"`
	IPAddress       string     `json:"ip_address,omitempty"`
	RootCause       string     `json:"root_cause,omitempty"`
	HealthScore     int        `json:"health_score,omitempty"`
	Confidence      int        `json:"confidence,omitempty"`
	IsBrowserAccessible bool       `json:"is_browser_accessible,omitempty"`
	FinalReason         string     `json:"final_reason,omitempty"`
	FinalDecisionSource string     `json:"final_decision_source,omitempty"`
	ResolverStage       string     `json:"resolver_stage,omitempty"`

	// Core Simplified Fields (4 Core Parameters)
	LastCheckedAt    *time.Time `json:"last_checked_at,omitempty"`
	ICMPStatus       bool       `json:"icmp_status,omitempty"`
	HTTPStatusCode   *int       `json:"http_status_code,omitempty"`
	HTTPErrorMessage *string    `json:"http_error_message,omitempty"`
	IsOnline         bool       `json:"is_online,omitempty"`
}

func (w *Website) ComputeIsOnline() bool {
	return w.DNSResolved && w.ICMPStatus && w.HTTPStatusCode != nil && *w.HTTPStatusCode >= 200 && *w.HTTPStatusCode < 400
}

type CreateWebsiteRequest struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Description     string `json:"description"`
	IntervalSeconds int    `json:"interval_seconds"`
	SaveScreenshot  bool   `json:"save_screenshot"`
}

type UpdateWebsiteRequest struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Description     string `json:"description"`
	IntervalSeconds int    `json:"interval_seconds"`
	SaveScreenshot  bool   `json:"save_screenshot"`
}

// ─── Monitoring Log ──────────────────────────────────────────

type LogStatus string

const (
	StatusOnline   LogStatus = "ONLINE"
	StatusWarning  LogStatus = "WARNING"
	StatusDegraded LogStatus = "DEGRADED"
	StatusCritical LogStatus = "CRITICAL"
	StatusOffline  LogStatus = "OFFLINE"
)

type MonitoringLog struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	WebsiteID      uuid.UUID  `json:"website_id" db:"website_id"`
	CheckedAt      time.Time  `json:"checked_at" db:"checked_at"`
	DNSResolved    bool       `json:"dns_resolved" db:"dns_resolved"`
	DNSLatencyMs   *int       `json:"dns_latency_ms" db:"dns_latency_ms"`
	ICMPStatus     bool       `json:"icmp_status" db:"icmp_status"`
	ICMPLatencyMs  *int       `json:"icmp_latency_ms" db:"icmp_latency_ms"`
	TCPPortOpen    bool       `json:"tcp_port_open" db:"tcp_port_open"`
	TLSLatencyMs   *int       `json:"tls_latency_ms" db:"tls_latency_ms"`
	TTFBLatencyMs  *int       `json:"ttfb_latency_ms" db:"ttfb_latency_ms"`
	StatusCode     *int       `json:"status_code" db:"status_code"`
	ResponseTimeMs *int       `json:"response_time_ms" db:"response_time_ms"`
	SSLValid       bool       `json:"ssl_valid" db:"ssl_valid"`
	SSLExpiryDate  *time.Time `json:"ssl_expiry_date" db:"ssl_expiry_date"`
	IPAddress      string     `json:"ip_address" db:"ip_address"`
	ErrorMessage   *string    `json:"error_message" db:"error_message"`
	Status         LogStatus  `json:"status" db:"status"`
	RootCause      string     `json:"root_cause" db:"root_cause"`
	Recommendation string     `json:"recommendation" db:"recommendation"`
	HealthScore    int        `json:"health_score" db:"health_score"`
	Confidence     int        `json:"confidence" db:"confidence"`
	IsBrowserAccessible bool       `json:"is_browser_accessible" db:"is_browser_accessible"`
	FinalReason         string     `json:"final_reason" db:"final_reason"`
	FinalDecisionSource string     `json:"final_decision_source" db:"final_decision_source"`
	ResolverStage       string     `json:"resolver_stage" db:"resolver_stage"`

	// Core Simplified Fields (4 Core Parameters)
	HTTPStatusCode   *int       `json:"http_status_code" db:"http_status_code"`
	HTTPErrorMessage *string    `json:"http_error_message" db:"http_error_message"`
	IsOnline         bool       `json:"is_online" db:"is_online"`
}

func (l *MonitoringLog) ComputeIsOnline() bool {
	return l.DNSResolved && l.ICMPStatus && l.HTTPStatusCode != nil && *l.HTTPStatusCode >= 200 && *l.HTTPStatusCode < 400
}

// ─── Status Events ───────────────────────────────────────────

type StatusEvent struct {
	ID          uuid.UUID `json:"id" db:"id"`
	WebsiteID   uuid.UUID `json:"website_id" db:"website_id"`
	WebsiteName string    `json:"website_name" db:"website_name"`
	OldStatus   string    `json:"old_status" db:"old_status"`
	NewStatus   string    `json:"new_status" db:"new_status"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// ─── Status History ──────────────────────────────────────────

type StatusHistoryPoint struct {
	Time     time.Time `json:"time"`
	Online   int       `json:"online"`
	Critical int       `json:"critical"`
	Offline  int       `json:"offline"`
}

// ─── Dashboard Summary ───────────────────────────────────────

type DashboardSummary struct {
	TotalWebsites   int       `json:"total_websites"`
	OnlineCount     int       `json:"online_count"`
	CriticalCount   int       `json:"critical_count"`
	OfflineCount    int       `json:"offline_count"`
	SLAPercent      float64   `json:"sla_percent"`
	AvgResponseTime float64   `json:"avg_response_time"`
	ActiveAlerts    int       `json:"active_alerts"`
	LastUpdated     time.Time `json:"last_updated"`
}

// ─── Auth ─────────────────────────────────────────────────────

type LoginRequest struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token"`
}
type RegisterRequest struct {
	Username   string  `json:"username"`
	Password   string  `json:"password"`
	Email      string  `json:"email"`
	TelegramID *string `json:"telegram_id"`
}
type UpdateProfileRequest struct {
	Email      string  `json:"email"`
	TelegramID *string `json:"telegram_id"`
}
type ChangePasswordRequest struct {
	OldPassword     string `json:"old_password"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}
type LoginResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}
type PromoteRequest struct {
	UserID string `json:"user_id"`
}
type DemoteRequest struct {
	UserID string `json:"user_id"`
}
type CreateUserRequest struct {
	Username   string  `json:"username"`
	Password   string  `json:"password"`
	Email      string  `json:"email"`
	TelegramID *string `json:"telegram_id"`
	Role       string  `json:"role"`
}
type DeleteUserRequest struct {
	UserID string `json:"user_id"`
}

// ─── WebSocket ────────────────────────────────────────────────

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// WSMonitorUpdate — dikirim setiap worker selesai cek website
type WSMonitorUpdate struct {
	WebsiteID      string     `json:"website_id"`
	WebsiteName    string     `json:"website_name"`
	URL            string     `json:"url"`
	Status         LogStatus  `json:"status"`
	IPAddress      string     `json:"ip_address"`
	DNSResolved    bool       `json:"dns_resolved"`
	DNSLatencyMs   *int       `json:"dns_latency_ms"`
	ICMPStatus     bool       `json:"icmp_status"`
	ICMPLatencyMs  *int       `json:"icmp_latency_ms"`
	TCPPortOpen    bool       `json:"tcp_port_open"`
	TLSLatencyMs   *int       `json:"tls_latency_ms"`
	TTFBLatencyMs  *int       `json:"ttfb_latency_ms"`
	StatusCode     *int       `json:"status_code"`
	ResponseTimeMs *int       `json:"response_time_ms"`
	SSLValid       bool       `json:"ssl_valid"`
	SSLExpiryDate  *time.Time `json:"ssl_expiry_date"`
	ErrorMessage   *string    `json:"error_message"`
	RootCause      string     `json:"root_cause"`
	Recommendation string     `json:"recommendation"`
	HealthScore    int        `json:"health_score"`
	Confidence     int        `json:"confidence"`
	IsBrowserAccessible bool       `json:"is_browser_accessible"`
	FinalReason         string     `json:"final_reason"`
	FinalDecisionSource string     `json:"final_decision_source"`
	ResolverStage       string     `json:"resolver_stage"`
	CheckedAt           time.Time  `json:"checked_at"`
}

// WSStatusChange — event perubahan status untuk notifikasi frontend
type WSStatusChange struct {
	Type           string    `json:"type"`
	Website        string    `json:"website"`
	WebsiteID      string    `json:"website_id"`
	URL            string    `json:"url"`
	OldStatus      string    `json:"old_status"`
	NewStatus      string    `json:"new_status"`
	RootCause      string    `json:"root_cause"`
	IPAddress      string    `json:"ip_address"`
	ResponseTimeMs *int      `json:"response_time_ms"`
	Timestamp      time.Time `json:"timestamp"`
}

type SystemHealth struct {
	ActiveWorkers    int       `json:"active_workers"`
	WorkerQueueSize  int       `json:"worker_queue_size"`
	ActiveGoroutines int       `json:"active_goroutines"`
	WSConnections    int       `json:"ws_connections"`
	BackendCPU       float64   `json:"backend_cpu"`
	BackendRAM       float64   `json:"backend_ram"`
	MonitorLatencyMs int       `json:"monitor_latency_ms"`
	UpdatedAt        time.Time `json:"updated_at"`
	PublicIP         string    `json:"public_ip"`
	NetworkType      string    `json:"network_type"`
	NetworkName      string    `json:"network_name"`
	InterfaceAlias   string    `json:"interface_alias"`
	LocalGateway     string    `json:"local_gateway"`
	DNSResolver      string    `json:"dns_resolver"`
}

// ─── Network Context ──────────────────────────────────────────

type NetworkContext struct {
	PublicIP       string    `json:"public_ip"`
	LocalGateway   string    `json:"local_gateway"`
	DNSResolver    string    `json:"dns_resolver"`
	ASN            string    `json:"asn"`
	Provider       string    `json:"provider"`
	NetworkType    string    `json:"network_type"` // OFFICE, PUBLIC, VPN, UNKNOWN
	InterfaceAlias string    `json:"interface_alias"`
	ConnectionName string    `json:"connection_name"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type WSNetworkContextUpdate struct {
	Type    string         `json:"type"`
	Context NetworkContext `json:"context"`
}

// ─── Audit Log ────────────────────────────────────────────────

type AuditLog struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    *uuid.UUID `json:"user_id,omitempty" db:"user_id"`
	Username  string    `json:"username" db:"username"`
	Action    string    `json:"action" db:"action"`
	Target    string    `json:"target" db:"target"`
	Details   string    `json:"details" db:"details"`
	IPAddress string    `json:"ip_address" db:"ip_address"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// ─── Incidents & Maintenance ───────────────────────────────────

type Incident struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	WebsiteID      uuid.UUID  `json:"website_id" db:"website_id"`
	WebsiteName    string     `json:"website_name,omitempty" db:"website_name"`
	Title          string     `json:"title" db:"title"`
	Status         string     `json:"status" db:"status"` // TRIGGERED, ACKNOWLEDGED, INVESTIGATING, RESOLVED, CLOSED
	Severity       string     `json:"severity" db:"severity"`
	AssignedUserID *uuid.UUID `json:"assigned_user_id" db:"assigned_user_id"`
	AssignedName   *string    `json:"assigned_name,omitempty" db:"assigned_name"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	ResolvedAt     *time.Time `json:"resolved_at" db:"resolved_at"`
	ClosedAt       *time.Time `json:"closed_at" db:"closed_at"`
}

type MaintenanceWindow struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	WebsiteID     *uuid.UUID `json:"website_id" db:"website_id"`
	WebsiteName   *string    `json:"website_name,omitempty" db:"website_name"`
	StartTime     time.Time  `json:"start_time" db:"start_time"`
	EndTime       time.Time  `json:"end_time" db:"end_time"`
	Description   string     `json:"description" db:"description"`
	CreatedBy     *uuid.UUID `json:"created_by" db:"created_by"`
	CreatedByName *string    `json:"created_by_name,omitempty" db:"created_by_name"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
}

type IncidentComment struct {
	ID         uuid.UUID `json:"id" db:"id"`
	IncidentID uuid.UUID `json:"incident_id" db:"incident_id"`
	UserID     uuid.UUID `json:"user_id" db:"user_id"`
	Username   string    `json:"username" db:"username"`
	Comment    string    `json:"comment" db:"comment"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

type IncidentHistory struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	IncidentID uuid.UUID  `json:"incident_id" db:"incident_id"`
	UserID     *uuid.UUID `json:"user_id" db:"user_id"`
	Username   string     `json:"username" db:"username"`
	Action     string     `json:"action" db:"action"`
	Details    string     `json:"details" db:"details"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
}

type WebsiteSLA struct {
	SLA24h float64 `json:"sla_24h"`
	SLA7d  float64 `json:"sla_7d"`
	SLA30d float64 `json:"sla_30d"`
}

type AIChatMessage struct {
	Role    string `json:"role"`    // "user" or "model"
	Message string `json:"message"`
}

type AIChatRequest struct {
	Message string          `json:"message"`
	History []AIChatMessage `json:"history"`
}

