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
	ALTER TABLE websites 
	ADD COLUMN IF NOT EXISTS save_screenshot BOOLEAN DEFAULT TRUE;
	`

	_, err = conn.Exec(context.Background(), sql)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to apply migration: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migration applied successfully: added save_screenshot to websites table!")
}
