package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spmt/monitoring/internal/model"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetDB() *pgxpool.Pool {
	return r.db
}

// ─── USER ────────────────────────────────────────────────────

func (r *Repository) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	var u model.User
	row := r.db.QueryRow(ctx,
		`SELECT id, username, password_hash, COALESCE(email, ''), telegram_id, role, COALESCE(status, 'active'), created_at FROM users WHERE username = $1`, username)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Email, &u.TelegramID, &u.Role, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	var u model.User
	row := r.db.QueryRow(ctx,
		`SELECT id, username, password_hash, COALESCE(email, ''), telegram_id, role, COALESCE(status, 'active'), created_at FROM users WHERE id = $1`, id)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Email, &u.TelegramID, &u.Role, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) CreateUser(ctx context.Context, username, passwordHash, email string, telegramID *string, role model.Role, status model.UserStatus) (*model.User, error) {
	if status == "" {
		status = model.StatusActive
	}
	var u model.User
	row := r.db.QueryRow(ctx,
		`INSERT INTO users (id, username, password_hash, email, telegram_id, role, status, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())
		 RETURNING id, username, password_hash, email, telegram_id, role, status, created_at`,
		username, passwordHash, email, telegramID, role, status)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Email, &u.TelegramID, &u.Role, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetAllUsers(ctx context.Context) ([]*model.User, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, username, password_hash, COALESCE(email, ''), telegram_id, role, COALESCE(status, 'active'), created_at FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Email, &u.TelegramID, &u.Role, &u.Status, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, &u)
	}
	return users, nil
}

func (r *Repository) CountAdmins(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&count)
	return count, err
}

// CountPendingUsers — jumlah registrasi yang menunggu konfirmasi.
func (r *Repository) CountPendingUsers(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE status = 'pending'`).Scan(&count)
	return count, err
}

func (r *Repository) UpdateUserRole(ctx context.Context, userID uuid.UUID, role model.Role) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, userID)
	return err
}

// UpdateUserStatus — ubah status persetujuan (pending/active/rejected).
func (r *Repository) UpdateUserStatus(ctx context.Context, userID uuid.UUID, status model.UserStatus) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET status = $1 WHERE id = $2`, status, userID)
	return err
}

func (r *Repository) UpdateUserProfile(ctx context.Context, userID uuid.UUID, email string, telegramID *string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET email = $1, telegram_id = $2 WHERE id = $3`, email, telegramID, userID)
	return err
}

func (r *Repository) UpdateUserPassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, passwordHash, userID)
	return err
}

// ─── WEBSITES ────────────────────────────────────────────────

func (r *Repository) GetAllWebsites(ctx context.Context) ([]*model.Website, error) {
	query := `
		SELECT 
			w.id, w.name, w.url, w.description, w.interval_seconds, w.save_screenshot, w.created_at,
			COALESCE(l.status, 'UNKNOWN'), l.status_code, l.response_time_ms, l.ssl_valid, l.checked_at, COALESCE(l.ip_address, ''),
			l.dns_latency_ms, l.tls_latency_ms, l.ttfb_latency_ms, COALESCE(l.health_score, 0), COALESCE(l.confidence, 0), COALESCE(l.is_browser_accessible, true), COALESCE(l.root_cause, ''),
			COALESCE(l.final_reason, ''), COALESCE(l.final_decision_source, ''), COALESCE(l.resolver_stage, ''),
			l.ssl_expiry_date, COALESCE(l.dns_resolved, false)
		FROM websites w
		LEFT JOIN LATERAL (
			SELECT status, status_code, response_time_ms, ssl_valid, checked_at, ip_address, 
			       dns_latency_ms, tls_latency_ms, ttfb_latency_ms, health_score, confidence, is_browser_accessible, root_cause,
			       final_reason, final_decision_source, resolver_stage, ssl_expiry_date, dns_resolved
			FROM monitoring_logs 
			WHERE website_id = w.id 
			ORDER BY checked_at DESC LIMIT 1
		) l ON TRUE
		ORDER BY w.created_at
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query websites: %w", err)
	}
	defer rows.Close()

	var sites []*model.Website
	for rows.Next() {
		var w model.Website
		if err := rows.Scan(
			&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.SaveScreenshot, &w.CreatedAt,
			&w.Status, &w.StatusCode, &w.ResponseTimeMs, &w.SSLValid, &w.LastChecked, &w.IPAddress,
			&w.DNSLatencyMs, &w.TLSLatencyMs, &w.TTFBLatencyMs, &w.HealthScore, &w.Confidence, &w.IsBrowserAccessible, &w.RootCause,
			&w.FinalReason, &w.FinalDecisionSource, &w.ResolverStage, &w.SSLExpiryDate, &w.DNSResolved,
		); err != nil {
			return nil, fmt.Errorf("scan website (ID: %s): %w", w.ID, err)
		}
		sites = append(sites, &w)
	}
	return sites, nil
}

func (r *Repository) GetWebsiteByID(ctx context.Context, id uuid.UUID) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`SELECT id, name, url, description, interval_seconds, save_screenshot, created_at FROM websites WHERE id = $1`, id)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.SaveScreenshot, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) CreateWebsite(ctx context.Context, req model.CreateWebsiteRequest) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`INSERT INTO websites (id, name, url, description, interval_seconds, save_screenshot, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())
		 RETURNING id, name, url, description, interval_seconds, save_screenshot, created_at`,
		req.Name, req.URL, req.Description, req.IntervalSeconds, req.SaveScreenshot)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.SaveScreenshot, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) UpdateWebsite(ctx context.Context, id uuid.UUID, req model.UpdateWebsiteRequest) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`UPDATE websites SET name=$1, url=$2, description=$3, interval_seconds=$4, save_screenshot=$5
		 WHERE id=$6
		 RETURNING id, name, url, description, interval_seconds, save_screenshot, created_at`,
		req.Name, req.URL, req.Description, req.IntervalSeconds, req.SaveScreenshot, id)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.SaveScreenshot, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) DeleteWebsite(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM websites WHERE id = $1`, id)
	return err
}

// DeleteWebsites removes multiple websites (and all their cascade-linked logs,
// events, incidents, etc.) inside a single transaction — either every row is
// deleted or none are, so the DB never ends up in a partially-deleted state.
// Returns how many websites actually existed and were removed.
func (r *Repository) DeleteWebsites(ctx context.Context, ids []uuid.UUID) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) // no-op if the tx is already committed

	var deleted int64
	for _, id := range ids {
		tag, err := tx.Exec(ctx, `DELETE FROM websites WHERE id = $1`, id)
		if err != nil {
			return 0, err
		}
		deleted += tag.RowsAffected()
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return deleted, nil
}

// ─── MONITORING LOGS ─────────────────────────────────────────

func (r *Repository) InsertLog(ctx context.Context, log *model.MonitoringLog) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO monitoring_logs
		 (id, website_id, checked_at, dns_resolved, status_code, response_time_ms, ssl_valid, error_message, status)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8)`,
		log.WebsiteID, log.CheckedAt, log.DNSResolved, log.StatusCode,
		log.ResponseTimeMs, log.SSLValid, log.ErrorMessage, log.Status)
	return err
}

func (r *Repository) GetLatestLogByWebsite(ctx context.Context, websiteID uuid.UUID) (*model.MonitoringLog, error) {
	var l model.MonitoringLog
	row := r.db.QueryRow(ctx,
		`SELECT id, website_id, checked_at, dns_resolved, dns_latency_ms, icmp_status, icmp_latency_ms, tcp_port_open, tls_latency_ms, ttfb_latency_ms, status_code, response_time_ms, ssl_valid, ssl_expiry_date, ip_address, error_message, status, root_cause, recommendation, health_score, confidence, is_browser_ok, final_reason, final_decision_source, resolver_stage
		 FROM monitoring_logs WHERE website_id = $1 ORDER BY checked_at DESC LIMIT 1`, websiteID)
	err := row.Scan(&l.ID, &l.WebsiteID, &l.CheckedAt, &l.DNSResolved, &l.DNSLatencyMs, &l.ICMPStatus, &l.ICMPLatencyMs, &l.TCPPortOpen, &l.TLSLatencyMs, &l.TTFBLatencyMs, &l.StatusCode,
		&l.ResponseTimeMs, &l.SSLValid, &l.SSLExpiryDate, &l.IPAddress, &l.ErrorMessage, &l.Status, &l.RootCause, &l.Recommendation, &l.HealthScore, &l.Confidence, &l.IsBrowserAccessible, &l.FinalReason, &l.FinalDecisionSource, &l.ResolverStage)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) GetLogsByWebsite(ctx context.Context, websiteID uuid.UUID, limit int) ([]*model.MonitoringLog, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, website_id, checked_at, dns_resolved, dns_latency_ms, icmp_status, icmp_latency_ms, tcp_port_open, tls_latency_ms, ttfb_latency_ms, status_code, response_time_ms, ssl_valid, ssl_expiry_date, ip_address, error_message, status, root_cause, recommendation, health_score, confidence, is_browser_accessible, final_reason, final_decision_source, resolver_stage
		 FROM monitoring_logs WHERE website_id = $1 ORDER BY checked_at DESC LIMIT $2`,
		websiteID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*model.MonitoringLog
	for rows.Next() {
		var l model.MonitoringLog
		if err := rows.Scan(&l.ID, &l.WebsiteID, &l.CheckedAt, &l.DNSResolved, &l.DNSLatencyMs, &l.ICMPStatus, &l.ICMPLatencyMs, &l.TCPPortOpen, &l.TLSLatencyMs, &l.TTFBLatencyMs, &l.StatusCode,
			&l.ResponseTimeMs, &l.SSLValid, &l.SSLExpiryDate, &l.IPAddress, &l.ErrorMessage, &l.Status, &l.RootCause, &l.Recommendation, &l.HealthScore, &l.Confidence, &l.IsBrowserAccessible, &l.FinalReason, &l.FinalDecisionSource, &l.ResolverStage); err != nil {
			return nil, err
		}
		logs = append(logs, &l)
	}
	return logs, nil
}

func (r *Repository) GetDashboardSummary(ctx context.Context) (*model.DashboardSummary, error) {
	summary := &model.DashboardSummary{
		LastUpdated: time.Now(),
	}

	// Count total websites
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM websites`).Scan(&summary.TotalWebsites)
	if err != nil {
		return nil, fmt.Errorf("count websites: %w", err)
	}

	// Count by status from latest log per website
	rows, err := r.db.Query(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON (website_id) website_id, status, response_time_ms
			FROM monitoring_logs
			ORDER BY website_id, checked_at DESC
		)
		SELECT status, COUNT(*), AVG(response_time_ms)::double precision
		FROM latest
		GROUP BY status
	`)
	if err != nil {
		return nil, fmt.Errorf("status counts: %w", err)
	}
	defer rows.Close()

	var totalAvg float64
	var totalCount int
	for rows.Next() {
		var status string
		var count int
		var avg *float64
		if err := rows.Scan(&status, &count, &avg); err != nil {
			return nil, err
		}
		switch status {
		case "ONLINE":
			summary.OnlineCount += count
		case "CRITICAL", "WARNING":
			summary.CriticalCount += count
		case "OFFLINE":
			summary.OfflineCount += count
		}
		if avg != nil {
			totalAvg += *avg * float64(count)
			totalCount += count
		}
	}

	if totalCount > 0 {
		summary.AvgResponseTime = totalAvg / float64(totalCount)
	}

	// Websites with no logs yet (never checked)
	loggedTotal := summary.OnlineCount + summary.CriticalCount + summary.OfflineCount
	if loggedTotal < summary.TotalWebsites {
		// Just treat as offline if no logs? Or stay 0.
	}

	if summary.TotalWebsites > 0 {
		summary.SLAPercent = float64(summary.OnlineCount) / float64(summary.TotalWebsites) * 100
	}
	summary.ActiveAlerts = summary.CriticalCount + summary.OfflineCount

	return summary, nil
}

func (r *Repository) GetUptimeLast24h(ctx context.Context, websiteID uuid.UUID) ([]*model.MonitoringLog, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, website_id, checked_at, dns_resolved, status_code, response_time_ms, ssl_valid, error_message, status
		FROM monitoring_logs
		WHERE website_id = $1 AND checked_at >= NOW() - INTERVAL '24 hours'
		ORDER BY checked_at ASC`,
		websiteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*model.MonitoringLog
	for rows.Next() {
		var l model.MonitoringLog
		if err := rows.Scan(&l.ID, &l.WebsiteID, &l.CheckedAt, &l.DNSResolved, &l.StatusCode,
			&l.ResponseTimeMs, &l.SSLValid, &l.ErrorMessage, &l.Status); err != nil {
			return nil, err
		}
		logs = append(logs, &l)
	}
	return logs, nil
}

// ─── STATUS EVENTS ───────────────────────────────────────────

// GetLatestStatus mengambil status terakhir sebuah website dari monitoring_logs
func (r *Repository) GetLatestStatus(ctx context.Context, websiteID uuid.UUID) (string, error) {
	var status string
	err := r.db.QueryRow(ctx,
		`SELECT status FROM monitoring_logs
		 WHERE website_id = $1
		 ORDER BY checked_at DESC
		 LIMIT 1`,
		websiteID,
	).Scan(&status)
	if err != nil {
		return "", err // pgx.ErrNoRows jika belum ada log
	}
	return status, nil
}

// InsertStatusEvent menyimpan event perubahan status ke tabel status_events
func (r *Repository) InsertStatusEvent(ctx context.Context, ev *model.StatusEvent) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO status_events (id, website_id, website_name, old_status, new_status, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())`,
		ev.WebsiteID, ev.WebsiteName, ev.OldStatus, ev.NewStatus,
	)
	return err
}

// GetStatusHistory mengambil data historis jumlah status per bucket waktu
// range: "1h", "6h", "24h", "7d"
func (r *Repository) GetStatusHistory(ctx context.Context, rangeStr string) ([]*model.StatusHistoryPoint, error) {
	var interval, bucketSec string
	switch rangeStr {
	case "live", "1h":
		interval = "1 hour"
		bucketSec = "60" // 1 menit — untuk live dan 1H
	case "3h":
		interval = "3 hours"
		bucketSec = "120" // 2 menit — untuk 3H
	case "6h":
		interval = "6 hours"
		bucketSec = "300" // 5 menit
	case "7d":
		interval = "7 days"
		bucketSec = "21600" // 6 jam
	default: // 24h
		interval = "24 hours"
		bucketSec = "3600" // 1 jam
	}

	query := `
		SELECT
			to_timestamp(floor(extract(epoch from checked_at) / $1) * $1) AS bucket,
			COUNT(CASE WHEN status = 'ONLINE'   THEN 1 END)::int AS online_count,
			COUNT(CASE WHEN status IN ('CRITICAL', 'WARNING') THEN 1 END)::int AS critical_count,
			COUNT(CASE WHEN status = 'OFFLINE'  THEN 1 END)::int AS offline_count
		FROM monitoring_logs
		WHERE checked_at >= NOW() - $2::interval
		GROUP BY bucket
		ORDER BY bucket ASC`

	rows, err := r.db.Query(ctx, query, bucketSec, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []*model.StatusHistoryPoint
	for rows.Next() {
		p := &model.StatusHistoryPoint{}
		if err := rows.Scan(&p.Time, &p.Online, &p.Critical, &p.Offline); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, nil
}

// GetStatusHistoryCustom mengambil data historis dengan range waktu spesifik (start dan end)
func (r *Repository) GetStatusHistoryCustom(ctx context.Context, start, end string) ([]*model.StatusHistoryPoint, error) {
	// Menggunakan interval default 1 jam untuk custom range
	bucketSec := "3600" 

	query := `
		SELECT
			to_timestamp(floor(extract(epoch from checked_at) / $1) * $1) AS bucket,
			COUNT(CASE WHEN status = 'ONLINE'   THEN 1 END)::int AS online_count,
			COUNT(CASE WHEN status IN ('CRITICAL', 'WARNING') THEN 1 END)::int AS critical_count,
			COUNT(CASE WHEN status = 'OFFLINE'  THEN 1 END)::int AS offline_count
		FROM monitoring_logs
		WHERE checked_at >= $2::timestamptz AND checked_at <= $3::timestamptz
		GROUP BY bucket
		ORDER BY bucket ASC`

	rows, err := r.db.Query(ctx, query, bucketSec, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []*model.StatusHistoryPoint
	for rows.Next() {
		p := &model.StatusHistoryPoint{}
		if err := rows.Scan(&p.Time, &p.Online, &p.Critical, &p.Offline); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, nil
}

// GetStatusEventsByWebsite mengambil status_events untuk satu website
func (r *Repository) GetStatusEventsByWebsite(ctx context.Context, websiteID uuid.UUID, limit int) ([]*model.StatusEvent, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, website_id, website_name, old_status, new_status, created_at
		 FROM status_events
		 WHERE website_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		websiteID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*model.StatusEvent
	for rows.Next() {
		e := &model.StatusEvent{}
		if err := rows.Scan(&e.ID, &e.WebsiteID, &e.WebsiteName, &e.OldStatus, &e.NewStatus, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

// GetAllStatusEvents mengambil semua status_events terbaru
func (r *Repository) GetAllStatusEvents(ctx context.Context, limit int) ([]*model.StatusEvent, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, website_id, website_name, old_status, new_status, created_at
		 FROM status_events
		 ORDER BY created_at DESC
		 LIMIT $1`,
		limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*model.StatusEvent
	for rows.Next() {
		e := &model.StatusEvent{}
		if err := rows.Scan(&e.ID, &e.WebsiteID, &e.WebsiteName, &e.OldStatus, &e.NewStatus, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

// ─── ENHANCED LOG (ICMP, TCP, RootCause) ─────────────────────

// InsertLogEnhanced menyimpan semua field monitoring engine terbaru.
func (r *Repository) InsertLogEnhanced(ctx context.Context, log *model.MonitoringLog) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO monitoring_logs
		 (id, website_id, checked_at,
		  dns_resolved, dns_latency_ms,
		  icmp_status, icmp_latency_ms,
		  tcp_port_open, tls_latency_ms, ttfb_latency_ms,
		  status_code, response_time_ms,
		  ssl_valid, ssl_expiry_date,
		  ip_address, error_message, status, 
		  root_cause, recommendation, health_score, confidence, is_browser_accessible,
		  final_reason, final_decision_source, resolver_stage)
		 VALUES (uuid_generate_v4(), $1, $2,
		         $3, $4,
		         $5, $6,
		         $7, $8, $9,
		         $10, $11,
		         $12, $13,
		         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
		log.WebsiteID, log.CheckedAt,
		log.DNSResolved, log.DNSLatencyMs,
		log.ICMPStatus, log.ICMPLatencyMs,
		log.TCPPortOpen, log.TLSLatencyMs, log.TTFBLatencyMs,
		log.StatusCode, log.ResponseTimeMs,
		log.SSLValid, log.SSLExpiryDate,
		log.IPAddress, log.ErrorMessage, log.Status, 
		log.RootCause, log.Recommendation, log.HealthScore, log.Confidence, log.IsBrowserAccessible,
		log.FinalReason, log.FinalDecisionSource, log.ResolverStage)
	return err
}

// ─── USER MANAGEMENT ─────────────────────────────────────────

// DeleteUser menghapus user berdasarkan ID (hanya superadmin)
func (r *Repository) DeleteUser(ctx context.Context, userID uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

// ─── UNREAD NOTIFICATIONS ─────────────────────────────────────

// GetUnreadNotificationCount mengembalikan jumlah status_events yang belum dibaca
func (r *Repository) GetUnreadNotificationCount(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM status_events WHERE is_read = FALSE`).Scan(&count)
	return count, err
}

// MarkAllNotificationsRead menandai semua status_events sebagai sudah dibaca
func (r *Repository) MarkAllNotificationsRead(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `UPDATE status_events SET is_read = TRUE WHERE is_read = FALSE`)
	return err
}

// MarkNotificationRead menandai satu status_event sebagai sudah dibaca
func (r *Repository) MarkNotificationRead(ctx context.Context, eventID uuid.UUID) error {
	_, err := r.db.Exec(ctx, `UPDATE status_events SET is_read = TRUE WHERE id = $1`, eventID)
	return err
}

// InsertAuditLog menyimpan record aktivitas audit operator
func (r *Repository) InsertAuditLog(ctx context.Context, log *model.AuditLog) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO audit_logs (id, user_id, username, action, target, details, ip_address, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())`,
		log.UserID, log.Username, log.Action, log.Target, log.Details, log.IPAddress)
	return err
}

// CountDownEventsByWebsite returns, per website, how many times it transitioned
// into a DOWN state (OFFLINE or CRITICAL) since the given time. Used by the
// weekly report to show how often each site went down during the period.
func (r *Repository) CountDownEventsByWebsite(ctx context.Context, since time.Time) (map[uuid.UUID]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT website_id, COUNT(*)
		FROM status_events
		WHERE created_at >= $1 AND new_status IN ('OFFLINE', 'CRITICAL')
		GROUP BY website_id
	`, since)
	if err != nil {
		return nil, fmt.Errorf("count down events: %w", err)
	}
	defer rows.Close()

	counts := make(map[uuid.UUID]int)
	for rows.Next() {
		var id uuid.UUID
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("scan down event count: %w", err)
		}
		counts[id] = n
	}
	return counts, rows.Err()
}

// GetDowntimeForRecovery reports, for a site that just returned to ONLINE, when it
// last left ONLINE (downStart) and whether it was actually DOWN (OFFLINE or
// CRITICAL) during that streak. downStart is nil when there is no prior ONLINE→down
// transition on record. The current recovery event (new_status='ONLINE') never
// matches the old_status filter, so it does not interfere. The query always returns
// exactly one row.
func (r *Repository) GetDowntimeForRecovery(ctx context.Context, websiteID uuid.UUID) (downStart *time.Time, wasDown bool, err error) {
	row := r.db.QueryRow(ctx, `
		WITH last_left AS (
			SELECT created_at FROM status_events
			WHERE website_id = $1 AND old_status = 'ONLINE' AND new_status <> 'ONLINE'
			ORDER BY created_at DESC LIMIT 1
		)
		SELECT
			(SELECT created_at FROM last_left),
			EXISTS (
				SELECT 1 FROM status_events
				WHERE website_id = $1 AND new_status IN ('OFFLINE', 'CRITICAL')
				  AND created_at >= (SELECT created_at FROM last_left)
			)
	`, websiteID)

	var ds *time.Time
	var down bool
	if scanErr := row.Scan(&ds, &down); scanErr != nil {
		return nil, false, fmt.Errorf("get downtime for recovery: %w", scanErr)
	}
	return ds, down, nil
}

func (r *Repository) GetWebsiteSLA(ctx context.Context, websiteID uuid.UUID) (*model.WebsiteSLA, error) {
	sla := &model.WebsiteSLA{
		SLA24h: 100.0,
		SLA7d:  100.0,
		SLA30d: 100.0,
	}

	// Calculate 24h SLA
	var total24h, online24h int
	err := r.db.QueryRow(ctx, `
		SELECT 
			COALESCE(COUNT(*), 0) AS total,
			COALESCE(COUNT(CASE WHEN status = 'ONLINE' THEN 1 END), 0) AS online
		FROM monitoring_logs
		WHERE website_id = $1 AND checked_at >= NOW() - INTERVAL '24 hours'
	`, websiteID).Scan(&total24h, &online24h)
	if err != nil {
		return nil, fmt.Errorf("calculate 24h SLA: %w", err)
	}
	if total24h > 0 {
		sla.SLA24h = (float64(online24h) / float64(total24h)) * 100.0
	}

	// Calculate 7d SLA
	var total7d, online7d int
	err = r.db.QueryRow(ctx, `
		SELECT 
			COALESCE(SUM(total_checks), 0) AS total,
			COALESCE(SUM(online_checks), 0) AS online
		FROM daily_aggregates
		WHERE website_id = $1 AND day >= (NOW() - INTERVAL '7 days')::date
	`, websiteID).Scan(&total7d, &online7d)
	if err != nil {
		return nil, fmt.Errorf("calculate 7d SLA: %w", err)
	}
	if total7d > 0 {
		sla.SLA7d = (float64(online7d) / float64(total7d)) * 100.0
	}

	// Calculate 30d SLA
	var total30d, online30d int
	err = r.db.QueryRow(ctx, `
		SELECT 
			COALESCE(SUM(total_checks), 0) AS total,
			COALESCE(SUM(online_checks), 0) AS online
		FROM daily_aggregates
		WHERE website_id = $1 AND day >= (NOW() - INTERVAL '30 days')::date
	`, websiteID).Scan(&total30d, &online30d)
	if err != nil {
		return nil, fmt.Errorf("calculate 30d SLA: %w", err)
	}
	if total30d > 0 {
		sla.SLA30d = (float64(online30d) / float64(total30d)) * 100.0
	}

	return sla, nil
}

// GetAggregateStats rolls up daily_aggregates into per-site uptime and
// response-time figures for the window [start, end], compared by calendar day.
// Average response time is weighted by each day's check count. Sites without any
// aggregate rows in the window are simply absent from the map.
func (r *Repository) GetAggregateStats(ctx context.Context, start, end time.Time) (map[uuid.UUID]*model.SiteAggStat, error) {
	rows, err := r.db.Query(ctx, `
		SELECT website_id,
			COALESCE(SUM(total_checks), 0),
			COALESCE(SUM(online_checks), 0),
			COALESCE(SUM(avg_response_time_ms::bigint * total_checks) / NULLIF(SUM(total_checks), 0), 0)::int,
			COALESCE(MIN(NULLIF(min_response_time_ms, 0)), 0),
			COALESCE(MAX(max_response_time_ms), 0),
			COALESCE(SUM(peaks_over_1000), 0)
		FROM daily_aggregates
		WHERE day >= $1::date AND day <= $2::date
		GROUP BY website_id
	`, start, end)
	if err != nil {
		return nil, fmt.Errorf("aggregate stats: %w", err)
	}
	defer rows.Close()

	out := make(map[uuid.UUID]*model.SiteAggStat)
	for rows.Next() {
		var id uuid.UUID
		var s model.SiteAggStat
		if err := rows.Scan(&id, &s.TotalChecks, &s.OnlineChecks, &s.AvgRT, &s.MinRT, &s.MaxRT, &s.PeaksOver1k); err != nil {
			return nil, fmt.Errorf("scan aggregate stats: %w", err)
		}
		out[id] = &s
	}
	return out, rows.Err()
}

// GetIncidentStats counts incidents and downtime per site for [start, end], from
// status_events. An incident = entering a down state (OFFLINE/CRITICAL) from a
// non-down state; it ends at the next event back to a healthy state, or the period
// end if still ongoing. Each incident's duration is capped at the period end.
func (r *Repository) GetIncidentStats(ctx context.Context, start, end time.Time) (map[uuid.UUID]*model.SiteIncidentStat, error) {
	rows, err := r.db.Query(ctx, `
		WITH starts AS (
			SELECT e.website_id, e.created_at,
				(SELECT MIN(e2.created_at) FROM status_events e2
				 WHERE e2.website_id = e.website_id
				   AND e2.created_at > e.created_at
				   AND e2.new_status NOT IN ('OFFLINE', 'CRITICAL')) AS recovered_at
			FROM status_events e
			WHERE e.created_at >= $1 AND e.created_at <= $2
			  AND e.new_status IN ('OFFLINE', 'CRITICAL')
			  AND (e.old_status IS NULL OR e.old_status NOT IN ('OFFLINE', 'CRITICAL'))
		)
		SELECT website_id,
			COUNT(*),
			COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(recovered_at, $2), $2) - created_at))), 0),
			COALESCE(MAX(EXTRACT(EPOCH FROM (LEAST(COALESCE(recovered_at, $2), $2) - created_at))), 0)
		FROM starts
		GROUP BY website_id
	`, start, end)
	if err != nil {
		return nil, fmt.Errorf("incident stats: %w", err)
	}
	defer rows.Close()

	out := make(map[uuid.UUID]*model.SiteIncidentStat)
	for rows.Next() {
		var id uuid.UUID
		var s model.SiteIncidentStat
		if err := rows.Scan(&id, &s.Incidents, &s.TotalDownSecs, &s.LongestDownSecs); err != nil {
			return nil, fmt.Errorf("scan incident stats: %w", err)
		}
		out[id] = &s
	}
	return out, rows.Err()
}

