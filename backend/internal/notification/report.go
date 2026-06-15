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

// siteCondition is one site's current condition in the grouped report.
type siteCondition struct {
	Name        string
	URL         string
	Status      string
	RootCause   string
	ResponseMs  *int
	DownCount7d int
}

// statusOrder controls the section order in the report (problems first).
var statusOrder = []string{"OFFLINE", "CRITICAL", "WARNING", "ONLINE", "LAINNYA"}

// statusMeta maps a status to its emoji, hex color (for email), and awam label.
func statusMeta(status string) (emoji, color, label string) {
	switch status {
	case "ONLINE":
		return "✅", "#10b981", "ONLINE (Normal)"
	case "WARNING":
		return "🟠", "#f59e0b", "WARNING (Perlu Perhatian)"
	case "CRITICAL":
		return "⚠️", "#f97316", "CRITICAL (Kritis)"
	case "OFFLINE":
		return "🔴", "#ef4444", "OFFLINE (Tidak Dapat Diakses)"
	default:
		return "⚪", "#64748b", status
	}
}

// normalizeStatus folds unknown/protected statuses into the catch-all bucket.
func normalizeStatus(s string) string {
	switch s {
	case "OFFLINE", "CRITICAL", "WARNING", "ONLINE":
		return s
	default:
		return "LAINNYA"
	}
}

// orDash returns "—" for blank text so empty fields stay readable in the report.
func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

// SendWeeklyReport compiles a current-condition digest of every monitored site,
// grouped by status (problems first), and emails it to all registered users.
// Safe to call manually (admin endpoint) or from the scheduler.
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
		// Non-fatal: still report condition, just without per-site down counts.
		log.Printf("[Report] down-event count failed: %v", err)
		downCounts = map[uuid.UUID]int{}
	}

	groups := map[string][]siteCondition{}
	counts := map[string]int{}
	for _, w := range sites {
		st := normalizeStatus(w.Status)
		groups[st] = append(groups[st], siteCondition{
			Name:        w.Name,
			URL:         w.URL,
			Status:      w.Status,
			RootCause:   w.RootCause,
			ResponseMs:  w.ResponseTimeMs,
			DownCount7d: downCounts[w.ID],
		})
		counts[st]++
	}

	recipients, err := s.reportRecipients(ctx)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("no recipients with an email address")
	}

	subject := fmt.Sprintf("Laporan Kondisi Website — %s", time.Now().Format("2 Jan 2006"))
	html := s.buildConditionReportHTML(groups, counts, len(sites), time.Now())

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

func (s *Service) buildConditionReportHTML(groups map[string][]siteCondition, counts map[string]int, total int, generatedAt time.Time) string {
	summary := func(label, value, color string) string {
		return fmt.Sprintf(`
			<td style="padding:6px;text-align:center;">
				<div style="background:#f8fafc;border-radius:8px;padding:14px 8px;">
					<div style="font-size:11px;color:#64748b;">%s</div>
					<div style="font-size:22px;font-weight:700;color:%s;">%s</div>
				</div>
			</td>`, label, color, value)
	}

	summaryRow := fmt.Sprintf("<tr>%s%s%s%s%s</tr>",
		summary("Total", fmt.Sprintf("%d", total), "#0f172a"),
		summary("Online", fmt.Sprintf("%d", counts["ONLINE"]), "#10b981"),
		summary("Warning", fmt.Sprintf("%d", counts["WARNING"]), "#f59e0b"),
		summary("Critical", fmt.Sprintf("%d", counts["CRITICAL"]), "#f97316"),
		summary("Offline", fmt.Sprintf("%d", counts["OFFLINE"]), "#ef4444"),
	)

	var sections strings.Builder
	for _, st := range statusOrder {
		list := groups[st]
		if len(list) == 0 {
			continue
		}
		emoji, color, label := statusMeta(st)

		// Worst first: more 7-day down incidents on top, then alphabetical.
		sort.Slice(list, func(i, j int) bool {
			if list[i].DownCount7d != list[j].DownCount7d {
				return list[i].DownCount7d > list[j].DownCount7d
			}
			return list[i].Name < list[j].Name
		})

		sections.WriteString(fmt.Sprintf(
			`<div style="margin-bottom:18px;">
				<div style="font-size:14px;font-weight:700;color:%s;border-bottom:2px solid %s;padding-bottom:6px;margin-bottom:10px;">%s %s — %d situs</div>`,
			color, color, emoji, label, len(list)))

		if st == "ONLINE" {
			// Condensed: just names, since everything here is healthy.
			names := make([]string, 0, len(list))
			for _, c := range list {
				names = append(names, htmlEscape(c.Name))
			}
			sections.WriteString(fmt.Sprintf(
				`<div style="font-size:13px;line-height:1.7;background:#f0fdf4;border-radius:8px;padding:12px 14px;color:#475569;">%s<div style="color:#94a3b8;font-size:12px;margin-top:4px;">Semua normal — situs dapat diakses dengan baik.</div></div>`,
				strings.Join(names, " · ")))
		} else {
			for _, c := range list {
				meta := ""
				if c.ResponseMs != nil {
					meta = fmt.Sprintf(" · Respon %d ms", *c.ResponseMs)
				}
				if c.DownCount7d > 0 {
					meta += fmt.Sprintf(" · %d insiden down (7h)", c.DownCount7d)
				}
				sections.WriteString(fmt.Sprintf(
					`<div style="font-size:13px;line-height:1.5;background:#f8fafc;border-radius:8px;padding:10px 12px;margin-bottom:6px;">
						<div style="font-weight:600;">%s <span style="font-weight:400;color:#64748b;font-size:12px;">%s</span></div>
						<div style="color:#64748b;">%s%s</div>
					</div>`,
					htmlEscape(c.Name), htmlEscape(c.URL), htmlEscape(orDash(c.RootCause)), meta))
			}
		}
		sections.WriteString("</div>")
	}

	return fmt.Sprintf(`
		<html>
		<body style="font-family:sans-serif;line-height:1.6;color:#333;background:#f8fafc;padding:20px;">
			<div style="max-width:680px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;">
				<div style="background:#0f172a;padding:22px 24px;color:#fff;">
					<h2 style="margin:0;">📋 Laporan Kondisi Website</h2>
					<p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">Snapshot %s WIB</p>
				</div>
				<div style="padding:20px 24px;">
					<table style="width:100%%;border-collapse:collapse;margin-bottom:18px;">%s</table>
					%s
					<p style="margin-top:8px;">Buka <a href="%s" style="color:#3b82f6;">Dashboard Monitoring</a> untuk detail lengkap tiap situs.</p>
				</div>
				<div style="background:#f1f5f9;padding:12px;text-align:center;font-size:12px;color:#64748b;">
					&copy; 2026 SPMT Monitoring System · Laporan kondisi otomatis
				</div>
			</div>
		</body>
		</html>`,
		generatedAt.Format("2 Jan 2006 15:04"),
		summaryRow,
		sections.String(),
		s.cfg.FrontendURL)
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
