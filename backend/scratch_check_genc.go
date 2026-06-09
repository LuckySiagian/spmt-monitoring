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

	var status, errMsg, rootCause string
	err = conn.QueryRow(context.Background(), `
		SELECT l.status, COALESCE(l.error_message, ''), l.root_cause
		FROM monitoring_logs l
		JOIN websites w ON l.website_id = w.id
		WHERE w.name = 'GEN-C'
		ORDER BY l.checked_at DESC
		LIMIT 1
	`).Scan(&status, &errMsg, &rootCause)
	
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(rootCause), &data); err != nil {
		fmt.Printf("Error parsing JSON: %v\n", err)
		return
	}
	
	fmt.Printf("Website: GEN-C\n")
	fmt.Printf("Status: %s\n", status)
	fmt.Printf("Error Message: %s\n", errMsg)
	fmt.Printf("IP Address: %v\n", data["ip_address"])
	fmt.Printf("IP Classification: %v\n", data["ip_classification"])
	fmt.Printf("TCP Connected: %v\n", data["tcp_connected"])
	fmt.Printf("TCP Latency: %v\n", data["tcp_latency_ms"])
	fmt.Printf("TLS Handshake OK: %v\n", data["tls_handshake_ok"])
	fmt.Printf("TLS Error: %v\n", data["tls_error"])
	fmt.Printf("HTTP Status Code: %v\n", data["http_status_code"])
	fmt.Printf("HTTP Error: %v\n", data["http_error"])
	fmt.Printf("Is Migrated: %v\n", data["is_migrated"])
	fmt.Printf("Migration Hint: %v\n", data["migration_hint"])
	fmt.Printf("Page Title: %v\n", data["page_title"])
	fmt.Printf("Page Text Preview: %v\n", data["page_text_preview"])
	fmt.Printf("WAF Detected: %v\n", data["waf_detected"])
	scStr, _ := data["screenshot"].(string)
	fmt.Printf("Screenshot Length: %d\n", len(scStr))
}
