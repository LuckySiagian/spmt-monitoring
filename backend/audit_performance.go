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

	fmt.Println("--- AUDIT: Cycle Drift & Throughput ---")
	
	// Check how many logs were generated in the last 60 seconds
	var count int
	err = conn.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM monitoring_logs 
		WHERE checked_at >= NOW() - INTERVAL '60 seconds'
	`).Scan(&count)
	if err != nil { log.Fatal(err) }
	
	fmt.Printf("Logs generated in last 60s: %d\n", count)
	fmt.Printf("Ideal throughput for 500 sites @ 30s: 1000 logs/60s\n")
	
	if count < 800 {
		fmt.Printf("[CRITICAL] Throughput is only %d/1000. System is falling behind!\n", count)
	} else {
		fmt.Printf("[OK] Throughput is %d/1000. Workers are keeping up.\n", count)
	}

	// Check max lag
	var maxLag float64
	err = conn.QueryRow(context.Background(), `
		WITH diffs AS (
			SELECT website_id, checked_at, 
			LAG(checked_at) OVER (PARTITION BY website_id ORDER BY checked_at ASC) as prev
			FROM monitoring_logs
			WHERE checked_at >= NOW() - INTERVAL '5 minutes'
		)
		SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (checked_at - prev))), 0)
		FROM diffs
		WHERE prev IS NOT NULL
	`).Scan(&maxLag)
	if err != nil { log.Fatal(err) }
	
	fmt.Printf("Maximum observed interval: %.2fs (Expected: 30.00s)\n", maxLag)
	if maxLag > 40 {
		fmt.Printf("[WARNING] High Cycle Drift detected! Operators will see stale data.\n")
	}
}
