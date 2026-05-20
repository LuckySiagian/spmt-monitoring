package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spmt/monitoring/internal/config"
)

func main() {
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

	sqlBytes, err := os.ReadFile("migrations/011_expanded_statuses.sql")
	if err != nil {
		log.Fatalf("Failed to read sql: %v", err)
	}

	_, err = pool.Exec(context.Background(), string(sqlBytes))
	if err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
	log.Println("Migration 011 successful")
}
