package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spmt/monitoring/internal/config"
	"github.com/spmt/monitoring/internal/handler"
	"github.com/spmt/monitoring/internal/middleware"
	"github.com/spmt/monitoring/internal/model"
	"github.com/spmt/monitoring/internal/repository"
	"github.com/spmt/monitoring/internal/service"
	ws "github.com/spmt/monitoring/internal/websocket"
	"github.com/spmt/monitoring/internal/worker"
)

func main() {
	// ─── Config ───────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// ─── Database ─────────────────────────────────────────────
	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBSSLMode,
	)
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("Database ping failed: %v", err)
	}
	log.Println("✅ Connected to PostgreSQL")

	// ─── Layers ───────────────────────────────────────────────
	repo := repository.New(pool)
	svc := service.New(repo, cfg.JWTSecret, cfg.JWTExpiryHours)
	hub := ws.NewHub()
	workerPool := worker.NewPool(repo, hub, 10)

	// ─── Start services ───────────────────────────────────────
	go hub.Run()
	workerPool.Start()
	log.Println("✅ Worker pool started")

	// ─── Router ───────────────────────────────────────────────
	h := handler.New(svc, workerPool, hub)

	r := chi.NewRouter()
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc:  func(r *http.Request, origin string) bool { return true },
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth routes (public)
	r.Post("/auth/login", h.Login)
	r.Post("/auth/register", h.Register)

	// Public Status Route
	r.Get("/public/websites", h.GetPublicWebsites)

	// WebSocket (public - auth via query param or handled client-side)
	r.Get("/ws", h.ServeWS)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))

		// Dashboard (all authenticated users)
		r.Get("/dashboard/summary", h.GetDashboardSummary)
		r.Get("/dashboard/history", h.GetStatusHistory)
		r.Get("/websites/{id}/logs", h.GetWebsiteLogs)
		r.Get("/websites/{id}/events", h.GetWebsiteEvents)
		r.Get("/dashboard/events", h.GetAllStatusEvents)
		r.Get("/websites", h.GetWebsites)

		// Website management (admin + superadmin)
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireRole(model.RoleAdmin, model.RoleSuperAdmin))
			r.Post("/websites", h.CreateWebsite)
			r.Put("/websites/{id}", h.UpdateWebsite)
			r.Delete("/websites/{id}", h.DeleteWebsite)
		})

		// Notifications (all authenticated users)
		r.Get("/notifications/unread-count", h.GetUnreadNotificationCount)
		r.Post("/notifications/mark-all-read", h.MarkAllNotificationsRead)

		// User management (superadmin only)
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireRole(model.RoleSuperAdmin))
			r.Get("/users", h.GetUsers)
			r.Post("/users/promote", h.PromoteUser)
			r.Post("/users/demote", h.DemoteUser)
			r.Post("/users/create", h.CreateUser)
			r.Delete("/users/{id}", h.DeleteUser)
		})
	})

	// ─── Server ───────────────────────────────────────────────
	srv := &http.Server{
		Addr:         "0.0.0.0:" + cfg.ServerPort,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("🚀 SPMT Monitoring Server running on :%s", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// ─── Graceful shutdown ────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	workerPool.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	log.Println("Server stopped.")
}
