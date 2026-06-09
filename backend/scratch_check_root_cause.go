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

	rows, err := conn.Query(context.Background(), `
		SELECT status, recommendation, root_cause 
		FROM monitoring_logs 
		WHERE recommendation IS NOT NULL AND recommendation != '' 
		ORDER BY checked_at DESC LIMIT 5
	`)
	if err != nil {
		log.Fatalf("Query error: %v", err)
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		found = true
		var status, rec, rc string
		if err := rows.Scan(&status, &rec, &rc); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("--- Status: %s ---\n", status)
		fmt.Printf("Recommendation:\n%s\n", rec)
		fmt.Printf("Root Cause:\n%s\n", rc)
	}

	if !found {
		fmt.Println("No logs found with recommendation content.")
	}
}




