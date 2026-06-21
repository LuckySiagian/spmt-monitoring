package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spmt/monitoring/internal/config"
)

// Generic one-off migration runner.
//
//	go run cmd/migrate/main.go migrations/018_user_registration_approval.sql
//
// Defaults to the registration-approval migration when no path is given.
func main() {
	path := "migrations/018_user_registration_approval.sql"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBSSLMode,
	)
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer pool.Close()

	sqlBytes, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Failed to read %s: %v", path, err)
	}

	if _, err := pool.Exec(context.Background(), string(sqlBytes)); err != nil {
		log.Fatalf("Migration %s failed: %v", path, err)
	}
	log.Printf("✅ Migration applied: %s", path)
}
