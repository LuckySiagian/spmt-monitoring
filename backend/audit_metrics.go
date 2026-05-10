package main

import (
	"context"
	"fmt"
	"log"
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

	// Audit 1: Metric Integrity (DNS + TLS + TTFB <= Total Response Time)
	fmt.Println("--- AUDIT 1: Metric Integrity Check ---")
	rows, err := conn.Query(context.Background(), `
		SELECT id, dns_latency_ms, tls_latency_ms, ttfb_latency_ms, response_time_ms
		FROM monitoring_logs
		WHERE dns_latency_ms IS NOT NULL AND tls_latency_ms IS NOT NULL 
		AND ttfb_latency_ms IS NOT NULL AND response_time_ms IS NOT NULL
		LIMIT 100
	`)
	if err != nil { log.Fatal(err) }
	defer rows.Close()

	anomalies := 0
	total := 0
	for rows.Next() {
		total++
		var id string
		var dns, tls, ttfb, totalRT int
		rows.Scan(&id, &dns, &tls, &ttfb, &totalRT)
		
		sum := dns + tls + ttfb
		if sum > totalRT + 5 { // Allow 5ms margin for system noise
			fmt.Printf("[ANOMALY] Log %s: DNS(%d) + TLS(%d) + TTFB(%d) = %dms > Total RT(%dms)\n", 
				id, dns, tls, ttfb, sum, totalRT)
			anomalies++
		}
	}
	fmt.Printf("Results: %d logs audited, %d anomalies found.\n\n", total, anomalies)

	// Audit 2: Fake/Null metrics for successful requests
	fmt.Println("--- AUDIT 2: Successful Request Metric Coverage ---")
	var missingCount int
	err = conn.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM monitoring_logs 
		WHERE status = 'ONLINE' AND (dns_latency_ms IS NULL OR tls_latency_ms IS NULL OR ttfb_latency_ms IS NULL)
	`).Scan(&missingCount)
	if err != nil { log.Fatal(err) }
	fmt.Printf("Online logs with missing observability: %d\n\n", missingCount)

	// Audit 3: Status Contradictions
	fmt.Println("--- AUDIT 3: Status Contradictions ---")
	var contradictionCount int
	err = conn.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM monitoring_logs 
		WHERE status = 'ONLINE' AND status_code >= 400
	`).Scan(&contradictionCount)
	if err != nil { log.Fatal(err) }
	fmt.Printf("ONLINE status with 4xx/5xx code: %d\n", contradictionCount)
}
