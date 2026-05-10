package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/middleware"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/notification"
	"github.com/spmt/monitoring/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

var (
	// Strict URL Regex: http/https followed by valid domain structure
	urlRegex = regexp.MustCompile(`^https?://(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:/.*)?$`)
)

func isValidURLStrict(u string) bool {
	return urlRegex.MatchString(u)
}

type Service struct {
	repo            *repository.Repository
	jwtSecret       string
	turnstileSecret string
	jwtExpiry       time.Duration
}

func New(repo *repository.Repository, jwtSecret, turnstileSecret string, jwtExpiryHours int) *Service {
	return &Service{
		repo:            repo,
		jwtSecret:       jwtSecret,
		turnstileSecret: turnstileSecret,
		jwtExpiry:       time.Duration(jwtExpiryHours) * time.Hour,
	}
}

func (s *Service) verifyTurnstile(token string) bool {
	if s.turnstileSecret == "" {
		return true // Skip if not configured
	}

	data := url.Values{}
	data.Set("secret", s.turnstileSecret)
	data.Set("response", token)

	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", data)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Success
}

// ─── AUTH ─────────────────────────────────────────────────────

func (s *Service) Login(ctx context.Context, req model.LoginRequest) (*model.LoginResponse, error) {
	// Verify Turnstile Token if secret is configured
	if s.turnstileSecret != "" {
		if req.TurnstileToken == "" {
			return nil, errors.New("captcha verification required")
		}
		if !s.verifyTurnstile(req.TurnstileToken) {
			return nil, errors.New("captcha verification failed")
		}
	}

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
			ID:         user.ID,
			Username:   user.Username,
			Email:      user.Email,
			TelegramID: user.TelegramID,
			Role:       user.Role,
			CreatedAt:  user.CreatedAt,
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
	if req.Email == "" {
		return nil, errors.New("email is required")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.repo.CreateUser(ctx, req.Username, string(hash), req.Email, req.TelegramID, model.RoleViewer)
	if err != nil {
		return nil, errors.New("username or email already exists")
	}

	return &model.UserResponse{
		ID:         user.ID,
		Username:   user.Username,
		Email:      user.Email,
		TelegramID: user.TelegramID,
		Role:       user.Role,
		CreatedAt:  user.CreatedAt,
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
			ID:         u.ID,
			Username:   u.Username,
			Email:      u.Email,
			TelegramID: u.TelegramID,
			Role:       u.Role,
			CreatedAt:  u.CreatedAt,
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
	return s.repo.GetAllWebsites(ctx)
}

func (s *Service) CreateWebsite(ctx context.Context, req model.CreateWebsiteRequest) (*model.Website, error) {
	existing, err := s.repo.GetAllWebsites(ctx)
	if err == nil && len(existing) >= 100 {
		return nil, errors.New("maximum limit of 100 websites reached")
	}
	if req.Name == "" || req.URL == "" {
		return nil, errors.New("name and url are required")
	}
	if !isValidURLStrict(req.URL) {
		return nil, errors.New("invalid URL format (e.g. https://example.com) or domain typo")
	}
	if req.IntervalSeconds < 10 {
		req.IntervalSeconds = 10
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
	if req.IntervalSeconds < 10 {
		req.IntervalSeconds = 10
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
	if req.Email == "" {
		return nil, errors.New("email is required")
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
	user, err := s.repo.CreateUser(ctx, req.Username, string(hash), req.Email, req.TelegramID, role)
	if err != nil {
		return nil, errors.New("username or email already exists")
	}
	return &model.UserResponse{
		ID:         user.ID,
		Username:   user.Username,
		Email:      user.Email,
		TelegramID: user.TelegramID,
		Role:       user.Role,
		CreatedAt:  user.CreatedAt,
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

func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, req model.UpdateProfileRequest) error {
	var telegramID *string
	if req.TelegramID != nil && *req.TelegramID != "" {
		telegramID = req.TelegramID
	}
	err := s.repo.UpdateUserProfile(ctx, userID, req.Email, telegramID)
	if err != nil {
		log.Printf("[Service] UpdateUserProfile Database Error: %v", err)
	}
	return err
}

func (s *Service) ChangePassword(ctx context.Context, userID uuid.UUID, req model.ChangePasswordRequest) error {
	if req.NewPassword != req.ConfirmPassword {
		return errors.New("new password and confirmation do not match")
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		return errors.New("incorrect old password")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.repo.UpdateUserPassword(ctx, userID, string(hash))
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

func (s *Service) MarkAllNotificationsRead(ctx context.Context) error {
	return s.repo.MarkAllNotificationsRead(ctx)
}

func (s *Service) GetUnreadNotificationCount(ctx context.Context) (int, error) {
	return s.repo.GetUnreadNotificationCount(ctx)
}
func (s *Service) SendTestEmail(ctx context.Context, userID uuid.UUID, notif *notification.Service) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.Email == "" {
		return errors.New("you must set an email in your profile first")
	}

	return notif.NotifyTestEmail(user.Email)
}
func (s *Service) GetStatusDistribution(ctx context.Context) (map[string]float64, error) {
	sites, err := s.repo.GetAllWebsites(ctx)
	if err != nil {
		return nil, err
	}
	if len(sites) == 0 {
		return make(map[string]float64), nil
	}

	counts := make(map[string]int)
	total := 0
	for _, w := range sites {
		log, err := s.repo.GetLatestLogByWebsite(ctx, w.ID)
		if err == nil && log != nil {
			counts[string(log.Status)]++
			total++
		}
	}

	dist := make(map[string]float64)
	if total > 0 {
		for status, count := range counts {
			dist[status] = (float64(count) / float64(total)) * 100
		}
	}
	return dist, nil
}
