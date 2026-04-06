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

// ─── USER ────────────────────────────────────────────────────

func (r *Repository) GetUserByUsername(ctx context.Context, username string) (*model.User, error) {
	var u model.User
	row := r.db.QueryRow(ctx,
		`SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1`, username)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	var u model.User
	row := r.db.QueryRow(ctx,
		`SELECT id, username, password_hash, role, created_at FROM users WHERE id = $1`, id)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) CreateUser(ctx context.Context, username, passwordHash string, role model.Role) (*model.User, error) {
	var u model.User
	row := r.db.QueryRow(ctx,
		`INSERT INTO users (id, username, password_hash, role, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, NOW())
		 RETURNING id, username, password_hash, role, created_at`,
		username, passwordHash, role)
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetAllUsers(ctx context.Context) ([]*model.User, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, username, password_hash, role, created_at FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.CreatedAt); err != nil {
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

func (r *Repository) UpdateUserRole(ctx context.Context, userID uuid.UUID, role model.Role) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, userID)
	return err
}

// ─── WEBSITES ────────────────────────────────────────────────

func (r *Repository) GetAllWebsites(ctx context.Context) ([]*model.Website, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, url, description, interval_seconds, created_at FROM websites ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []*model.Website
	for rows.Next() {
		var w model.Website
		if err := rows.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.CreatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, &w)
	}
	return sites, nil
}

func (r *Repository) GetWebsiteByID(ctx context.Context, id uuid.UUID) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`SELECT id, name, url, description, interval_seconds, created_at FROM websites WHERE id = $1`, id)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) CreateWebsite(ctx context.Context, req model.CreateWebsiteRequest) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`INSERT INTO websites (id, name, url, description, interval_seconds, created_at)
		 VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())
		 RETURNING id, name, url, description, interval_seconds, created_at`,
		req.Name, req.URL, req.Description, req.IntervalSeconds)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) UpdateWebsite(ctx context.Context, id uuid.UUID, req model.UpdateWebsiteRequest) (*model.Website, error) {
	var w model.Website
	row := r.db.QueryRow(ctx,
		`UPDATE websites SET name=$1, url=$2, description=$3, interval_seconds=$4
		 WHERE id=$5
		 RETURNING id, name, url, description, interval_seconds, created_at`,
		req.Name, req.URL, req.Description, req.IntervalSeconds, id)
	err := row.Scan(&w.ID, &w.Name, &w.URL, &w.Description, &w.IntervalSeconds, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) DeleteWebsite(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM websites WHERE id = $1`, id)
	return err
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
		`SELECT id, website_id, checked_at, dns_resolved, status_code, response_time_ms, ssl_valid, error_message, status
		 FROM monitoring_logs WHERE website_id = $1 ORDER BY checked_at DESC LIMIT 1`, websiteID)
	err := row.Scan(&l.ID, &l.WebsiteID, &l.CheckedAt, &l.DNSResolved, &l.StatusCode,
		&l.ResponseTimeMs, &l.SSLValid, &l.ErrorMessage, &l.Status)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) GetLogsByWebsite(ctx context.Context, websiteID uuid.UUID, limit int) ([]*model.MonitoringLog, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, website_id, checked_at, dns_resolved, status_code, response_time_ms, ssl_valid, error_message, status
		 FROM monitoring_logs WHERE website_id = $1 ORDER BY checked_at DESC LIMIT $2`,
		websiteID, limit)
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
		SELECT status, COUNT(*), AVG(response_time_ms)
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
			summary.OnlineCount = count
		case "CRITICAL":
			summary.CriticalCount = count
		case "OFFLINE":
			summary.OfflineCount = count
		case "UNKNOWN":
			summary.UnknownCount = count
		}
		if avg != nil {
			totalAvg += *avg * float64(count)
			totalCount += count
		}
	}

	if totalCount > 0 {
		summary.AvgResponseTime = totalAvg / float64(totalCount)
	}

	// Websites with no logs yet (never checked) = UNKNOWN
	loggedTotal := summary.OnlineCount + summary.CriticalCount + summary.OfflineCount + summary.UnknownCount
	if loggedTotal < summary.TotalWebsites {
		summary.UnknownCount += summary.TotalWebsites - loggedTotal
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
			COUNT(CASE WHEN status = 'CRITICAL' THEN 1 END)::int AS critical_count,
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
			COUNT(CASE WHEN status = 'CRITICAL' THEN 1 END)::int AS critical_count,
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
		  tcp_port_open,
		  status_code, response_time_ms,
		  ssl_valid, ssl_expiry_date,
		  ip_address, error_message, status, root_cause)
		 VALUES (uuid_generate_v4(), $1, $2,
		         $3, $4,
		         $5, $6,
		         $7,
		         $8, $9,
		         $10, $11,
		         $12, $13, $14, $15)`,
		log.WebsiteID, log.CheckedAt,
		log.DNSResolved, log.DNSLatencyMs,
		log.ICMPStatus, log.ICMPLatencyMs,
		log.TCPPortOpen,
		log.StatusCode, log.ResponseTimeMs,
		log.SSLValid, log.SSLExpiryDate,
		log.IPAddress, log.ErrorMessage, log.Status, log.RootCause)
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
