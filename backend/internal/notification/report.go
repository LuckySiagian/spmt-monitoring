package notification

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
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

// reportRow is one site's line in the weekly digest.
type reportRow struct {
	Name      string
	URL       string
	Status    string
	Uptime7d  float64
	DownCount int
}

// SendWeeklyReport compiles a 7-day uptime digest for every monitored site and
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

	since := time.Now().AddDate(0, 0, -7)
	downCounts, err := s.repo.CountDownEventsByWebsite(ctx, since)
	if err != nil {
		// Non-fatal: still report uptime, just without per-site down counts.
		log.Printf("[Report] down-event count failed: %v", err)
		downCounts = map[uuid.UUID]int{}
	}

	rows := make([]reportRow, 0, len(sites))
	var uptimeSum float64
	totalDown := 0
	for _, w := range sites {
		uptime := 100.0
		if sla, err := s.repo.GetWebsiteSLA(ctx, w.ID); err == nil {
			uptime = sla.SLA7d
		}
		rows = append(rows, reportRow{
			Name:      w.Name,
			URL:       w.URL,
			Status:    w.Status,
			Uptime7d:  uptime,
			DownCount: downCounts[w.ID],
		})
		uptimeSum += uptime
		totalDown += downCounts[w.ID]
	}

	// Worst uptime first so problems sit at the top of the table.
	sort.Slice(rows, func(i, j int) bool { return rows[i].Uptime7d < rows[j].Uptime7d })

	avgUptime := 100.0
	if len(rows) > 0 {
		avgUptime = uptimeSum / float64(len(rows))
	}

	recipients, err := s.reportRecipients(ctx)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("no recipients with an email address")
	}

	subject := fmt.Sprintf("Laporan Mingguan Monitoring — %s s/d %s",
		since.Format("2 Jan"), time.Now().Format("2 Jan 2006"))
	html := s.buildWeeklyReportHTML(rows, avgUptime, totalDown, since)

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

func (s *Service) buildWeeklyReportHTML(rows []reportRow, avgUptime float64, totalDown int, since time.Time) string {
	var tableRows strings.Builder
	for _, r := range rows {
		color := "#10b981" // green
		switch {
		case r.Uptime7d < 99.0:
			color = "#ef4444" // red
		case r.Uptime7d < 99.9:
			color = "#f59e0b" // amber
		}
		tableRows.WriteString(fmt.Sprintf(`
			<tr>
				<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
					<div style="font-weight:600;">%s</div>
					<div style="font-size:12px;color:#64748b;">%s</div>
				</td>
				<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:%s;font-weight:700;">%.2f%%</td>
				<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">%d</td>
				<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">%s</td>
			</tr>`,
			htmlEscape(r.Name), htmlEscape(r.URL), color, r.Uptime7d, r.DownCount, htmlEscape(r.Status)))
	}

	avgColor := "#10b981"
	switch {
	case avgUptime < 99.0:
		avgColor = "#ef4444"
	case avgUptime < 99.9:
		avgColor = "#f59e0b"
	}

	return fmt.Sprintf(`
		<html>
		<body style="font-family:sans-serif;line-height:1.6;color:#333;background:#f8fafc;padding:20px;">
			<div style="max-width:680px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;">
				<div style="background:#0f172a;padding:24px;color:#fff;">
					<h2 style="margin:0;">📊 Laporan Mingguan Monitoring</h2>
					<p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">Periode %s — %s</p>
				</div>
				<div style="padding:24px;">
					<div style="display:flex;gap:16px;margin-bottom:20px;">
						<div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
							<div style="font-size:12px;color:#64748b;">Total Situs</div>
							<div style="font-size:24px;font-weight:700;">%d</div>
						</div>
						<div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
							<div style="font-size:12px;color:#64748b;">Rata-rata Uptime</div>
							<div style="font-size:24px;font-weight:700;color:%s;">%.2f%%</div>
						</div>
						<div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
							<div style="font-size:12px;color:#64748b;">Total Insiden Down</div>
							<div style="font-size:24px;font-weight:700;">%d</div>
						</div>
					</div>
					<table style="width:100%%;border-collapse:collapse;font-size:14px;">
						<thead>
							<tr style="background:#f1f5f9;text-align:left;">
								<th style="padding:10px 12px;">Situs</th>
								<th style="padding:10px 12px;text-align:center;">Uptime 7h</th>
								<th style="padding:10px 12px;text-align:center;">Down</th>
								<th style="padding:10px 12px;text-align:center;">Status Kini</th>
							</tr>
						</thead>
						<tbody>%s</tbody>
					</table>
					<p style="margin-top:20px;">Buka <a href="%s" style="color:#3b82f6;">Dashboard Monitoring</a> untuk detail lengkap.</p>
				</div>
				<div style="background:#f1f5f9;padding:12px;text-align:center;font-size:12px;color:#64748b;">
					&copy; 2026 SPMT Monitoring System · Laporan otomatis mingguan
				</div>
			</div>
		</body>
		</html>`,
		since.Format("2 Jan 2006"), time.Now().Format("2 Jan 2006"),
		len(rows), avgColor, avgUptime, totalDown,
		tableRows.String(), s.cfg.FrontendURL)
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
