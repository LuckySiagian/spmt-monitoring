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
	-- 1. Rename column if it exists as is_browser_ok
	DO $$ 
	BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='is_browser_ok') THEN
			ALTER TABLE monitoring_logs RENAME COLUMN is_browser_ok TO is_browser_accessible;
		END IF;
	END $$;

	-- 2. Drop existing constraints that might interfere
	ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;

	-- 3. Cleanup data to follow 3-status model
	UPDATE monitoring_logs SET status = 'CRITICAL' WHERE status IN ('WARNING', 'DEGRADED');
	UPDATE monitoring_logs SET status = 'OFFLINE' WHERE status = 'UNKNOWN';
	
	-- Cleanup any other legacy statuses if they exist
	UPDATE monitoring_logs SET status = 'OFFLINE' WHERE status NOT IN ('ONLINE', 'CRITICAL', 'OFFLINE');

	-- 4. Apply final strict 3-status constraint
	ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
	  CHECK (status IN ('ONLINE', 'CRITICAL', 'OFFLINE'));
	`

	_, err = conn.Exec(context.Background(), sql)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to apply migration 010: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migration 010 (Stabilization) applied successfully!")
}
