package main

import (
	"context"
	"encoding/json"
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

	rows, err := conn.Query(context.Background(), `
		SELECT l.checked_at, l.status, COALESCE(l.error_message, ''), l.root_cause
		FROM monitoring_logs l
		JOIN websites w ON l.website_id = w.id
		WHERE w.name = 'GEN-C'
		ORDER BY l.checked_at DESC
		LIMIT 10
	`)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var checkedAt interface{}
		var status, errMsg, rootCause string
		err = rows.Scan(&checkedAt, &status, &errMsg, &rootCause)
		if err != nil {
			fmt.Printf("Scan error: %v\n", err)
			return
		}

		var data map[string]interface{}
		_ = json.Unmarshal([]byte(rootCause), &data)

		fmt.Printf("\n--- CHECKED AT: %v ---\n", checkedAt)
		fmt.Printf("Status: %s\n", status)
		fmt.Printf("Error Message: %s\n", errMsg)
		fmt.Printf("TCP Connected: %v\n", data["tcp_connected"])
		fmt.Printf("Chrome Success: %v\n", data["chrome_success"])
		fmt.Printf("Page Title: %v\n", data["page_title"])
		scStr, _ := data["screenshot"].(string)
		fmt.Printf("Screenshot length: %d\n", len(scStr))
	}
}
