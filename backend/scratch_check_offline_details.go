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

	names := []string{"Peluit", "piket direksi spmt", "Reddit", "TikTiok"}

	for _, name := range names {
		fmt.Printf("\n=== Details for Website: %s ===\n", name)
		var url, status, errMsg, rootCause string
		err := conn.QueryRow(context.Background(), `
			SELECT w.url, l.status, COALESCE(l.error_message, ''), l.root_cause
			FROM monitoring_logs l
			JOIN websites w ON l.website_id = w.id
			WHERE w.name = $1
			ORDER BY l.checked_at DESC
			LIMIT 1
		`, name).Scan(&url, &status, &errMsg, &rootCause)
		
		if err != nil {
			fmt.Printf("Error or no logs found: %v\n", err)
			continue
		}
		
		fmt.Printf("URL: %s\nStatus: %s\nError Message: %s\nRoot Cause JSON:\n%s\n", url, status, errMsg, rootCause)
	}
}
