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
	ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS final_severity_reason TEXT;
	ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS resolver_stage TEXT;

	UPDATE monitoring_logs SET final_severity_reason = 'Legacy Log', resolver_stage = 'Initial' WHERE final_severity_reason IS NULL;
	`

	_, err = conn.Exec(context.Background(), sql)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to apply migration 009: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migration 009 applied successfully!")
}
