package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

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
		SELECT l.checked_at, w.name, l.status, l.ip_address, COALESCE(l.error_message, ''), l.root_cause
		FROM monitoring_logs l
		JOIN websites w ON l.website_id = w.id
		ORDER BY l.checked_at DESC
		LIMIT 20
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Latest 20 logs in database:")
	for rows.Next() {
		var checkedAt time.Time
		var name, status, ipAddress, errMsg, rootCause string
		if err := rows.Scan(&checkedAt, &name, &status, &ipAddress, &errMsg, &rootCause); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("- %s | %s | %s | IP: %s | Err: %s | RC: %s\n", checkedAt.Format("2006-01-02 15:04:05"), name, status, ipAddress, errMsg, rootCause)
	}
}
