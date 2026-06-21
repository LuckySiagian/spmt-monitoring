package notification

import (
	"strings"
	"testing"
	"time"

	"github.com/spmt/monitoring/internal/model"
)

// realRootCause is a representative evidence JSON as stored in
// MonitoringLog.RootCause for an OFFLINE site (the httpbin timeout case): DNS/TCP/TLS
// all succeed, but the HTTP request times out.
const realRootCause = `{
  "dns_resolved": true,
  "tcp_connected": true,
  "tls_handshake_ok": true,
  "tls_error": null,
  "http_status_code": null,
  "http_error": "Get \"https://httpbin.org/delay/4\": context deadline exceeded",
  "response_time_ms": 30000,
  "ip_address": "52.202.201.157",
  "investigation_report": {
    "primary_key": "OFFLINE",
    "interpretation": "OFFLINE: timeout (server tidak merespons tepat waktu).",
    "evidence": ["✓ DNS resolved", "✗ HTTP error", "Response time: 30000 ms"],
    "recommended_action": ["Pastikan web server hidup dan dapat dijangkau dari jaringan."]
  }
}`

// googleOfflineRootCause mirrors the user-provided example: DNS resolves, but ICMP
// and TCP fail, so HTTP and SSL are never reached.
const googleOfflineRootCause = `{
  "dns_resolved": true,
  "icmp_status": false,
  "tcp_connected": false,
  "tls_handshake_ok": false,
  "http_status_code": null
}`

// critical5xxRootCause: server up, TCP/TLS fine, but returns HTTP 503.
const critical5xxRootCause = `{
  "dns_resolved": true,
  "icmp_status": true,
  "tcp_connected": true,
  "tls_handshake_ok": true,
  "http_status_code": 503
}`

// healthyRootCause: everything passes (used for ONLINE recovery diagnostics).
const healthyRootCause = `{
  "dns_resolved": true,
  "icmp_status": true,
  "tcp_connected": true,
  "tls_handshake_ok": true,
  "http_status_code": 200
}`

func TestParseRootCause(t *testing.T) {
	tests := []struct {
		name           string
		in             string
		wantCause      string
		wantParsed     bool
		wantRecommends int
	}{
		{
			name:           "full report: prefix stripped, recommendation captured",
			in:             realRootCause,
			wantCause:      "Timeout (server tidak merespons tepat waktu).",
			wantParsed:     true,
			wantRecommends: 1,
		},
		{
			name:       "plain text passes through (capitalised, punctuated)",
			in:         "penyebab tidak diketahui",
			wantCause:  "Penyebab tidak diketahui.",
			wantParsed: false,
		},
		{
			name:       "chaos simulator JSON: friendly fallback",
			in:         `{"dns_resolved": false, "http_error": "DNS_FAILURE_SIMULATED"}`,
			wantCause:  "Server tidak dapat dihubungi.",
			wantParsed: true,
		},
		{
			name:       "empty stays safe",
			in:         "",
			wantCause:  "Penyebab tidak diketahui.",
			wantParsed: false,
		},
		{
			name:       "malformed JSON stays safe (no raw dump)",
			in:         `{"investigation_report": broken`,
			wantCause:  "Penyebab tidak diketahui.",
			wantParsed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseRootCause(tt.in)
			if got.PlainCause != tt.wantCause {
				t.Errorf("PlainCause = %q, want %q", got.PlainCause, tt.wantCause)
			}
			if got.Parsed != tt.wantParsed {
				t.Errorf("Parsed = %v, want %v", got.Parsed, tt.wantParsed)
			}
			if len(got.Recommendation) != tt.wantRecommends {
				t.Errorf("Recommendation count = %d, want %d", len(got.Recommendation), tt.wantRecommends)
			}
		})
	}
}

func mustNotLeakRawJSON(t *testing.T, msg string) {
	t.Helper()
	for _, leak := range []string{"investigation_report", "http_status_code", "dns_resolved", "{"} {
		if strings.Contains(msg, leak) {
			t.Fatalf("message leaked raw JSON token %q:\n%s", leak, msg)
		}
	}
}

func TestBuildAlertMessage_Offline(t *testing.T) {
	at := time.Date(2026, 6, 17, 13, 25, 10, 0, time.UTC)
	msg := buildAlertMessage(model.StatusOffline, "Google", "https://www.google.com", googleOfflineRootCause, at)

	mustNotLeakRawJSON(t, msg)

	mustContain := []string{
		"🔴 <b>WEBSITE OFFLINE</b>",
		"<b>Service:</b> Google",
		"<b>URL:</b> https://www.google.com",
		"<b>Status:</b> OFFLINE ❌",
		"<b>Analysis:</b>",
		"gagal membangun koneksi TCP ke server tujuan",
		"<b>Diagnostics:</b>",
		"• DNS: Resolved ✅",
		"• Ping: Failed ❌",
		"• TCP Connection: Failed ❌",
		"• HTTP Response: Not Available",
		"• SSL Validation: Not Available",
		"<b>Possible Causes:</b>",
		"• Server tujuan tidak merespons.",
		"• Firewall atau security policy memblokir koneksi.",
		"<b>Impact:</b>",
		"<b>Recommended Action:</b>",
		"Periksa status server, firewall, load balancer, serta konektivitas jaringan menuju website.",
		"<b>Time:</b>\n13:25:10",
	}
	for _, want := range mustContain {
		if !strings.Contains(msg, want) {
			t.Errorf("message missing %q\n--- got ---\n%s", want, msg)
		}
	}
	t.Logf("rendered offline message:\n%s", msg)
}

func TestBuildAlertMessage_Critical(t *testing.T) {
	at := time.Date(2026, 6, 17, 13, 25, 10, 0, time.UTC)
	msg := buildAlertMessage(model.StatusCritical, "Portal SPMT", "https://portal.spmt.co.id", critical5xxRootCause, at)

	mustNotLeakRawJSON(t, msg)

	mustContain := []string{
		"🟠 <b>WEBSITE CRITICAL</b>",
		"<b>Status:</b> CRITICAL ⚠️",
		"mengembalikan kode kesalahan HTTP 503",
		"• DNS: Resolved ✅",
		"• Ping: Reachable ✅",
		"• TCP Connection: Connected ✅",
		"• HTTP Response: 503 ❌",
		"• SSL Validation: Valid ✅",
		"• Bug atau error pada aplikasi/backend.",
		"Periksa log aplikasi dan layanan backend",
		"<b>Time:</b>\n13:25:10",
	}
	for _, want := range mustContain {
		if !strings.Contains(msg, want) {
			t.Errorf("critical message missing %q\n--- got ---\n%s", want, msg)
		}
	}
	t.Logf("rendered critical message:\n%s", msg)
}

func TestBuildRecoveryMessage(t *testing.T) {
	now := time.Date(2026, 6, 16, 15, 9, 0, 0, time.UTC)
	downStart := now.Add(-6 * time.Minute) // 15:03

	withDur := buildRecoveryMessage("Portal SPMT", "https://portal.spmt.co.id", healthyRootCause, &downStart, now)
	mustNotLeakRawJSON(t, withDur)
	for _, want := range []string{
		"🟢 <b>WEBSITE ONLINE</b>",
		"<b>Service:</b> Portal SPMT",
		"<b>Status:</b> ONLINE ✅",
		"<b>Analysis:</b>",
		"Sempat bermasalah ±6 menit (15:03 → 15:09).",
		"<b>Diagnostics:</b>",
		"• HTTP Response: 200 ✅",
		"• SSL Validation: Valid ✅",
		"<b>Impact:</b>",
		"<b>Time:</b>\n15:09:00",
	} {
		if !strings.Contains(withDur, want) {
			t.Errorf("recovery message missing %q\n--- got ---\n%s", want, withDur)
		}
	}

	// When downtime span is unknown, the duration sentence is simply omitted.
	noDur := buildRecoveryMessage("Portal SPMT", "https://portal.spmt.co.id", healthyRootCause, nil, now)
	if strings.Contains(noDur, "Sempat bermasalah") {
		t.Errorf("recovery message should omit duration when downStart is nil:\n%s", noDur)
	}

	// With no parseable telemetry, the Diagnostics block is omitted entirely.
	noTel := buildRecoveryMessage("Portal SPMT", "https://portal.spmt.co.id", "", &downStart, now)
	if strings.Contains(noTel, "<b>Diagnostics:</b>") {
		t.Errorf("recovery message should omit diagnostics when telemetry is absent:\n%s", noTel)
	}

	t.Logf("rendered recovery message:\n%s", withDur)
}

func TestBuildDiagnostics_DNSFailureCascades(t *testing.T) {
	f := false
	lines := buildDiagnostics(probeTelemetry{DNSResolved: &f})
	want := []string{
		"DNS: Failed ❌",
		"Ping: Not Available",
		"TCP Connection: Not Available",
		"HTTP Response: Not Available",
		"SSL Validation: Not Available",
	}
	for i, w := range want {
		if lines[i] != w {
			t.Errorf("diagnostics[%d] = %q, want %q", i, lines[i], w)
		}
	}
}
