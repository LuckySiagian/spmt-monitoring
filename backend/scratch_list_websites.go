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

	rows, err := conn.Query(context.Background(), "SELECT id, name, url FROM websites")
	if err != nil {
		log.Fatalf("Query error: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var name, url string
		if err := rows.Scan(&id, &name, &url); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("ID: %s | Name: %s | URL: %s\n", id, name, url)
	}
}
