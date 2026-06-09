package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
)

// ─── INCIDENTS ────────────────────────────────────────────────

func (s *Service) GetIncidents(ctx context.Context) ([]*model.Incident, error) {
	return s.repo.GetIncidents(ctx)
}

func (s *Service) GetIncidentByID(ctx context.Context, id uuid.UUID) (*model.Incident, error) {
	return s.repo.GetIncidentByID(ctx, id)
}

func (s *Service) AcknowledgeIncident(ctx context.Context, id uuid.UUID, userID uuid.UUID, username string) error {
	inc, err := s.repo.GetIncidentByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get incident: %w", err)
	}

	if inc.Status != "TRIGGERED" {
		return errors.New("only triggered incidents can be acknowledged")
	}

	inc.Status = "ACKNOWLEDGED"
	inc.AssignedUserID = &userID
	err = s.repo.UpdateIncident(ctx, inc)
	if err != nil {
		return err
	}

	// Insert history
	history := &model.IncidentHistory{
		IncidentID: id,
		UserID:     &userID,
		Username:   username,
		Action:     "ACKNOWLEDGE",
		Details:    "Incident acknowledged by " + username,
	}
	return s.repo.InsertIncidentHistory(ctx, history)
}

func (s *Service) AssignIncident(ctx context.Context, id uuid.UUID, targetUserID uuid.UUID, actorUserID uuid.UUID, actorUsername string) error {
	inc, err := s.repo.GetIncidentByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get incident: %w", err)
	}

	targetUser, err := s.repo.GetUserByID(ctx, targetUserID)
	if err != nil {
		return fmt.Errorf("get target user: %w", err)
	}

	inc.AssignedUserID = &targetUserID
	if inc.Status == "TRIGGERED" {
		inc.Status = "INVESTIGATING" // Shift to investigating when assigned
	}
	err = s.repo.UpdateIncident(ctx, inc)
	if err != nil {
		return err
	}

	// Insert history
	history := &model.IncidentHistory{
		IncidentID: id,
		UserID:     &actorUserID,
		Username:   actorUsername,
		Action:     "ASSIGN",
		Details:    fmt.Sprintf("Incident assigned to %s by %s", targetUser.Username, actorUsername),
	}
	return s.repo.InsertIncidentHistory(ctx, history)
}

func (s *Service) ResolveIncident(ctx context.Context, id uuid.UUID, userID uuid.UUID, username string) error {
	inc, err := s.repo.GetIncidentByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get incident: %w", err)
	}

	if inc.Status == "RESOLVED" || inc.Status == "CLOSED" {
		return errors.New("incident is already resolved or closed")
	}

	now := time.Now()
	inc.Status = "RESOLVED"
	inc.ResolvedAt = &now
	err = s.repo.UpdateIncident(ctx, inc)
	if err != nil {
		return err
	}

	// Insert history
	history := &model.IncidentHistory{
		IncidentID: id,
		UserID:     &userID,
		Username:   username,
		Action:     "RESOLVE",
		Details:    "Incident resolved by " + username,
	}
	return s.repo.InsertIncidentHistory(ctx, history)
}

func (s *Service) ReopenIncident(ctx context.Context, id uuid.UUID, userID uuid.UUID, username string) error {
	inc, err := s.repo.GetIncidentByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get incident: %w", err)
	}

	if inc.Status != "RESOLVED" && inc.Status != "CLOSED" {
		return errors.New("only resolved or closed incidents can be reopened")
	}

	inc.Status = "TRIGGERED"
	inc.ResolvedAt = nil
	inc.ClosedAt = nil
	err = s.repo.UpdateIncident(ctx, inc)
	if err != nil {
		return err
	}

	// Insert history
	history := &model.IncidentHistory{
		IncidentID: id,
		UserID:     &userID,
		Username:   username,
		Action:     "REOPEN",
		Details:    "Incident reopened by " + username,
	}
	return s.repo.InsertIncidentHistory(ctx, history)
}

func (s *Service) CloseIncident(ctx context.Context, id uuid.UUID, userID uuid.UUID, username string) error {
	inc, err := s.repo.GetIncidentByID(ctx, id)
	if err != nil {
		return fmt.Errorf("get incident: %w", err)
	}

	if inc.Status == "CLOSED" {
		return errors.New("incident is already closed")
	}

	now := time.Now()
	inc.Status = "CLOSED"
	inc.ClosedAt = &now
	err = s.repo.UpdateIncident(ctx, inc)
	if err != nil {
		return err
	}

	// Insert history
	history := &model.IncidentHistory{
		IncidentID: id,
		UserID:     &userID,
		Username:   username,
		Action:     "CLOSE",
		Details:    "Incident closed by " + username,
	}
	return s.repo.InsertIncidentHistory(ctx, history)
}

// ─── COMMENTS ─────────────────────────────────────────────────

func (s *Service) AddIncidentComment(ctx context.Context, incidentID uuid.UUID, userID uuid.UUID, username string, commentText string) (*model.IncidentComment, error) {
	if commentText == "" {
		return nil, errors.New("comment cannot be empty")
	}

	c := &model.IncidentComment{
		IncidentID: incidentID,
		UserID:     userID,
		Username:   username,
		Comment:    commentText,
	}
	err := s.repo.InsertIncidentComment(ctx, c)
	if err != nil {
		return nil, err
	}

	// Log in history
	history := &model.IncidentHistory{
		IncidentID: incidentID,
		UserID:     &userID,
		Username:   username,
		Action:     "COMMENT",
		Details:    "Comment added: " + commentText,
	}
	_ = s.repo.InsertIncidentHistory(ctx, history) // ignore history error for comments

	return c, nil
}

func (s *Service) GetIncidentComments(ctx context.Context, incidentID uuid.UUID) ([]*model.IncidentComment, error) {
	return s.repo.GetIncidentComments(ctx, incidentID)
}

func (s *Service) GetIncidentHistory(ctx context.Context, incidentID uuid.UUID) ([]*model.IncidentHistory, error) {
	return s.repo.GetIncidentHistory(ctx, incidentID)
}

// ─── MAINTENANCE WINDOWS ──────────────────────────────────────

func (s *Service) GetMaintenanceWindows(ctx context.Context) ([]*model.MaintenanceWindow, error) {
	return s.repo.GetMaintenanceWindows(ctx)
}

func (s *Service) CreateMaintenanceWindow(ctx context.Context, mw *model.MaintenanceWindow) (*model.MaintenanceWindow, error) {
	if mw.StartTime.After(mw.EndTime) {
		return nil, errors.New("start time must be before end time")
	}
	if mw.EndTime.Before(time.Now()) {
		return nil, errors.New("end time cannot be in the past")
	}
	return s.repo.CreateMaintenanceWindow(ctx, mw)
}

func (s *Service) DeleteMaintenanceWindow(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteMaintenanceWindow(ctx, id)
}
