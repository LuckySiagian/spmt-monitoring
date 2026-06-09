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

	var name, url string
	var saveScreenshot bool
	err = conn.QueryRow(context.Background(), `
		SELECT name, url, save_screenshot
		FROM websites
		WHERE name = 'GEN-C'
	`).Scan(&name, &url, &saveScreenshot)
	
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	
	fmt.Printf("Website Name: %s\n", name)
	fmt.Printf("URL: %s\n", url)
	fmt.Printf("Save Screenshot: %t\n", saveScreenshot)
}
