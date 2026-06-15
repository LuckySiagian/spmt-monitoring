package worker

import (
	"testing"

	"github.com/spmt/monitoring/internal/model"
)

func intPtr(i int) *int       { return &i }
func strPtr(s string) *string { return &s }

func TestClassifyStatus(t *testing.T) {
	tests := []struct {
		name string
		log  *model.MonitoringLog
		want model.LogStatus
	}{
		{
			name: "dns failure is offline",
			log:  &model.MonitoringLog{DNSResolved: false},
			want: model.StatusOffline,
		},
		{
			name: "timeout after dns is offline",
			log:  &model.MonitoringLog{DNSResolved: true, ErrorMessage: strPtr("context deadline exceeded (timeout)")},
			want: model.StatusOffline,
		},
		{
			name: "connection refused is offline",
			log:  &model.MonitoringLog{DNSResolved: true, ErrorMessage: strPtr("dial tcp: connection refused")},
			want: model.StatusOffline,
		},
		{
			name: "200 fast is online",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(200), ResponseTimeMs: intPtr(150)},
			want: model.StatusOnline,
		},
		{
			name: "200 slow is warning",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(200), ResponseTimeMs: intPtr(5000)},
			want: model.StatusWarning,
		},
		{
			name: "301 redirect is online",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(301), ResponseTimeMs: intPtr(100)},
			want: model.StatusOnline,
		},
		{
			name: "pure 403 is critical",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(403), ResponseTimeMs: intPtr(100)},
			want: model.StatusCritical,
		},
		{
			name: "404 is warning",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(404), ResponseTimeMs: intPtr(100)},
			want: model.StatusWarning,
		},
		{
			name: "500 is critical",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(500), ResponseTimeMs: intPtr(100)},
			want: model.StatusCritical,
		},
		{
			name: "502 is critical",
			log:  &model.MonitoringLog{DNSResolved: true, StatusCode: intPtr(502), ResponseTimeMs: intPtr(100)},
			want: model.StatusCritical,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _, _, _ := classifyStatus(tt.log)
			if got != tt.want {
				t.Errorf("classifyStatus() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestDetectHumanVerification(t *testing.T) {
	tests := []struct {
		name    string
		log     *model.MonitoringLog
		extras  probeExtras
		body    []byte
		wantHit bool
	}{
		{
			name:    "nil status code",
			log:     &model.MonitoringLog{},
			wantHit: false,
		},
		{
			name:    "200 is not a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(200)},
			extras:  probeExtras{WAFDetected: "Cloudflare"},
			wantHit: false,
		},
		{
			name:    "403 with WAF header is a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(403)},
			extras:  probeExtras{WAFDetected: "Cloudflare"},
			wantHit: true,
		},
		{
			name:    "403 with CDN is a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(403)},
			extras:  probeExtras{IsCDN: true, CDNProvider: "Cloudflare"},
			wantHit: true,
		},
		{
			name:    "403 with cloudflare challenge body",
			log:     &model.MonitoringLog{StatusCode: intPtr(403)},
			body:    []byte("<html><title>Just a moment...</title><div id=\"__cf_chl_opt\"></div></html>"),
			wantHit: true,
		},
		{
			name:    "403 with recaptcha body",
			log:     &model.MonitoringLog{StatusCode: intPtr(403)},
			body:    []byte("<div class=\"g-recaptcha\"></div>"),
			wantHit: true,
		},
		{
			name:    "503 with WAF is a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(503)},
			extras:  probeExtras{WAFDetected: "Akamai"},
			wantHit: true,
		},
		{
			name:    "pure 403 with no signal is not a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(403)},
			extras:  probeExtras{WAFDetected: "Not Detected"},
			body:    []byte("<html><body>403 Forbidden</body></html>"),
			wantHit: false,
		},
		{
			name:    "plain 503 with no signal is not a challenge",
			log:     &model.MonitoringLog{StatusCode: intPtr(503)},
			body:    []byte("Service Unavailable"),
			wantHit: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _ := detectHumanVerification(tt.log, tt.extras, tt.body)
			if got != tt.wantHit {
				t.Errorf("detectHumanVerification() = %v, want %v", got, tt.wantHit)
			}
		})
	}
}
