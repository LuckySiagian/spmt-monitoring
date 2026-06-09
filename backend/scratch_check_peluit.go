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

	var rootCause string
	var status string
	err = conn.QueryRow(context.Background(), `
		SELECT status, root_cause 
		FROM monitoring_logs 
		WHERE website_id = 'dd964b5d-5c5b-42b9-99cb-ffdf9f41533a' 
		ORDER BY checked_at DESC 
		LIMIT 1
	`).Scan(&status, &rootCause)

	if err != nil {
		log.Fatalf("Query error: %v", err)
	}

	fmt.Printf("Status: %s\n", status)
	fmt.Printf("Root Cause Evidence: %s\n", rootCause)
}
