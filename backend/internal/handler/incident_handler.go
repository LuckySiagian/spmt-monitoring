package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/middleware"
	"github.com/spmt/monitoring/internal/model"
)

// ─── INCIDENTS ────────────────────────────────────────────────

func (h *Handler) GetIncidents(w http.ResponseWriter, r *http.Request) {
	incidents, err := h.svc.GetIncidents(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if incidents == nil {
		incidents = []*model.Incident{}
	}
	respond(w, http.StatusOK, incidents)
}

func (h *Handler) GetIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	inc, err := h.svc.GetIncidentByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "incident not found")
		return
	}
	respond(w, http.StatusOK, inc)
}

func (h *Handler) AcknowledgeIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	userID := middleware.GetUserID(r.Context())
	username := middleware.GetUsername(r.Context())

	err = h.svc.AcknowledgeIncident(r.Context(), id, userID, username)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "ACKNOWLEDGE_INCIDENT", idStr, "Acknowledged incident ID: "+idStr)
	respond(w, http.StatusOK, map[string]string{"message": "incident acknowledged"})
}

func (h *Handler) AssignIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	targetUserID, err := uuid.Parse(body.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid target user id")
		return
	}

	actorUserID := middleware.GetUserID(r.Context())
	actorUsername := middleware.GetUsername(r.Context())

	err = h.svc.AssignIncident(r.Context(), id, targetUserID, actorUserID, actorUsername)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "ASSIGN_INCIDENT", idStr, "Assigned incident ID: "+idStr+" to "+body.UserID)
	respond(w, http.StatusOK, map[string]string{"message": "incident assigned"})
}

func (h *Handler) ResolveIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	userID := middleware.GetUserID(r.Context())
	username := middleware.GetUsername(r.Context())

	err = h.svc.ResolveIncident(r.Context(), id, userID, username)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "RESOLVE_INCIDENT", idStr, "Resolved incident ID: "+idStr)
	respond(w, http.StatusOK, map[string]string{"message": "incident resolved"})
}

func (h *Handler) ReopenIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	userID := middleware.GetUserID(r.Context())
	username := middleware.GetUsername(r.Context())

	err = h.svc.ReopenIncident(r.Context(), id, userID, username)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "REOPEN_INCIDENT", idStr, "Reopened incident ID: "+idStr)
	respond(w, http.StatusOK, map[string]string{"message": "incident reopened"})
}

func (h *Handler) CloseIncident(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	userID := middleware.GetUserID(r.Context())
	username := middleware.GetUsername(r.Context())

	err = h.svc.CloseIncident(r.Context(), id, userID, username)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "CLOSE_INCIDENT", idStr, "Closed incident ID: "+idStr)
	respond(w, http.StatusOK, map[string]string{"message": "incident closed"})
}

// ─── COMMENTS ─────────────────────────────────────────────────

func (h *Handler) GetIncidentComments(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	comments, err := h.svc.GetIncidentComments(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if comments == nil {
		comments = []*model.IncidentComment{}
	}
	respond(w, http.StatusOK, comments)
}

func (h *Handler) AddIncidentComment(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	var body struct {
		Comment string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID := middleware.GetUserID(r.Context())
	username := middleware.GetUsername(r.Context())

	comment, err := h.svc.AddIncidentComment(r.Context(), id, userID, username, body.Comment)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respond(w, http.StatusCreated, comment)
}

func (h *Handler) GetIncidentHistory(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid incident id")
		return
	}

	hist, err := h.svc.GetIncidentHistory(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if hist == nil {
		hist = []*model.IncidentHistory{}
	}
	respond(w, http.StatusOK, hist)
}

// ─── MAINTENANCE WINDOWS ──────────────────────────────────────

func (h *Handler) GetMaintenanceWindows(w http.ResponseWriter, r *http.Request) {
	mws, err := h.svc.GetMaintenanceWindows(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if mws == nil {
		mws = []*model.MaintenanceWindow{}
	}
	respond(w, http.StatusOK, mws)
}

func (h *Handler) CreateMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WebsiteID   *string   `json:"website_id"`
		StartTime   time.Time `json:"start_time"`
		EndTime     time.Time `json:"end_time"`
		Description string    `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var websiteID *uuid.UUID
	if req.WebsiteID != nil && *req.WebsiteID != "" {
		parsed, err := uuid.Parse(*req.WebsiteID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid website id")
			return
		}
		websiteID = &parsed
	}

	userID := middleware.GetUserID(r.Context())

	mw := &model.MaintenanceWindow{
		WebsiteID:   websiteID,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		Description: req.Description,
		CreatedBy:   &userID,
	}

	created, err := h.svc.CreateMaintenanceWindow(r.Context(), mw)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeAuditLog(r, "CREATE_MAINTENANCE", created.ID.String(), "Created maintenance window starting "+req.StartTime.String())
	respond(w, http.StatusCreated, created)
}

func (h *Handler) DeleteMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid maintenance window id")
		return
	}

	err = h.svc.DeleteMaintenanceWindow(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeAuditLog(r, "DELETE_MAINTENANCE", idStr, "Deleted maintenance window ID: "+idStr)
	respond(w, http.StatusOK, map[string]string{"message": "maintenance window deleted"})
}
