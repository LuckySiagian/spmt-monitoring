// SIMPLIFIED API RESPONSE STRUCTURES
// These should be used in handler.go for simplified API responses

package handler

import (
	"time"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
)

// SimpleWebsiteResponse - API response for GET /api/websites
// Contains only 4 core parameters (DNS, ICMP, HTTP Status Code, Last Checked)
type SimpleWebsiteResponse struct {
	ID               uuid.UUID  `json:"id"`
	Name             string     `json:"name"`
	URL              string     `json:"url"`
	Description      string     `json:"description"`
	IntervalSeconds  int        `json:"interval_seconds"`
	CreatedAt        time.Time  `json:"created_at"`

	// CORE PARAMETERS (4 only)
	LastCheckedAt    *time.Time `json:"last_checked_at"`    // PARAMETER 4
	DNSResolved      bool       `json:"dns_resolved"`       // PARAMETER 1
	ICMPStatus       bool       `json:"icmp_status"`        // PARAMETER 2
	HTTPStatusCode   *int       `json:"http_status_code"`   // PARAMETER 3
	HTTPErrorMessage *string    `json:"http_error_message"`

	// Computed
	IsOnline         bool       `json:"is_online"`
	Status           string     `json:"status"` // "ONLINE" or "OFFLINE"
}

// FromWebsite converts model.Website to SimpleWebsiteResponse
func (s *SimpleWebsiteResponse) FromWebsite(w *model.Website) {
	s.ID = w.ID
	s.Name = w.Name
	s.URL = w.URL
	s.Description = w.Description
	s.IntervalSeconds = w.IntervalSeconds
	s.CreatedAt = w.CreatedAt
	s.LastCheckedAt = w.LastCheckedAt
	s.DNSResolved = w.DNSResolved
	s.ICMPStatus = w.ICMPStatus
	s.HTTPStatusCode = w.HTTPStatusCode
	s.HTTPErrorMessage = w.HTTPErrorMessage
	s.IsOnline = w.IsOnline

	if w.IsOnline {
		s.Status = "ONLINE"
	} else {
		s.Status = "OFFLINE"
	}
}

// SimpleMonitoringLogResponse - API response for GET /api/websites/{id}/logs
// Historical monitoring data (4 parameters only)
type SimpleMonitoringLogResponse struct {
	CheckedAt        time.Time `json:"checked_at"`        // When checked
	DNSResolved      bool      `json:"dns_resolved"`      // Did DNS resolve?
	ICMPStatus       bool      `json:"icmp_status"`       // Did ICMP ping succeed?
	HTTPStatusCode   *int      `json:"http_status_code"`  // HTTP status code
	HTTPErrorMessage *string   `json:"http_error_message"` // Error message if HTTP failed
	IsOnline         bool      `json:"is_online"`         // Computed
}

// FromMonitoringLog converts model.MonitoringLog to SimpleMonitoringLogResponse
func (s *SimpleMonitoringLogResponse) FromMonitoringLog(l *model.MonitoringLog) {
	s.CheckedAt = l.CheckedAt
	s.DNSResolved = l.DNSResolved
	s.ICMPStatus = l.ICMPStatus
	s.HTTPStatusCode = l.HTTPStatusCode
	s.HTTPErrorMessage = l.HTTPErrorMessage
	s.IsOnline = l.IsOnline
}

// SimpleDashboardResponse - API response for GET /api/dashboard
type SimpleDashboardResponse struct {
	TotalWebsites int       `json:"total_websites"`
	OnlineCount   int       `json:"online_count"`
	OfflineCount  int       `json:"offline_count"`
	SLAPercent    float64   `json:"sla_percent"`
	LastUpdated   time.Time `json:"last_updated"`

	// Recent changes
	RecentChanges []SimpleStatusChangeEvent `json:"recent_changes"`
}

// SimpleStatusChangeEvent - Occurred status change
type SimpleStatusChangeEvent struct {
	Website      string    `json:"website"`
	WebsiteID    uuid.UUID `json:"website_id"`
	URL          string    `json:"url"`
	OldStatus    string    `json:"old_status"`    // "ONLINE" or "OFFLINE"
	NewStatus    string    `json:"new_status"`    // "ONLINE" or "OFFLINE"
	Reason       string    `json:"reason"`        // Why it changed
	ChangedAt    time.Time `json:"changed_at"`
}

// ─── HELPER FUNCTIONS FOR HANDLER ─────────────────────────────

// ConvertToSimpleWebsiteResponse converts multiple websites to simplified response
func ConvertToSimpleWebsiteResponse(websites []*model.Website) []SimpleWebsiteResponse {
	if websites == nil {
		return []SimpleWebsiteResponse{}
	}
	result := make([]SimpleWebsiteResponse, 0, len(websites))
	for _, w := range websites {
		var s SimpleWebsiteResponse
		s.FromWebsite(w)
		result = append(result, s)
	}
	return result
}

// ConvertToSimpleMonitoringLogResponse converts logs to simplified response
func ConvertToSimpleMonitoringLogResponse(logs []*model.MonitoringLog) []SimpleMonitoringLogResponse {
	if logs == nil {
		return []SimpleMonitoringLogResponse{}
	}
	result := make([]SimpleMonitoringLogResponse, 0, len(logs))
	for _, l := range logs {
		var s SimpleMonitoringLogResponse
		s.FromMonitoringLog(l)
		result = append(result, s)
	}
	return result
}
