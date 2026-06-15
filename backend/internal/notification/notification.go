package notification

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"net/url"
	"strings"
	"time"

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
	// Telegram behaves like a simple chatbot: it pings only on the two transitions
	// operators care about — a site going DOWN (OFFLINE) and coming back (ONLINE).
	// WARNING/CRITICAL/PROTECTED transitions do not ping. Email is delivered as a
	// scheduled condition report (see SendWeeklyReport), not per-event.
	switch newStatus {
	case string(model.StatusOffline):
		s.sendTelegramDown(websiteName, websiteURL, rootCause)
	case string(model.StatusOnline):
		s.sendTelegramRecovery(websiteID, websiteName, websiteURL, oldStatus)
	}
}

func (s *Service) NotifyEscalation(inc *model.Incident) {
	message := fmt.Sprintf(
		"🚨 *ALERT ESCALATION* 🚨\n\n"+
			"*Incident:* %s\n"+
			"*Severity:* %s\n"+
			"*Triggered At:* %s\n\n"+
			"⚠️ This incident has been unacknowledged for more than 5 minutes! Please assign or acknowledge immediately.",
		inc.Title, inc.Severity, inc.CreatedAt.Format("2006-01-02 15:04:05 MST"),
	)
	s.sendTelegramCustom(message)

	// TEMPORARILY DISABLED FOR REVISION
	// s.sendEmailCustom("Incident Escalation Alert: "+inc.Title, message)
}

func (s *Service) sendTelegramCustom(message string) {
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
		data.Set("parse_mode", "Markdown")

		resp, err := http.PostForm(apiURL, data)
		if err == nil {
			resp.Body.Close()
		}
		sent[chatID] = true
	}
}

func (s *Service) sendEmailCustom(subject string, plainBody string) {
	if s.cfg.SMTPHost == "" || s.cfg.SMTPUser == "" {
		return
	}

	users, err := s.repo.GetAllUsers(context.Background())
	if err != nil {
		return
	}

	var recipients []string
	for _, u := range users {
		if u.Email != "" {
			recipients = append(recipients, u.Email)
		}
	}

	if len(recipients) == 0 {
		return
	}

	fromAddr := s.cfg.SMTPFrom
	if strings.Contains(fromAddr, "<") {
		start := strings.Index(fromAddr, "<")
		end := strings.Index(fromAddr, ">")
		if start != -1 && end != -1 {
			fromAddr = fromAddr[start+1 : end]
		}
	}

	subjectHeader := fmt.Sprintf("Subject: [SPMT] %s\r\n", subject)
	fromHeader := fmt.Sprintf("From: %s\r\n", s.cfg.SMTPFrom)
	mime := "MIME-version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"

	body := fmt.Sprintf(`
		<html>
		<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
			<div style="max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
				<div style="background: #ef4444; padding: 20px; text-align: center; color: white;">
					<h2 style="margin: 0;">Escalation Alert</h2>
				</div>
				<div style="padding: 24px;">
					<p>%s</p>
					<p>Please check the <a href="%s" style="color: #3b82f6;">Monitoring Dashboard</a> for details.</p>
				</div>
				<div style="background: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
					&copy; 2026 SPMT Monitoring System · NOC Control Panel
				</div>
			</div>
		</body>
		</html>
	`, plainBody, s.cfg.FrontendURL)

	msg := []byte(fromHeader + subjectHeader + mime + body)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	for _, to := range recipients {
		_ = smtp.SendMail(addr, auth, fromAddr, []string{to}, msg)
	}
}


// sendTelegramDown pings when a site goes OFFLINE — short, chatbot-style.
func (s *Service) sendTelegramDown(websiteName, websiteURL, rootCause string) {
	if strings.TrimSpace(rootCause) == "" {
		rootCause = "Penyebab tidak diketahui."
	}
	message := fmt.Sprintf(
		"🔴 *WEBSITE DOWN*\n\n"+
			"*%s* sedang tidak dapat diakses.\n"+
			"🔗 %s\n"+
			"🕒 %s\n"+
			"💡 %s",
		websiteName, websiteURL, time.Now().Format("2 Jan 2006 · 15:04:05"), rootCause,
	)
	s.sendTelegramCustom(message)
}

// sendTelegramRecovery pings when a site comes back ONLINE — but only if it was
// genuinely DOWN (OFFLINE) during the streak it just recovered from, so a mere
// WARNING flap doesn't produce a spurious "PULIH". The message includes how long
// the site was down when that can be determined from status history.
func (s *Service) sendTelegramRecovery(websiteID uuid.UUID, websiteName, websiteURL, oldStatus string) {
	downStart, wasOffline, err := s.repo.GetDowntimeForRecovery(context.Background(), websiteID)

	switch {
	case err != nil:
		// History unavailable: fall back to the immediate previous status.
		if oldStatus != string(model.StatusOffline) {
			return
		}
	case !wasOffline:
		// Recovered from WARNING/other only — never actually offline. Stay quiet.
		return
	}

	durasi := ""
	if downStart != nil {
		durasi = fmt.Sprintf("\n⏱️ Sempat down %s", humanDuration(time.Since(*downStart)))
	}

	message := fmt.Sprintf(
		"✅ *WEBSITE PULIH*\n\n"+
			"*%s* sudah kembali normal dan dapat diakses.\n"+
			"🔗 %s\n"+
			"🕒 %s%s",
		websiteName, websiteURL, time.Now().Format("2 Jan 2006 · 15:04:05"), durasi,
	)
	s.sendTelegramCustom(message)
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
	subjectHeader := "Subject: [SPMT] Test Notification\r\n"
	mime := "MIME-version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	body := `
		<html>
		<body style="font-family: sans-serif; padding: 20px;">
			<h2 style="color: #10b981;">✅ SMTP Test Successful</h2>
			<p>If you are reading this, your email notification system is working perfectly.</p>
			<p>Your current configuration in .env is valid.</p>
			<hr/>
			<p style="font-size: 12px; color: #666;">Sent from SPMT Monitoring System</p>
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
