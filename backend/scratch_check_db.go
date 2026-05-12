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

	rows, err := conn.Query(context.Background(), "SELECT status, COUNT(*) FROM monitoring_logs GROUP BY status")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Status distribution in monitoring_logs:")
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("- %s: %d\n", status, count)
	}
}
