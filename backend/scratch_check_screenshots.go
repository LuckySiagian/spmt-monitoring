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

	var count int
	err = conn.QueryRow(context.Background(), `
		SELECT COUNT(*) 
		FROM monitoring_logs 
		WHERE checked_at >= NOW() - INTERVAL '5 minutes'
		  AND root_cause LIKE '%"screenshot": "%'
		  AND root_cause NOT LIKE '%"screenshot": ""%'
	`).Scan(&count)

	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		return
	}

	fmt.Printf("Number of screenshots successfully captured in the last 5 minutes: %d\n", count)
}
