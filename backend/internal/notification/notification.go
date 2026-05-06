package notification

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"net/url"
	"strings"

	"github.com/spmt/monitoring/internal/config"
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

func (s *Service) NotifyStatusChange(websiteName, oldStatus, newStatus, rootCause string) {
	// 1. Send to Telegram (Global Group)
	s.sendTelegram(websiteName, oldStatus, newStatus, rootCause)

	// 2. Send to Emails (All Registered Users) - TEMPORARILY DISABLED DUE TO LIMITS
	// s.sendEmails(websiteName, oldStatus, newStatus, rootCause)
}

func (s *Service) sendTelegram(websiteName, oldStatus, newStatus, rootCause string) {
	if s.cfg.TelegramToken == "" {
		return
	}

	emoji := "⚪"
	switch newStatus {
	case "ONLINE":
		emoji = "✅"
	case "OFFLINE":
		emoji = "🔴"
	case "CRITICAL":
		emoji = "⚠️"
	}

	message := fmt.Sprintf(
		"%s *STATUS CHANGE ALERT*\n\n"+
			"*Website:* %s\n"+
			"*Status:* %s → %s\n"+
			"*Reason:* %s\n\n"+
			"Check dashboard for details.",
		emoji, websiteName, oldStatus, newStatus, rootCause,
	)

	// List of Chat IDs to notify
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
	
	// Use a map to avoid duplicate notifications to the same chat ID
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
		if err != nil {
			log.Printf("[Notification] Failed to send Telegram to %s: %v", chatID, err)
			continue
		}
		resp.Body.Close()
		sent[chatID] = true
	}
}

func (s *Service) sendEmails(websiteName, oldStatus, newStatus, rootCause string) {
	if s.cfg.SMTPHost == "" || s.cfg.SMTPUser == "" {
		return
	}

	// Fetch all users to get their emails
	users, err := s.repo.GetAllUsers(context.Background())
	if err != nil {
		log.Printf("[Notification] Failed to fetch users for email: %v", err)
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

	// Fix for Syntax Error 555 5.5.2: Use pure email for MAIL FROM
	fromAddr := s.cfg.SMTPFrom
	if strings.Contains(fromAddr, "<") {
		// Extract email between < >
		start := strings.Index(fromAddr, "<")
		end := strings.Index(fromAddr, ">")
		if start != -1 && end != -1 {
			fromAddr = fromAddr[start+1 : end]
		}
	}

	subjectHeader := fmt.Sprintf("Subject: [SPMT] Status Change: %s is %s\r\n", websiteName, newStatus)
	fromHeader := fmt.Sprintf("From: %s\r\n", s.cfg.SMTPFrom)
	mime := "MIME-version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	
	color := "#64748b"
	switch newStatus {
	case "ONLINE":
		color = "#10b981"
	case "OFFLINE":
		color = "#ef4444"
	case "CRITICAL":
		color = "#f59e0b"
	}

	body := fmt.Sprintf(`
		<html>
		<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
			<div style="max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
				<div style="background: %s; padding: 20px; text-align: center; color: white;">
					<h2 style="margin: 0;">Status Change Alert</h2>
				</div>
				<div style="padding: 24px;">
					<p>The monitoring system detected a status change for:</p>
					<div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
						<p style="margin: 5px 0;"><strong>Website:</strong> %s</p>
						<p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: %s; font-weight: bold;">%s → %s</span></p>
						<p style="margin: 5px 0;"><strong>Reason:</strong> %s</p>
					</div>
					<p>Please check the <a href="%s" style="color: #3b82f6;">Monitoring Dashboard</a> for more information.</p>
				</div>
				<div style="background: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
					&copy; 2026 SPMT Monitoring System · NOC Control Panel
				</div>
			</div>
		</body>
		</html>
	`, color, websiteName, color, oldStatus, newStatus, rootCause, s.cfg.FrontendURL)

	msg := []byte(fromHeader + subjectHeader + mime + body)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)

	for _, to := range recipients {
		err := smtp.SendMail(addr, auth, fromAddr, []string{to}, msg)
		if err != nil {
			log.Printf("[Notification] Failed to send email to %s: %v", to, err)
		}
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
