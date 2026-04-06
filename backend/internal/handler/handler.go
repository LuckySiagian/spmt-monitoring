package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/service"
	ws "github.com/spmt/monitoring/internal/websocket"
	"github.com/spmt/monitoring/internal/worker"
)

type Handler struct {
	svc  *service.Service
	pool *worker.Pool
	hub  *ws.Hub
}

func New(svc *service.Service, pool *worker.Pool, hub *ws.Hub) *Handler {
	return &Handler{svc: svc, pool: pool, hub: hub}
}

func respond(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respond(w, status, map[string]string{"error": msg})
}

// ─── AUTH ─────────────────────────────────────────────────────

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.svc.Login(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}
	respond(w, http.StatusOK, resp)
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.svc.Register(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond(w, http.StatusCreated, user)
}

// ─── USERS ────────────────────────────────────────────────────

func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.svc.GetAllUsers(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, users)
}

func (h *Handler) PromoteUser(w http.ResponseWriter, r *http.Request) {
	var req model.PromoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.PromoteUser(r.Context(), req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "user promoted to admin"})
}

func (h *Handler) DemoteUser(w http.ResponseWriter, r *http.Request) {
	var req model.DemoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.DemoteUser(r.Context(), req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "user demoted to viewer"})
}

// ─── WEBSITES ────────────────────────────────────────────────

func (h *Handler) GetWebsites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.svc.GetAllWebsites(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sites == nil {
		sites = []*model.Website{}
	}
	respond(w, http.StatusOK, sites)
}

func (h *Handler) CreateWebsite(w http.ResponseWriter, r *http.Request) {
	var req model.CreateWebsiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	site, err := h.svc.CreateWebsite(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Trigger immediate check for new website
	go h.pool.TriggerCheck(*site)

	respond(w, http.StatusCreated, site)
}

func (h *Handler) UpdateWebsite(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid website id")
		return
	}

	var req model.UpdateWebsiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	site, err := h.svc.UpdateWebsite(r.Context(), id, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	// BUG FIX #10: restart worker agar monitoring pakai URL/config terbaru
	go h.pool.RestartWebsite(*site)
	respond(w, http.StatusOK, site)
}

func (h *Handler) DeleteWebsite(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid website id")
		return
	}

	if err := h.svc.DeleteWebsite(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "website deleted"})
}

// ─── DASHBOARD ───────────────────────────────────────────────

func (h *Handler) GetDashboardSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.svc.GetDashboardSummary(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, summary)
}

func (h *Handler) GetWebsiteLogs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid website id")
		return
	}

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	logs, err := h.svc.GetWebsiteLogs(r.Context(), id, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if logs == nil {
		logs = []*model.MonitoringLog{}
	}
	respond(w, http.StatusOK, logs)
}

// ─── WEBSOCKET ───────────────────────────────────────────────

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	h.hub.ServeWS(w, r)
}

// GetStatusHistory mengembalikan data historis status service untuk grafik
func (h *Handler) GetStatusHistory(w http.ResponseWriter, r *http.Request) {
	rangeStr := r.URL.Query().Get("range")
	if rangeStr == "" {
		rangeStr = "24h"
	}
	// Validasi input
	switch rangeStr {
	case "live", "1h", "3h", "6h", "24h", "7d":
		// valid
	default:
		rangeStr = "24h"
	}

	points, err := h.svc.GetStatusHistory(r.Context(), rangeStr)
	if err != nil {
		respondError(w, 500, "failed to fetch history")
		return
	}
	respond(w, 200, points)
}

// GetWebsiteEvents mengembalikan status_events untuk satu website
func (h *Handler) GetWebsiteEvents(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid website id")
		return
	}
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}
	events, err := h.svc.GetStatusEventsByWebsite(r.Context(), id, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if events == nil {
		events = []*model.StatusEvent{}
	}
	respond(w, http.StatusOK, events)
}

// GetAllStatusEvents mengembalikan semua status_events terbaru
func (h *Handler) GetAllStatusEvents(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}
	events, err := h.svc.GetAllStatusEvents(r.Context(), limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if events == nil {
		events = []*model.StatusEvent{}
	}
	respond(w, http.StatusOK, events)
}

// ─── USER MANAGEMENT (SUPERADMIN) ────────────────────────────

// CreateUser — superadmin membuat user baru dengan role tertentu
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req model.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	user, err := h.svc.CreateUserByAdmin(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond(w, http.StatusCreated, user)
}

// DeleteUser — superadmin hapus user
func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	if err := h.svc.DeleteUser(r.Context(), idStr); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "user deleted"})
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

// MarkAllNotificationsRead — tandai semua notifikasi sebagai dibaca
func (h *Handler) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.MarkAllNotificationsRead(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]string{"message": "all notifications marked as read"})
}

// GetUnreadNotificationCount — jumlah notifikasi belum dibaca
func (h *Handler) GetUnreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	count, err := h.svc.GetUnreadNotificationCount(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, map[string]int{"unread": count})
}
