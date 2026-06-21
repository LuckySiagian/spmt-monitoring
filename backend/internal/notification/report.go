package notification

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
)

// StartWeeklyReportScheduler runs a background loop that emails the weekly uptime
// digest at the configured weekday/hour (default Monday 08:00, server local time).
// It returns immediately; the loop stops when ctx is cancelled.
func (s *Service) StartWeeklyReportScheduler(ctx context.Context) {
	weekday := time.Weekday(((s.cfg.ReportWeekday % 7) + 7) % 7)
	hour := s.cfg.ReportHour
	if hour < 0 || hour > 23 {
		hour = 8
	}

	go func() {
		for {
			next := nextOccurrence(time.Now(), weekday, hour)
			log.Printf("[Report] Next weekly report scheduled for %s", next.Format("Mon 2006-01-02 15:04 MST"))

			timer := time.NewTimer(time.Until(next))
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				if err := s.SendWeeklyReport(context.Background()); err != nil {
					log.Printf("[Report] Weekly report failed: %v", err)
				} else {
					log.Println("[Report] Weekly report sent")
				}
			}
		}
	}()
}

// nextOccurrence returns the next time at the given weekday and hour strictly
// after `from` (in from's location).
func nextOccurrence(from time.Time, weekday time.Weekday, hour int) time.Time {
	next := time.Date(from.Year(), from.Month(), from.Day(), hour, 0, 0, 0, from.Location())
	daysAhead := (int(weekday) - int(from.Weekday()) + 7) % 7
	next = next.AddDate(0, 0, daysAhead)
	if !next.After(from) {
		next = next.AddDate(0, 0, 7)
	}
	return next
}

// ─── WEEKLY UPTIME REPORT ────────────────────────────────────
//
// An UptimeRobot-style weekly digest: a headline uptime %, an incident summary
// (count, downtime, MTBF), a response-time summary, and the monitor list sorted
// worst-uptime-first. All figures come from rolled-up daily_aggregates and
// status_events, since raw logs are purged after 2 days (see retention.go).

// siteReport is one monitor's row in the weekly report.
type siteReport struct {
	Name      string
	URL       string
	UptimePct float64
	Incidents int
	HasData   bool // false when the site has no aggregate rows in the window
}

// weeklyReportData is everything the email template needs, pre-computed.
type weeklyReportData struct {
	PeriodStart   time.Time
	PeriodEnd     time.Time
	TotalMonitors int

	OverallUptime     float64
	PrevOverallUptime float64
	HasPrev           bool // previous week had data, so deltas are meaningful

	TotalIncidents     int
	PrevTotalIncidents int
	TotalDowntime      time.Duration
	AvgIncidentDur     time.Duration
	LongestIncident    time.Duration
	MTBF               time.Duration // mean operational time between failures

	AvgRT     int
	PrevAvgRT int
	MinRT     int
	MaxRT     int
	Peaks     int // checks slower than 1000ms

	Sites []siteReport // sorted: lowest uptime first, no-data sites last
}

// SendWeeklyReport compiles the weekly uptime digest for every monitored site and
// emails it to all registered users. Safe to call manually (admin endpoint) or
// from the scheduler.
func (s *Service) SendWeeklyReport(ctx context.Context) error {
	if s.cfg.SMTPHost == "" || s.cfg.SMTPUser == "" {
		return fmt.Errorf("SMTP not configured")
	}

	sites, err := s.repo.GetAllWebsites(ctx)
	if err != nil {
		return fmt.Errorf("fetch websites: %w", err)
	}

	recipients, err := s.reportRecipients(ctx)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("no recipients with an email address")
	}

	data := s.buildWeeklyReportData(ctx, sites, time.Now())
	subject := fmt.Sprintf("Laporan Uptime Mingguan — %s s/d %s",
		data.PeriodStart.Format("2 Jan"), data.PeriodEnd.Format("2 Jan 2006"))
	html := buildUptimeReportHTML(data, s.cfg.FrontendURL)

	return s.sendHTMLEmail(subject, html, recipients)
}

func (s *Service) reportRecipients(ctx context.Context) ([]string, error) {
	users, err := s.repo.GetAllUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetch users: %w", err)
	}
	var recipients []string
	for _, u := range users {
		if u.Email != "" {
			recipients = append(recipients, u.Email)
		}
	}
	return recipients, nil
}

// buildWeeklyReportData fetches the rolled-up stats for the last 7 days (and the
// 7 days before that, for week-over-week deltas) and reduces them into the figures
// the template renders. Stat-fetch errors are non-fatal: the report still goes out,
// just with the missing dimension left at zero.
func (s *Service) buildWeeklyReportData(ctx context.Context, sites []*model.Website, now time.Time) weeklyReportData {
	curStart := now.AddDate(0, 0, -7)
	prevStart := now.AddDate(0, 0, -14)
	prevEnd := curStart

	curAgg, err := s.repo.GetAggregateStats(ctx, curStart, now)
	if err != nil {
		log.Printf("[Report] aggregate stats (current) failed: %v", err)
		curAgg = map[uuid.UUID]*model.SiteAggStat{}
	}
	prevAgg, err := s.repo.GetAggregateStats(ctx, prevStart, prevEnd)
	if err != nil {
		log.Printf("[Report] aggregate stats (previous) failed: %v", err)
		prevAgg = map[uuid.UUID]*model.SiteAggStat{}
	}
	curInc, err := s.repo.GetIncidentStats(ctx, curStart, now)
	if err != nil {
		log.Printf("[Report] incident stats (current) failed: %v", err)
		curInc = map[uuid.UUID]*model.SiteIncidentStat{}
	}
	prevInc, err := s.repo.GetIncidentStats(ctx, prevStart, prevEnd)
	if err != nil {
		log.Printf("[Report] incident stats (previous) failed: %v", err)
		prevInc = map[uuid.UUID]*model.SiteIncidentStat{}
	}

	d := weeklyReportData{
		PeriodStart:   curStart,
		PeriodEnd:     now,
		TotalMonitors: len(sites),
	}

	// Current week: uptime + response time across all monitors.
	var curTotal, curOnline int
	var rtNum int64
	var rtDen int
	for _, a := range curAgg {
		curTotal += a.TotalChecks
		curOnline += a.OnlineChecks
		rtNum += int64(a.AvgRT) * int64(a.TotalChecks)
		rtDen += a.TotalChecks
		if a.MinRT > 0 && (d.MinRT == 0 || a.MinRT < d.MinRT) {
			d.MinRT = a.MinRT
		}
		if a.MaxRT > d.MaxRT {
			d.MaxRT = a.MaxRT
		}
		d.Peaks += a.PeaksOver1k
	}
	d.OverallUptime = pct(curOnline, curTotal)
	if rtDen > 0 {
		d.AvgRT = int(rtNum / int64(rtDen))
	}

	// Previous week (for week-over-week deltas).
	var prevTotal, prevOnline int
	var prtNum int64
	var prtDen int
	for _, a := range prevAgg {
		prevTotal += a.TotalChecks
		prevOnline += a.OnlineChecks
		prtNum += int64(a.AvgRT) * int64(a.TotalChecks)
		prtDen += a.TotalChecks
	}
	d.HasPrev = prevTotal > 0
	d.PrevOverallUptime = pct(prevOnline, prevTotal)
	if prtDen > 0 {
		d.PrevAvgRT = int(prtNum / int64(prtDen))
	}

	// Incidents.
	var totalDown, longest float64
	for _, in := range curInc {
		d.TotalIncidents += in.Incidents
		totalDown += in.TotalDownSecs
		if in.LongestDownSecs > longest {
			longest = in.LongestDownSecs
		}
	}
	for _, in := range prevInc {
		d.PrevTotalIncidents += in.Incidents
	}
	d.TotalDowntime = secsToDur(totalDown)
	d.LongestIncident = secsToDur(longest)
	if d.TotalIncidents > 0 {
		d.AvgIncidentDur = secsToDur(totalDown / float64(d.TotalIncidents))
		operational := float64(len(sites))*now.Sub(curStart).Seconds() - totalDown
		if operational < 0 {
			operational = 0
		}
		d.MTBF = secsToDur(operational / float64(d.TotalIncidents))
	}

	// Per-site rows.
	for _, w := range sites {
		sr := siteReport{Name: w.Name, URL: w.URL}
		if a := curAgg[w.ID]; a != nil && a.TotalChecks > 0 {
			sr.HasData = true
			sr.UptimePct = pct(a.OnlineChecks, a.TotalChecks)
		}
		if in := curInc[w.ID]; in != nil {
			sr.Incidents = in.Incidents
		}
		d.Sites = append(d.Sites, sr)
	}
	sort.SliceStable(d.Sites, func(i, j int) bool {
		a, b := d.Sites[i], d.Sites[j]
		if a.HasData != b.HasData {
			return a.HasData // monitors with data first
		}
		if a.HasData && a.UptimePct != b.UptimePct {
			return a.UptimePct < b.UptimePct // lowest uptime first
		}
		return a.Name < b.Name
	})

	return d
}

// ─── HTML rendering ──────────────────────────────────────────

func buildUptimeReportHTML(d weeklyReportData, frontendURL string) string {
	period := fmt.Sprintf("%s – %s", d.PeriodStart.Format("2 Jan"), d.PeriodEnd.Format("2 Jan 2006"))

	heroDelta := ""
	if d.HasPrev {
		heroDelta = `<div style="margin-top:8px;">` + deltaPctBadge(d.OverallUptime, d.PrevOverallUptime, false) + `</div>`
	}

	incDelta := ""
	if d.HasPrev {
		incDelta = deltaCountText(d.TotalIncidents, d.PrevTotalIncidents)
	}
	summaryCards := cardGrid([]string{
		card("Insiden", strconv.Itoa(d.TotalIncidents), incDelta),
		card("Total downtime", incidentDurText(d.TotalIncidents, d.TotalDowntime), ""),
		card("Durasi rata-rata", incidentDurText(d.TotalIncidents, d.AvgIncidentDur), ""),
		card("Insiden terlama", incidentDurText(d.TotalIncidents, d.LongestIncident), ""),
		card("Antar-gangguan (MTBF)", incidentDurText(d.TotalIncidents, d.MTBF), ""),
	})

	rtDelta := ""
	if d.HasPrev && d.PrevAvgRT > 0 && d.AvgRT > 0 {
		rtDelta = deltaPctBadge(float64(d.AvgRT), float64(d.PrevAvgRT), true)
	}
	rtCards := cardGrid([]string{
		card("Rata-rata respons", rtVal(d.AvgRT), rtDelta),
		card("Tercepat / terlambat", rtMinMax(d.MinRT, d.MaxRT), ""),
		card("Puncak &gt; 1000ms", strconv.Itoa(d.Peaks)+"×", ""),
	})

	var monitors strings.Builder
	for _, m := range d.Sites {
		monitors.WriteString(monitorRow(m))
	}

	return fmt.Sprintf(`<html><body style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#334155;background:#f1f5f9;padding:20px;margin:0;">
	<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
		<div style="padding:20px 26px 16px;border-bottom:1px solid #eef2f7;">
			<div style="font-size:12px;color:#64748b;letter-spacing:.05em;text-transform:uppercase;">SPMT Monitoring · Laporan Mingguan</div>
			<div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:2px;">Laporan Uptime Mingguan</div>
			<div style="font-size:13px;color:#64748b;">%s · %d monitor</div>
		</div>

		<div style="text-align:center;padding:26px 26px 20px;">
			<div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Uptime keseluruhan</div>
			<div style="font-size:46px;font-weight:800;color:%s;line-height:1.1;margin-top:4px;">%s</div>
			%s
		</div>

		<div style="padding:4px 22px 6px;">
			<div style="font-size:13px;font-weight:700;color:#0f172a;margin:6px 4px 8px;">Ringkasan insiden</div>
			%s
		</div>

		<div style="padding:8px 22px;">
			<div style="font-size:13px;font-weight:700;color:#0f172a;margin:12px 4px 8px;">Ringkasan waktu respons</div>
			%s
		</div>

		<div style="padding:16px 26px 8px;">
			<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">Monitor — diurutkan dari uptime terendah</div>
			<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">%d monitor pada periode ini.</div>
			%s
		</div>

		<div style="padding:18px 26px 22px;">
			<a href="%s" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 20px;border-radius:8px;">Buka Dashboard →</a>
		</div>

		<div style="background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #eef2f7;">
			© 2026 SPMT Monitoring System · pemberitahuan otomatis
		</div>
	</div>
	</body></html>`,
		period, d.TotalMonitors,
		uptimeColor(d.OverallUptime), fmtPct(d.OverallUptime), heroDelta,
		summaryCards,
		rtCards,
		d.TotalMonitors, monitors.String(),
		frontendURL,
	)
}

// card renders one metric tile: a small label, a big value, and an optional sub
// line (e.g. a week-over-week delta badge).
func card(label, value, sub string) string {
	subHTML := ""
	if sub != "" {
		subHTML = fmt.Sprintf(`<div style="margin-top:5px;">%s</div>`, sub)
	}
	return fmt.Sprintf(`<td width="33%%" style="padding:5px;vertical-align:top;">
		<div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 12px;">
			<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">%s</div>
			<div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:4px;">%s</div>
			%s
		</div></td>`, label, value, subHTML)
}

// cardGrid lays metric tiles into a 3-column table, padding the final row with
// empty cells so the columns stay aligned.
func cardGrid(cards []string) string {
	var b strings.Builder
	b.WriteString(`<table width="100%" style="border-collapse:collapse;">`)
	for i := 0; i < len(cards); i += 3 {
		b.WriteString("<tr>")
		n := 0
		for j := i; j < i+3 && j < len(cards); j++ {
			b.WriteString(cards[j])
			n++
		}
		for ; n < 3; n++ {
			b.WriteString(`<td width="33%"></td>`)
		}
		b.WriteString("</tr>")
	}
	b.WriteString("</table>")
	return b.String()
}

// monitorRow renders one monitor's line: name + URL, uptime % (colour-coded), the
// incident count, and a proportional uptime bar.
func monitorRow(s siteReport) string {
	pctStr, pctColor, barColor := "—", "#94a3b8", "#cbd5e1"
	barWidth := 0.0
	if s.HasData {
		pctStr = fmtPct(s.UptimePct)
		pctColor = uptimeColor(s.UptimePct)
		barColor = pctColor
		barWidth = s.UptimePct
	}

	incText := "Tidak ada insiden"
	switch {
	case s.Incidents == 1:
		incText = "1 insiden"
	case s.Incidents > 1:
		incText = fmt.Sprintf("%d insiden", s.Incidents)
	}

	return fmt.Sprintf(`<div style="border-bottom:1px solid #f1f5f9;padding:11px 0;">
		<table width="100%%" style="border-collapse:collapse;"><tr>
			<td style="font-size:13.5px;font-weight:600;color:#0f172a;">%s
				<div style="font-size:11px;color:#94a3b8;font-weight:400;">%s</div>
			</td>
			<td align="right" style="white-space:nowrap;">
				<span style="font-size:15px;font-weight:700;color:%s;">%s</span>
				<div style="font-size:11px;color:#64748b;">%s</div>
			</td>
		</tr></table>
		<div style="height:6px;background:#f1f5f9;border-radius:4px;margin-top:8px;overflow:hidden;">
			<div style="height:6px;width:%.3f%%;background:%s;border-radius:4px;"></div>
		</div>
	</div>`, htmlEscape(s.Name), htmlEscape(s.URL), pctColor, pctStr, incText, barWidth, barColor)
}

// ─── small formatting helpers ────────────────────────────────

// pct returns part/total as a percentage; a site with no checks is treated as 100%
// (no data ≠ downtime), but callers gate display on HasData where that matters.
func pct(part, total int) float64 {
	if total <= 0 {
		return 100
	}
	return float64(part) / float64(total) * 100
}

func secsToDur(secs float64) time.Duration {
	return time.Duration(secs * float64(time.Second))
}

// fmtPct prints up to 3 decimals (UptimeRobot style), trimming trailing zeros so
// 100.000 → "100" and 79.996 → "79.996".
func fmtPct(f float64) string {
	s := strconv.FormatFloat(f, 'f', 3, 64)
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	return s + "%"
}

// uptimeColor maps an uptime percentage to a traffic-light colour.
func uptimeColor(f float64) string {
	switch {
	case f >= 99.9:
		return "#10b981"
	case f >= 99:
		return "#22c55e"
	case f >= 95:
		return "#f59e0b"
	default:
		return "#ef4444"
	}
}

// incidentDurText shows a friendly duration, or "—" when there were no incidents.
func incidentDurText(incidents int, d time.Duration) string {
	if incidents == 0 {
		return "—"
	}
	return humanDurID(d)
}

// humanDurID renders a duration in friendly Indonesian (menit / jam / hari).
func humanDurID(d time.Duration) string {
	secs := int64(d.Seconds())
	if secs < 60 {
		if secs <= 0 {
			return "0 menit"
		}
		return "<1 menit"
	}
	mins := secs / 60
	if mins < 60 {
		return fmt.Sprintf("%d menit", mins)
	}
	hours, remMin := mins/60, mins%60
	if hours < 24 {
		if remMin == 0 {
			return fmt.Sprintf("%d jam", hours)
		}
		return fmt.Sprintf("%d jam %d menit", hours, remMin)
	}
	days, remHour := hours/24, hours%24
	if remHour == 0 {
		return fmt.Sprintf("%d hari", days)
	}
	return fmt.Sprintf("%d hari %d jam", days, remHour)
}

// rtVal renders a response time in ms, or "—" when unknown.
func rtVal(ms int) string {
	if ms <= 0 {
		return "—"
	}
	return formatThousandsID(ms) + " ms"
}

// rtMinMax renders the fastest / slowest response pair, or "—" when unknown.
func rtMinMax(min, max int) string {
	if max <= 0 {
		return "—"
	}
	return fmt.Sprintf("%s / %s ms", formatThousandsID(min), formatThousandsID(max))
}

// deltaPctBadge renders a coloured week-over-week change badge. lowerIsBetter flips
// the colour so a drop in response time reads as good (green).
func deltaPctBadge(cur, prev float64, lowerIsBetter bool) string {
	if prev == 0 {
		return ""
	}
	change := (cur - prev) / prev * 100
	if change == 0 {
		return `<span style="font-size:11px;color:#94a3b8;">tetap dari minggu lalu</span>`
	}
	good := change > 0
	if lowerIsBetter {
		good = change < 0
	}
	color := "#ef4444"
	if good {
		color = "#10b981"
	}
	sign, abs := "+", change
	if change < 0 {
		sign, abs = "−", -change
	}
	return fmt.Sprintf(`<span style="font-size:11px;color:%s;font-weight:600;">%s%.2f%% dari minggu lalu</span>`, color, sign, abs)
}

// deltaCountText renders a coloured week-over-week change in incident count. More
// incidents is bad (red); fewer is good (green).
func deltaCountText(cur, prev int) string {
	switch diff := cur - prev; {
	case diff > 0:
		return fmt.Sprintf(`<span style="font-size:11px;color:#ef4444;font-weight:600;">+%d dari minggu lalu</span>`, diff)
	case diff < 0:
		return fmt.Sprintf(`<span style="font-size:11px;color:#10b981;font-weight:600;">−%d dari minggu lalu</span>`, -diff)
	default:
		return `<span style="font-size:11px;color:#94a3b8;">sama seperti minggu lalu</span>`
	}
}

// formatThousandsID groups digits with dots, the Indonesian thousands separator.
func formatThousandsID(n int) string {
	s := strconv.Itoa(n)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteByte(s[i])
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// sendHTMLEmail sends one HTML email to each recipient individually.
func (s *Service) sendHTMLEmail(subject, htmlBody string, recipients []string) error {
	fromAddr := s.cfg.SMTPFrom
	if i, j := strings.Index(fromAddr, "<"), strings.Index(fromAddr, ">"); i != -1 && j != -1 && j > i {
		fromAddr = fromAddr[i+1 : j]
	}

	header := fmt.Sprintf("From: %s\r\nSubject: [SPMT] %s\r\nMIME-version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n",
		s.cfg.SMTPFrom, subject)
	msg := []byte(header + htmlBody)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	var lastErr error
	for _, to := range recipients {
		if err := smtp.SendMail(addr, auth, fromAddr, []string{to}, msg); err != nil {
			log.Printf("[Report] Failed to send to %s: %v", to, err)
			lastErr = err
		}
	}
	return lastErr
}

// htmlEscape minimally escapes user-controlled text injected into the email HTML.
func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}
