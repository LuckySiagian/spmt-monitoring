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

	names := []string{"Peluit", "GEN-C"}

	for _, name := range names {
		fmt.Printf("\n=== LATEST LOG FOR %s ===\n", name)
		var status, errMsg, rootCause string
		err := conn.QueryRow(context.Background(), `
			SELECT l.status, COALESCE(l.error_message, ''), l.root_cause
			FROM monitoring_logs l
			JOIN websites w ON l.website_id = w.id
			WHERE w.name = $1
			ORDER BY l.checked_at DESC
			LIMIT 1
		`, name).Scan(&status, &errMsg, &rootCause)
		
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			continue
		}
		
		fmt.Printf("Status: %s\n", status)
		fmt.Printf("ErrorMessage: %s\n", errMsg)
		fmt.Printf("Root Cause JSON:\n%s\n", rootCause)
	}
}
