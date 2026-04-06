package model

import (
	"time"

	"github.com/google/uuid"
)

// ─── User ────────────────────────────────────────────────────

type Role string

const (
	RoleSuperAdmin Role = "superadmin"
	RoleAdmin      Role = "admin"
	RoleViewer     Role = "viewer"
)

type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Username     string    `json:"username" db:"username"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Role         Role      `json:"role" db:"role"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type UserResponse struct {
	ID        uuid.UUID `json:"id"`
	Username  string    `json:"username"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Website ─────────────────────────────────────────────────

type Website struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	Name            string     `json:"name" db:"name"`
	URL             string     `json:"url" db:"url"`
	Description     string     `json:"description" db:"description"`
	IntervalSeconds int        `json:"interval_seconds" db:"interval_seconds"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	Status          string     `json:"status,omitempty"`
	StatusCode      *int       `json:"status_code,omitempty"`
	ResponseTimeMs  *int       `json:"response_time_ms,omitempty"`
	SSLValid        *bool      `json:"ssl_valid,omitempty"`
	LastChecked     *time.Time `json:"last_checked,omitempty"`
}

type CreateWebsiteRequest struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Description     string `json:"description"`
	IntervalSeconds int    `json:"interval_seconds"`
}

type UpdateWebsiteRequest struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Description     string `json:"description"`
	IntervalSeconds int    `json:"interval_seconds"`
}

// ─── Monitoring Log ──────────────────────────────────────────

type LogStatus string

const (
	StatusOnline   LogStatus = "ONLINE"
	StatusCritical LogStatus = "CRITICAL"
	StatusOffline  LogStatus = "OFFLINE"
	StatusUnknown  LogStatus = "UNKNOWN"
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
	StatusCode     *int       `json:"status_code" db:"status_code"`
	ResponseTimeMs *int       `json:"response_time_ms" db:"response_time_ms"`
	SSLValid       bool       `json:"ssl_valid" db:"ssl_valid"`
	SSLExpiryDate  *time.Time `json:"ssl_expiry_date" db:"ssl_expiry_date"`
	IPAddress      string     `json:"ip_address" db:"ip_address"`
	ErrorMessage   *string    `json:"error_message" db:"error_message"`
	Status         LogStatus  `json:"status" db:"status"`
	RootCause      string     `json:"root_cause" db:"root_cause"`
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
	Unknown  int       `json:"unknown"`
}

// ─── Dashboard Summary ───────────────────────────────────────

type DashboardSummary struct {
	TotalWebsites   int       `json:"total_websites"`
	OnlineCount     int       `json:"online_count"`
	CriticalCount   int       `json:"critical_count"`
	OfflineCount    int       `json:"offline_count"`
	UnknownCount    int       `json:"unknown_count"`
	SLAPercent      float64   `json:"sla_percent"`
	AvgResponseTime float64   `json:"avg_response_time"`
	ActiveAlerts    int       `json:"active_alerts"`
	LastUpdated     time.Time `json:"last_updated"`
}

// ─── Auth ─────────────────────────────────────────────────────

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}
type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
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
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
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
	StatusCode     *int       `json:"status_code"`
	ResponseTimeMs *int       `json:"response_time_ms"`
	SSLValid       bool       `json:"ssl_valid"`
	SSLExpiryDate  *time.Time `json:"ssl_expiry_date"`
	ErrorMessage   *string    `json:"error_message"`
	RootCause      string     `json:"root_cause"`
	CheckedAt      time.Time  `json:"checked_at"`
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
