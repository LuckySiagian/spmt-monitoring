package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	connStr := "postgres://postgres:lucky@localhost:5432/monitoring_db?sslmode=disable"
	conn, err := pgx.Connect(context.Background(), connStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	sql := `
	ALTER TABLE monitoring_logs 
	ADD COLUMN IF NOT EXISTS tls_latency_ms INTEGER,
	ADD COLUMN IF NOT EXISTS ttfb_latency_ms INTEGER,
	ADD COLUMN IF NOT EXISTS recommendation TEXT,
	ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100,
	ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 100,
	ADD COLUMN IF NOT EXISTS is_browser_ok BOOLEAN DEFAULT TRUE;
	`

	_, err = conn.Exec(context.Background(), sql)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to apply migration: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migration applied successfully!")
}
