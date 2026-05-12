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
	-- 1. Increase root_cause field size to TEXT
	ALTER TABLE monitoring_logs ALTER COLUMN root_cause TYPE TEXT;
	ALTER TABLE incident_root_causes ALTER COLUMN cause TYPE TEXT;

	-- 2. Update status CHECK constraint
	ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
	ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
	  CHECK (status IN (
		'ONLINE', 'WARNING', 'DEGRADED', 'CRITICAL', 'OFFLINE', 'UNKNOWN',
		'SERVER_DOWN', 'WEB_DOWN', 'DNS_ERROR', 'SSL_INVALID', 'SLOW'
	  ));
	`

	_, err = conn.Exec(context.Background(), sql)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to apply migration: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migration 008 applied successfully!")
}
