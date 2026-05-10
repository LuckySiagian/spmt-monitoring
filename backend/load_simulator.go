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

	fmt.Println("--- STRESS TEST: Simulating 500 Websites ---")
	
	// Create a dummy website
	for i := 1; i <= 500; i++ {
		name := fmt.Sprintf("StressTest-%d", i)
		url := "https://httpbin.org/delay/1" // Intentionally slow (1s delay)
		_, err = conn.Exec(context.Background(), `
			INSERT INTO websites (id, name, url, description, interval_seconds, created_at)
			VALUES (uuid_generate_v4(), $1, $2, 'Load test site', 30, NOW())
			ON CONFLICT DO NOTHING
		`, name, url)
		if err != nil { log.Fatal(err) }
		if i%100 == 0 { fmt.Printf("Inserted %d sites...\n", i) }
	}

	fmt.Println("500 sites inserted. Monitoring engine will now be stressed.")
	fmt.Println("Audit the logs in 2 minutes to see 'Cycle Drift'.")
}
