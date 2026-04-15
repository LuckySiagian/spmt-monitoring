package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/middleware"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/repository"
	"golang.org/x/crypto/bcrypt"
	"regexp"
)

var (
	// Strict URL Regex: http/https followed by valid domain structure
	urlRegex = regexp.MustCompile(`^https?://(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:/.*)?$`)
)

func isValidURLStrict(u string) bool {
	return urlRegex.MatchString(u)
}

type Service struct {
	repo      *repository.Repository
	jwtSecret string
	jwtExpiry time.Duration
}

func New(repo *repository.Repository, jwtSecret string, jwtExpiryHours int) *Service {
	return &Service{
		repo:      repo,
		jwtSecret: jwtSecret,
		jwtExpiry: time.Duration(jwtExpiryHours) * time.Hour,
	}
}

// ─── AUTH ─────────────────────────────────────────────────────

func (s *Service) Login(ctx context.Context, req model.LoginRequest) (*model.LoginResponse, error) {
	user, err := s.repo.GetUserByUsername(ctx, req.Username)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &model.LoginResponse{
		Token: token,
		User: model.UserResponse{
			ID:        user.ID,
			Username:  user.Username,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
		},
	}, nil
}

func (s *Service) Register(ctx context.Context, req model.RegisterRequest) (*model.UserResponse, error) {
	if len(req.Username) < 3 {
		return nil, errors.New("username must be at least 3 characters")
	}
	if len(req.Password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.repo.CreateUser(ctx, req.Username, string(hash), model.RoleViewer)
	if err != nil {
		return nil, errors.New("username already exists")
	}

	return &model.UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *Service) generateToken(user *model.User) (string, error) {
	claims := middleware.Claims{
		UserID:   user.ID.String(),
		Username: user.Username,
		Role:     string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.jwtSecret))
}

// ─── USER MANAGEMENT ─────────────────────────────────────────

func (s *Service) GetAllUsers(ctx context.Context) ([]*model.UserResponse, error) {
	users, err := s.repo.GetAllUsers(ctx)
	if err != nil {
		return nil, err
	}
	var result []*model.UserResponse
	for _, u := range users {
		result = append(result, &model.UserResponse{
			ID:        u.ID,
			Username:  u.Username,
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
		})
	}
	return result, nil
}

func (s *Service) PromoteUser(ctx context.Context, req model.PromoteRequest) error {
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		return errors.New("invalid user_id")
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	if user.Role == model.RoleSuperAdmin {
		return errors.New("cannot promote superadmin")
	}
	if user.Role == model.RoleAdmin {
		return errors.New("user is already admin")
	}

	count, err := s.repo.CountAdmins(ctx)
	if err != nil {
		return err
	}
	if count >= 3 {
		return errors.New("maximum admin limit (3) reached")
	}

	return s.repo.UpdateUserRole(ctx, userID, model.RoleAdmin)
}

func (s *Service) DemoteUser(ctx context.Context, req model.DemoteRequest) error {
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		return errors.New("invalid user_id")
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	if user.Role == model.RoleSuperAdmin {
		return errors.New("cannot demote superadmin")
	}
	if user.Role == model.RoleViewer {
		return errors.New("user is already viewer")
	}

	return s.repo.UpdateUserRole(ctx, userID, model.RoleViewer)
}

// ─── WEBSITES ────────────────────────────────────────────────

func (s *Service) GetAllWebsites(ctx context.Context) ([]*model.Website, error) {
	sites, err := s.repo.GetAllWebsites(ctx)
	if err != nil {
		return nil, err
	}

	// Enrich with latest log
	for _, w := range sites {
		log, err := s.repo.GetLatestLogByWebsite(ctx, w.ID)
		if err == nil && log != nil {
			w.Status = string(log.Status)
			w.StatusCode = log.StatusCode
			w.ResponseTimeMs = log.ResponseTimeMs
			w.SSLValid = &log.SSLValid
			w.LastChecked = &log.CheckedAt
		}
	}
	return sites, nil
}

func (s *Service) CreateWebsite(ctx context.Context, req model.CreateWebsiteRequest) (*model.Website, error) {
	if req.Name == "" || req.URL == "" {
		return nil, errors.New("name and url are required")
	}
	if !isValidURLStrict(req.URL) {
		return nil, errors.New("invalid URL format (e.g. https://example.com) or domain typo")
	}
	if req.IntervalSeconds < 1 {
		req.IntervalSeconds = 1
	}
	if req.IntervalSeconds > 3 {
		req.IntervalSeconds = 3
	}
	return s.repo.CreateWebsite(ctx, req)
}

func (s *Service) UpdateWebsite(ctx context.Context, id uuid.UUID, req model.UpdateWebsiteRequest) (*model.Website, error) {
	if req.Name == "" || req.URL == "" {
		return nil, errors.New("name and url are required")
	}
	if !isValidURLStrict(req.URL) {
		return nil, errors.New("invalid URL format (e.g. https://example.com) or domain typo")
	}
	if req.IntervalSeconds < 1 {
		req.IntervalSeconds = 1
	}
	if req.IntervalSeconds > 3 {
		req.IntervalSeconds = 3
	}
	return s.repo.UpdateWebsite(ctx, id, req)
}

func (s *Service) DeleteWebsite(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteWebsite(ctx, id)
}

// ─── DASHBOARD ───────────────────────────────────────────────

func (s *Service) GetDashboardSummary(ctx context.Context) (*model.DashboardSummary, error) {
	return s.repo.GetDashboardSummary(ctx)
}

func (s *Service) GetWebsiteLogs(ctx context.Context, websiteID uuid.UUID, limit int) ([]*model.MonitoringLog, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.GetLogsByWebsite(ctx, websiteID, limit)
}

func (s *Service) GetStatusHistory(ctx context.Context, rangeStr string) ([]*model.StatusHistoryPoint, error) {
	return s.repo.GetStatusHistory(ctx, rangeStr)
}

func (s *Service) GetStatusHistoryCustom(ctx context.Context, start, end string) ([]*model.StatusHistoryPoint, error) {
	return s.repo.GetStatusHistoryCustom(ctx, start, end)
}

// ─── STATUS EVENTS ────────────────────────────────────────────

func (s *Service) GetStatusEventsByWebsite(ctx context.Context, websiteID uuid.UUID, limit int) ([]*model.StatusEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.repo.GetStatusEventsByWebsite(ctx, websiteID, limit)
}

func (s *Service) GetAllStatusEvents(ctx context.Context, limit int) ([]*model.StatusEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.GetAllStatusEvents(ctx, limit)
}

// ─── USER MANAGEMENT (SUPERADMIN) ────────────────────────────

// CreateUserByAdmin — superadmin buat user baru dengan role pilihan
func (s *Service) CreateUserByAdmin(ctx context.Context, req model.CreateUserRequest) (*model.UserResponse, error) {
	if len(req.Username) < 3 {
		return nil, errors.New("username must be at least 3 characters")
	}
	if len(req.Password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}
	role := model.RoleViewer
	switch req.Role {
	case "admin":
		role = model.RoleAdmin
	case "superadmin":
		return nil, errors.New("cannot create superadmin via this endpoint")
	case "viewer", "":
		role = model.RoleViewer
	default:
		return nil, errors.New("invalid role, use 'admin' or 'viewer'")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	user, err := s.repo.CreateUser(ctx, req.Username, string(hash), role)
	if err != nil {
		return nil, errors.New("username already exists")
	}
	return &model.UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

// DeleteUser — superadmin hapus user (tidak bisa hapus diri sendiri)
func (s *Service) DeleteUser(ctx context.Context, userIDStr string) error {
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return errors.New("invalid user id")
	}
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}
	if user.Role == model.RoleSuperAdmin {
		return errors.New("cannot delete superadmin")
	}
	return s.repo.DeleteUser(ctx, userID)
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

func (s *Service) MarkAllNotificationsRead(ctx context.Context) error {
	return s.repo.MarkAllNotificationsRead(ctx)
}

func (s *Service) GetUnreadNotificationCount(ctx context.Context) (int, error) {
	return s.repo.GetUnreadNotificationCount(ctx)
}
