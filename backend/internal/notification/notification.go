package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/config"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/repository"
)

type Service struct {
	cfg  *config.Config
	repo *repository.Repository
}

func NewService(cfg *config.Config, repo *repository.Repository) *Service {
	return &Service{
		cfg:  cfg,
		repo: repo,
	}
}

func (s *Service) NotifyStatusChange(websiteID uuid.UUID, websiteName, websiteURL, oldStatus, newStatus, rootCause string) {
	// Telegram pings on the three transitions operators care about: a site going
	// DOWN (OFFLINE), degrading to a server error (CRITICAL), and coming back
	// (ONLINE). WARNING transitions do not ping. Email is delivered as a
	// scheduled weekly report (see SendWeeklyReport), not per-event.
	switch newStatus {
	case string(model.StatusOffline):
		s.sendTelegramAlert(model.StatusOffline, websiteName, websiteURL, rootCause)
	case string(model.StatusCritical):
		s.sendTelegramAlert(model.StatusCritical, websiteName, websiteURL, rootCause)
	case string(model.StatusOnline):
		s.sendTelegramRecovery(websiteID, websiteName, websiteURL, oldStatus, rootCause)
	}
}

// dispatchTelegram sends a pre-formatted message to every configured chat — the
// group chat plus each user's personal Telegram ID, de-duplicated. parseMode is
// "Markdown" or "HTML"; pick HTML for messages carrying dynamic data (URLs, error
// strings) since it only needs <, > and & escaped.
func (s *Service) dispatchTelegram(message, parseMode string) {
	if s.cfg.TelegramToken == "" {
		return
	}

	var chatIDs []string
	if s.cfg.TelegramChatID != "" {
		chatIDs = append(chatIDs, s.cfg.TelegramChatID)
	}

	// Fetch all users to get their telegram IDs
	users, err := s.repo.GetAllUsers(context.Background())
	if err == nil {
		for _, u := range users {
			if u.TelegramID != nil && *u.TelegramID != "" {
				chatIDs = append(chatIDs, *u.TelegramID)
			}
		}
	}

	if len(chatIDs) == 0 {
		return
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.cfg.TelegramToken)
	sent := make(map[string]bool)

	for _, chatID := range chatIDs {
		if sent[chatID] {
			continue
		}
		data := url.Values{}
		data.Set("chat_id", chatID)
		data.Set("text", message)
		data.Set("parse_mode", parseMode)

		resp, err := http.PostForm(apiURL, data)
		if err == nil {
			resp.Body.Close()
		}
		sent[chatID] = true
	}
}

// sendTelegramAlert pings when a site goes OFFLINE or CRITICAL. The message mirrors
// the dashboard's node-detail panel as a structured operator report (Telegram HTML
// parse mode).
func (s *Service) sendTelegramAlert(status model.LogStatus, websiteName, websiteURL, rootCause string) {
	s.dispatchTelegram(buildAlertMessage(status, websiteName, websiteURL, rootCause, time.Now()), "HTML")
}

// buildAlertMessage renders the structured OFFLINE/CRITICAL report: header, service
// details, a plain-language analysis, the DNS→SSL diagnostic checklist, possible
// causes, the user impact, the recommended action, and the time.
func buildAlertMessage(status model.LogStatus, websiteName, websiteURL, rootCause string, now time.Time) string {
	info := parseRootCause(rootCause)
	t := info.Telemetry

	emoji, statusLabel, statusIcon := "🔴", "OFFLINE", "❌"
	if status == model.StatusCritical {
		emoji, statusLabel, statusIcon = "🟠", "CRITICAL", "⚠️"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>WEBSITE %s</b>\n\n", emoji, statusLabel)
	fmt.Fprintf(&b, "<b>Service:</b> %s\n", telegramHTMLEscape(websiteName))
	fmt.Fprintf(&b, "<b>URL:</b> %s\n\n", telegramHTMLEscape(websiteURL))
	fmt.Fprintf(&b, "<b>Status:</b> %s %s\n\n", statusLabel, statusIcon)

	fmt.Fprintf(&b, "<b>Analysis:</b>\n%s\n\n", telegramHTMLEscape(buildAnalysis(status, t, info)))

	b.WriteString("<b>Diagnostics:</b>\n")
	for _, line := range buildDiagnostics(t) {
		fmt.Fprintf(&b, "• %s\n", line)
	}
	b.WriteString("\n")

	if causes := buildPossibleCauses(status, t); len(causes) > 0 {
		b.WriteString("<b>Possible Causes:</b>\n")
		for _, c := range causes {
			fmt.Fprintf(&b, "• %s\n", telegramHTMLEscape(c))
		}
		b.WriteString("\n")
	}

	fmt.Fprintf(&b, "<b>Impact:</b>\n%s\n\n", telegramHTMLEscape(buildImpact(status, t)))
	fmt.Fprintf(&b, "<b>Recommended Action:</b>\n%s\n\n", telegramHTMLEscape(buildRecommendedAction(status, t, info)))
	fmt.Fprintf(&b, "<b>Time:</b>\n%s", now.Format("15:04:05"))

	return b.String()
}

// rootCauseInfo holds the fields extracted from a MonitoringLog's root_cause
// evidence: a plain-language cause, the engine's recommended action, and the raw
// probe telemetry used to render the diagnostics checklist.
type rootCauseInfo struct {
	PlainCause     string
	Recommendation []string
	Telemetry      probeTelemetry
	Parsed         bool // true when JSON telemetry was successfully parsed
}

// probeTelemetry is the subset of the evidence JSON the notifications surface.
// Pointers distinguish "field present" from "zero value" so absent fields stay
// hidden (chaos-simulator payloads carry only a couple of these).
type probeTelemetry struct {
	HTTPError      string `json:"http_error"`
	Interpretation string `json:"interpretation"`
	DNSResolved    *bool  `json:"dns_resolved"`
	ICMPStatus     *bool  `json:"icmp_status"`
	TCPConnected   *bool  `json:"tcp_connected"`
	TLSHandshakeOK *bool  `json:"tls_handshake_ok"`
	TLSError       string `json:"tls_error"`
	HTTPStatusCode *int   `json:"http_status_code"`
	Report         *struct {
		Interpretation string   `json:"interpretation"`
		Evidence       []string `json:"evidence"`
		Recommendation []string `json:"recommended_action"`
	} `json:"investigation_report"`
}

// parseRootCause turns the backend's evidence JSON (MonitoringLog.RootCause) into a
// plain-language cause, the recommended action, and the parsed telemetry. Degrades
// gracefully when the value is already plain text, lacks an investigation report
// (e.g. chaos simulators emit only http_error), or can't be parsed at all.
func parseRootCause(rootCause string) rootCauseInfo {
	info := rootCauseInfo{PlainCause: "Penyebab tidak diketahui."}

	trimmed := strings.TrimSpace(rootCause)
	if trimmed == "" {
		return info
	}
	if !strings.HasPrefix(trimmed, "{") {
		info.PlainCause = friendlyCause(trimmed) // already a plain message
		return info
	}

	var t probeTelemetry
	if err := json.Unmarshal([]byte(trimmed), &t); err != nil {
		return info // raw JSON would be unreadable; keep the safe default
	}
	info.Telemetry = t
	info.Parsed = true

	switch {
	case t.Report != nil && t.Report.Interpretation != "":
		info.PlainCause = friendlyCause(t.Report.Interpretation)
		info.Recommendation = t.Report.Recommendation
	case t.Interpretation != "":
		info.PlainCause = friendlyCause(t.Interpretation)
	case t.HTTPError != "":
		info.PlainCause = "Server tidak dapat dihubungi."
	}
	return info
}

// buildDiagnostics renders the five-stage DNS→SSL checklist. Each stage that could
// not be reached (because an earlier stage failed) reads "Not Available" rather than
// a misleading ❌, mirroring how the dashboard presents a cascading failure.
func buildDiagnostics(t probeTelemetry) []string {
	dnsKnown := t.DNSResolved != nil
	dnsOK := dnsKnown && *t.DNSResolved
	icmpKnown := t.ICMPStatus != nil
	icmpOK := icmpKnown && *t.ICMPStatus
	tcpKnown := t.TCPConnected != nil
	tcpOK := tcpKnown && *t.TCPConnected
	tlsOK := t.TLSHandshakeOK != nil && *t.TLSHandshakeOK
	hasHTTP := t.HTTPStatusCode != nil
	code := 0
	if hasHTTP {
		code = *t.HTTPStatusCode
	}
	unreachable := !dnsOK || (tcpKnown && !tcpOK)

	dns := "Not Available"
	if dnsKnown {
		dns = mark(dnsOK, "Resolved", "Failed")
	}

	ping := "Not Available"
	if dnsOK && icmpKnown {
		ping = mark(icmpOK, "Reachable", "Failed")
	}

	tcp := "Not Available"
	if dnsOK && tcpKnown {
		tcp = mark(tcpOK, "Connected", "Failed")
	}

	httpResp := "Not Available"
	switch {
	case hasHTTP:
		httpResp = fmt.Sprintf("%d %s", code, icon(code >= 200 && code < 400))
	case unreachable || !dnsKnown:
		httpResp = "Not Available"
	case t.HTTPError != "":
		httpResp = "Failed ❌"
	}

	ssl := "Not Available"
	switch {
	case tlsOK:
		ssl = "Valid ✅"
	case unreachable:
		ssl = "Not Available"
	case t.TLSError != "":
		ssl = "Failed ❌"
	}

	return []string{
		"DNS: " + dns,
		"Ping: " + ping,
		"TCP Connection: " + tcp,
		"HTTP Response: " + httpResp,
		"SSL Validation: " + ssl,
	}
}

// buildAnalysis composes the plain-language narrative, choosing wording from the
// stage that failed (OFFLINE) or the HTTP code returned (CRITICAL).
func buildAnalysis(status model.LogStatus, t probeTelemetry, info rootCauseInfo) string {
	dnsKnown := t.DNSResolved != nil
	dnsOK := dnsKnown && *t.DNSResolved
	tcpKnown := t.TCPConnected != nil
	tcpOK := tcpKnown && *t.TCPConnected
	hasHTTP := t.HTTPStatusCode != nil
	code := 0
	if hasHTTP {
		code = *t.HTTPStatusCode
	}

	if status == model.StatusCritical {
		switch {
		case hasHTTP && code >= 500:
			return fmt.Sprintf("Server berhasil dihubungi dan merespons, namun mengembalikan kode kesalahan HTTP %d (server error). Jaringan dan server web tetap aktif, tetapi aplikasi atau layanan backend mengalami masalah.", code)
		case hasHTTP && code == 403:
			return "Server merespons dengan HTTP 403 (Forbidden) tanpa tanda verifikasi manusia. Permintaan ke halaman ditolak oleh server."
		case hasHTTP && code >= 400:
			return fmt.Sprintf("Server merespons dengan kode HTTP %d. Halaman tidak dapat ditampilkan sebagaimana mestinya.", code)
		default:
			return fallbackAnalysis(info)
		}
	}

	// OFFLINE: describe the first stage that failed.
	switch {
	case dnsKnown && !dnsOK:
		return "Sistem gagal menemukan alamat IP website melalui DNS. Karena alamat server tidak dapat ditemukan, pemeriksaan koneksi lainnya (Ping, TCP, HTTP, dan SSL) tidak dapat dilanjutkan."
	case tcpKnown && !tcpOK:
		return "Sistem berhasil menemukan alamat IP website melalui DNS, namun gagal membangun koneksi TCP ke server tujuan. Karena koneksi dasar ke server tidak dapat dibuat, layanan HTTP dan SSL tidak dapat diperiksa lebih lanjut."
	case dnsOK && tcpOK && !hasHTTP:
		return "Sistem berhasil terhubung ke server melalui TCP, namun server tidak memberikan respons HTTP yang valid (kemungkinan timeout). Layanan kemungkinan sedang tidak berjalan atau kelebihan beban."
	default:
		return fallbackAnalysis(info)
	}
}

func fallbackAnalysis(info rootCauseInfo) string {
	if info.PlainCause != "" && info.PlainCause != "Penyebab tidak diketahui." {
		return info.PlainCause
	}
	return "Website tidak dapat diakses oleh sistem monitoring."
}

// buildImpact returns the user-facing consequence for the status.
func buildImpact(status model.LogStatus, t probeTelemetry) string {
	if status == model.StatusCritical {
		if t.HTTPStatusCode != nil && *t.HTTPStatusCode >= 500 {
			return "Pengguna melihat halaman error (server error) ketika mengakses website."
		}
		return "Pengguna berpotensi tidak dapat mengakses sebagian atau seluruh layanan website."
	}
	return "Pengguna berpotensi tidak dapat mengakses website atau mengalami kegagalan koneksi."
}

// buildPossibleCauses lists likely causes for the failing stage (OFFLINE) or HTTP
// code (CRITICAL).
func buildPossibleCauses(status model.LogStatus, t probeTelemetry) []string {
	dnsKnown := t.DNSResolved != nil
	dnsOK := dnsKnown && *t.DNSResolved
	tcpKnown := t.TCPConnected != nil
	tcpOK := tcpKnown && *t.TCPConnected
	hasHTTP := t.HTTPStatusCode != nil
	code := 0
	if hasHTTP {
		code = *t.HTTPStatusCode
	}

	if status == model.StatusCritical {
		switch {
		case hasHTTP && code >= 500:
			return []string{
				"Bug atau error pada aplikasi/backend.",
				"Kesalahan koneksi ke database.",
				"Dependensi atau layanan pihak ketiga gagal.",
				"Proses deployment bermasalah.",
			}
		case hasHTTP && code == 403:
			return []string{
				"Aturan otorisasi atau izin akses membatasi permintaan.",
				"WAF atau firewall memblokir server monitoring.",
				"Alamat IP server monitoring diblokir.",
			}
		default:
			return []string{
				"Konfigurasi rute halaman salah.",
				"Sumber daya yang diminta tidak ditemukan.",
				"Aturan otorisasi halaman bermasalah.",
			}
		}
	}

	// OFFLINE
	switch {
	case dnsKnown && !dnsOK:
		return []string{
			"Domain kedaluwarsa atau konfigurasi DNS salah.",
			"Name server tidak merespons.",
			"Kesalahan penulisan nama domain.",
			"Propagasi DNS belum selesai.",
		}
	case tcpKnown && !tcpOK:
		return []string{
			"Server tujuan tidak merespons.",
			"Firewall atau security policy memblokir koneksi.",
			"Gangguan jaringan antara monitoring server dan website.",
			"Load balancer atau reverse proxy tidak tersedia.",
			"Website sedang dalam masa maintenance.",
		}
	default:
		return []string{
			"Server kelebihan beban (overload).",
			"Aplikasi web hang atau tidak berjalan.",
			"Sumber daya server (CPU/RAM) habis.",
			"Proses backend macet menunggu dependensi.",
		}
	}
}

// buildRecommendedAction returns the operator action for the failing stage (OFFLINE)
// or HTTP code (CRITICAL), falling back to the engine's recommendation.
func buildRecommendedAction(status model.LogStatus, t probeTelemetry, info rootCauseInfo) string {
	dnsKnown := t.DNSResolved != nil
	dnsOK := dnsKnown && *t.DNSResolved
	tcpKnown := t.TCPConnected != nil
	tcpOK := tcpKnown && *t.TCPConnected
	hasHTTP := t.HTTPStatusCode != nil
	code := 0
	if hasHTTP {
		code = *t.HTTPStatusCode
	}

	if status == model.StatusCritical {
		switch {
		case hasHTTP && code >= 500:
			return "Periksa log aplikasi dan layanan backend (error 5xx) beserta dependensinya seperti database."
		case hasHTTP && code == 403:
			return "Periksa aturan otorisasi/izin akses atau kebijakan WAF/firewall pada target."
		default:
			return "Periksa konfigurasi rute dan otorisasi halaman pada server."
		}
	}

	switch {
	case dnsKnown && !dnsOK:
		return "Periksa pendaftaran domain serta konfigurasi DNS dan name server."
	case tcpKnown && !tcpOK:
		return "Periksa status server, firewall, load balancer, serta konektivitas jaringan menuju website."
	case dnsOK && tcpOK && !hasHTTP:
		return "Periksa apakah web server berjalan normal dan tidak kelebihan beban."
	default:
		if len(info.Recommendation) > 0 {
			return strings.Join(info.Recommendation, " ")
		}
		return "Periksa kondisi server dan konektivitas jaringan menuju website."
	}
}

// mark renders an "okText ✅" / "badText ❌" pair from a boolean.
func mark(ok bool, okText, badText string) string {
	if ok {
		return okText + " ✅"
	}
	return badText + " ❌"
}

// icon returns the bare ✅/❌ marker for a boolean.
func icon(ok bool) string {
	if ok {
		return "✅"
	}
	return "❌"
}

// friendlyCause strips the leading "OFFLINE:/CRITICAL:/…" status prefix the
// classifier prepends, then capitalises and punctuates the remainder so it reads
// as an ordinary sentence to a non-technical reader.
func friendlyCause(s string) string {
	s = strings.TrimSpace(stripStatusPrefix(strings.TrimSpace(s)))
	if s == "" {
		return "Penyebab tidak diketahui."
	}
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	s = string(r)
	if !strings.HasSuffix(s, ".") {
		s += "."
	}
	return s
}

// stripStatusPrefix removes a leading machine status label like "OFFLINE: " so the
// sentence doesn't shout jargon at a non-technical reader.
func stripStatusPrefix(s string) string {
	if i := strings.Index(s, ":"); i > 0 && i < 24 {
		switch strings.ToUpper(strings.TrimSpace(s[:i])) {
		case "OFFLINE", "CRITICAL", "WARNING", "HEALTHY", "ONLINE":
			return strings.TrimSpace(s[i+1:])
		}
	}
	return s
}

// telegramHTMLEscape escapes only the three characters Telegram's HTML parse mode
// treats as markup. Quotes and apostrophes are left as-is — Telegram renders them
// literally and they don't need numeric entities (which Telegram may not accept).
func telegramHTMLEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// sendTelegramRecovery pings when a site comes back ONLINE — but only if it was
// genuinely DOWN (OFFLINE or CRITICAL) during the streak it just recovered from, so
// a mere WARNING flap doesn't produce a spurious recovery notice. The message
// reports how long the site was down when that can be determined from history.
func (s *Service) sendTelegramRecovery(websiteID uuid.UUID, websiteName, websiteURL, oldStatus, rootCause string) {
	downStart, wasDown, err := s.repo.GetDowntimeForRecovery(context.Background(), websiteID)

	switch {
	case err != nil:
		// History unavailable: fall back to the immediate previous status.
		if oldStatus != string(model.StatusOffline) && oldStatus != string(model.StatusCritical) {
			return
		}
	case !wasDown:
		// Recovered from WARNING/other only — never actually down. Stay quiet.
		return
	}

	s.dispatchTelegram(buildRecoveryMessage(websiteName, websiteURL, rootCause, downStart, time.Now()), "HTML")
}

// buildRecoveryMessage renders the structured "back to normal" report in the same
// shape as the alert (Telegram HTML parse mode), including the downtime span when it
// can be determined and the all-clear diagnostics when telemetry is available.
func buildRecoveryMessage(websiteName, websiteURL, rootCause string, downStart *time.Time, now time.Time) string {
	info := parseRootCause(rootCause)

	var b strings.Builder
	b.WriteString("🟢 <b>WEBSITE ONLINE</b>\n\n")
	fmt.Fprintf(&b, "<b>Service:</b> %s\n", telegramHTMLEscape(websiteName))
	fmt.Fprintf(&b, "<b>URL:</b> %s\n\n", telegramHTMLEscape(websiteURL))
	b.WriteString("<b>Status:</b> ONLINE ✅\n\n")

	analysis := "Seluruh pemeriksaan otomatis berhasil. Website kembali merespons normal dan dapat diakses oleh pengguna."
	if downStart != nil {
		analysis += fmt.Sprintf(" Sempat bermasalah %s (%s → %s).",
			humanDuration(now.Sub(*downStart)),
			downStart.In(now.Location()).Format("15:04"), now.Format("15:04"))
	}
	fmt.Fprintf(&b, "<b>Analysis:</b>\n%s\n\n", telegramHTMLEscape(analysis))

	if info.Parsed {
		b.WriteString("<b>Diagnostics:</b>\n")
		for _, line := range buildDiagnostics(info.Telemetry) {
			fmt.Fprintf(&b, "• %s\n", line)
		}
		b.WriteString("\n")
	}

	b.WriteString("<b>Impact:</b>\nLayanan telah kembali normal dan dapat diakses oleh pengguna.\n\n")
	fmt.Fprintf(&b, "<b>Time:</b>\n%s", now.Format("15:04:05"))

	return b.String()
}

// humanDuration renders a downtime span in friendly Indonesian (±menit / ±jam).
func humanDuration(d time.Duration) string {
	mins := int(d.Minutes())
	switch {
	case mins < 1:
		return "kurang dari 1 menit"
	case mins < 60:
		return fmt.Sprintf("±%d menit", mins)
	default:
		h, m := mins/60, mins%60
		if m == 0 {
			return fmt.Sprintf("±%d jam", h)
		}
		return fmt.Sprintf("±%d jam %d menit", h, m)
	}
}

func (s *Service) NotifyTestEmail(recipientEmail string) error {
	// Fix for Syntax Error 555 5.5.2: Use pure email for MAIL FROM
	fromAddr := s.cfg.SMTPFrom
	if strings.Contains(fromAddr, "<") {
		start := strings.Index(fromAddr, "<")
		end := strings.Index(fromAddr, ">")
		if start != -1 && end != -1 {
			fromAddr = fromAddr[start+1 : end]
		}
	}

	fromHeader := fmt.Sprintf("From: %s\r\n", s.cfg.SMTPFrom)
	subjectHeader := "Subject: [SPMT] Notifikasi Uji Coba\r\n"
	mime := "MIME-version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	body := `
		<html>
		<body style="font-family: sans-serif; padding: 20px;">
			<h2 style="color: #10b981;">✅ Uji Coba SMTP Berhasil</h2>
			<p>Jika Anda membaca pesan ini, sistem notifikasi email Anda sudah berfungsi dengan baik.</p>
			<p>Konfigurasi Anda saat ini di file .env sudah valid.</p>
			<hr/>
			<p style="font-size: 12px; color: #666;">Dikirim dari SPMT Monitoring System</p>
		</body>
		</html>
	`
	msg := []byte(fromHeader + subjectHeader + mime + body)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	err := smtp.SendMail(addr, auth, fromAddr, []string{recipientEmail}, msg)
	if err != nil {
		log.Printf("[Notification] TEST EMAIL ERROR: %v", err)
		return err
	}
	return nil
}
