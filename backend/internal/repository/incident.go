package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
)

// ─── INCIDENTS ────────────────────────────────────────────────

func (r *Repository) GetIncidents(ctx context.Context) ([]*model.Incident, error) {
	query := `
		SELECT 
			i.id, i.website_id, w.name AS website_name, i.title, i.status, i.severity, 
			i.assigned_user_id, u.username AS assigned_name, i.created_at, i.resolved_at, i.closed_at
		FROM incidents i
		JOIN websites w ON i.website_id = w.id
		LEFT JOIN users u ON i.assigned_user_id = u.id
		ORDER BY i.created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query incidents: %w", err)
	}
	defer rows.Close()

	var incidents []*model.Incident
	for rows.Next() {
		var i model.Incident
		err := rows.Scan(
			&i.ID, &i.WebsiteID, &i.WebsiteName, &i.Title, &i.Status, &i.Severity,
			&i.AssignedUserID, &i.AssignedName, &i.CreatedAt, &i.ResolvedAt, &i.ClosedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan incident: %w", err)
		}
		incidents = append(incidents, &i)
	}
	return incidents, nil
}

func (r *Repository) GetIncidentByID(ctx context.Context, id uuid.UUID) (*model.Incident, error) {
	query := `
		SELECT 
			i.id, i.website_id, w.name AS website_name, i.title, i.status, i.severity, 
			i.assigned_user_id, u.username AS assigned_name, i.created_at, i.resolved_at, i.closed_at
		FROM incidents i
		JOIN websites w ON i.website_id = w.id
		LEFT JOIN users u ON i.assigned_user_id = u.id
		WHERE i.id = $1
	`
	var i model.Incident
	err := r.db.QueryRow(ctx, query, id).Scan(
		&i.ID, &i.WebsiteID, &i.WebsiteName, &i.Title, &i.Status, &i.Severity,
		&i.AssignedUserID, &i.AssignedName, &i.CreatedAt, &i.ResolvedAt, &i.ClosedAt,
	)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

func (r *Repository) CreateIncident(ctx context.Context, i *model.Incident) (*model.Incident, error) {
	query := `
		INSERT INTO incidents (id, website_id, title, status, severity, assigned_user_id, created_at, resolved_at, closed_at)
		VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), NULL, NULL)
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query, i.WebsiteID, i.Title, i.Status, i.Severity, i.AssignedUserID).Scan(&i.ID, &i.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create incident: %w", err)
	}
	return i, nil
}

func (r *Repository) UpdateIncident(ctx context.Context, i *model.Incident) error {
	query := `
		UPDATE incidents
		SET status = $1, assigned_user_id = $2, resolved_at = $3, closed_at = $4
		WHERE id = $5
	`
	_, err := r.db.Exec(ctx, query, i.Status, i.AssignedUserID, i.ResolvedAt, i.ClosedAt, i.ID)
	if err != nil {
		return fmt.Errorf("update incident: %w", err)
	}
	return nil
}

func (r *Repository) GetActiveIncidentByWebsite(ctx context.Context, websiteID uuid.UUID) (*model.Incident, error) {
	query := `
		SELECT id, website_id, title, status, severity, assigned_user_id, created_at, resolved_at, closed_at
		FROM incidents
		WHERE website_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')
		LIMIT 1
	`
	var i model.Incident
	err := r.db.QueryRow(ctx, query, websiteID).Scan(
		&i.ID, &i.WebsiteID, &i.Title, &i.Status, &i.Severity, &i.AssignedUserID, &i.CreatedAt, &i.ResolvedAt, &i.ClosedAt,
	)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

// ─── INCIDENT COMMENTS ────────────────────────────────────────

func (r *Repository) GetIncidentComments(ctx context.Context, incidentID uuid.UUID) ([]*model.IncidentComment, error) {
	query := `
		SELECT id, incident_id, user_id, username, comment, created_at
		FROM incident_comments
		WHERE incident_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.Query(ctx, query, incidentID)
	if err != nil {
		return nil, fmt.Errorf("query incident comments: %w", err)
	}
	defer rows.Close()

	var comments []*model.IncidentComment
	for rows.Next() {
		var c model.IncidentComment
		err := rows.Scan(&c.ID, &c.IncidentID, &c.UserID, &c.Username, &c.Comment, &c.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("scan incident comment: %w", err)
		}
		comments = append(comments, &c)
	}
	return comments, nil
}

func (r *Repository) InsertIncidentComment(ctx context.Context, c *model.IncidentComment) error {
	query := `
		INSERT INTO incident_comments (id, incident_id, user_id, username, comment, created_at)
		VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query, c.IncidentID, c.UserID, c.Username, c.Comment).Scan(&c.ID, &c.CreatedAt)
}

// ─── INCIDENT HISTORY ─────────────────────────────────────────

func (r *Repository) GetIncidentHistory(ctx context.Context, incidentID uuid.UUID) ([]*model.IncidentHistory, error) {
	query := `
		SELECT id, incident_id, user_id, username, action, details, created_at
		FROM incident_history
		WHERE incident_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, incidentID)
	if err != nil {
		return nil, fmt.Errorf("query incident history: %w", err)
	}
	defer rows.Close()

	var history []*model.IncidentHistory
	for rows.Next() {
		var h model.IncidentHistory
		err := rows.Scan(&h.ID, &h.IncidentID, &h.UserID, &h.Username, &h.Action, &h.Details, &h.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("scan incident history: %w", err)
		}
		history = append(history, &h)
	}
	return history, nil
}

func (r *Repository) InsertIncidentHistory(ctx context.Context, h *model.IncidentHistory) error {
	query := `
		INSERT INTO incident_history (id, incident_id, user_id, username, action, details, created_at)
		VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query, h.IncidentID, h.UserID, h.Username, h.Action, h.Details).Scan(&h.ID, &h.CreatedAt)
}

// ─── MAINTENANCE WINDOWS ──────────────────────────────────────

func (r *Repository) GetMaintenanceWindows(ctx context.Context) ([]*model.MaintenanceWindow, error) {
	query := `
		SELECT 
			m.id, m.website_id, w.name AS website_name, m.start_time, m.end_time, 
			m.description, m.created_by, u.username AS created_by_name, m.created_at
		FROM maintenance_windows m
		LEFT JOIN websites w ON m.website_id = w.id
		LEFT JOIN users u ON m.created_by = u.id
		ORDER BY m.start_time DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query maintenance windows: %w", err)
	}
	defer rows.Close()

	var mws []*model.MaintenanceWindow
	for rows.Next() {
		var m model.MaintenanceWindow
		err := rows.Scan(
			&m.ID, &m.WebsiteID, &m.WebsiteName, &m.StartTime, &m.EndTime,
			&m.Description, &m.CreatedBy, &m.CreatedByName, &m.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan maintenance window: %w", err)
		}
		mws = append(mws, &m)
	}
	return mws, nil
}

func (r *Repository) GetActiveMaintenanceForWebsite(ctx context.Context, websiteID uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM maintenance_windows
			WHERE (website_id = $1 OR website_id IS NULL)
			  AND NOW() BETWEEN start_time AND end_time
		)
	`
	var active bool
	err := r.db.QueryRow(ctx, query, websiteID).Scan(&active)
	return active, err
}

func (r *Repository) CreateMaintenanceWindow(ctx context.Context, m *model.MaintenanceWindow) (*model.MaintenanceWindow, error) {
	query := `
		INSERT INTO maintenance_windows (id, website_id, start_time, end_time, description, created_by, created_at)
		VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query, m.WebsiteID, m.StartTime, m.EndTime, m.Description, m.CreatedBy).Scan(&m.ID, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create maintenance window: %w", err)
	}
	return m, nil
}

func (r *Repository) DeleteMaintenanceWindow(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM maintenance_windows WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
