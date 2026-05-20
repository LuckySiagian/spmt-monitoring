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

	// Find the website ID for Reddit
	var websiteID string
	var websiteName string
	var url string
	err = conn.QueryRow(context.Background(), "SELECT id, name, url FROM websites WHERE url LIKE '%reddit.com%' LIMIT 1").Scan(&websiteID, &websiteName, &url)
	if err != nil {
		if err == pgx.ErrNoRows {
			fmt.Println("No website found matching reddit.com")
			return
		}
		log.Fatal(err)
	}

	fmt.Printf("Found Website: %s (%s) ID: %s\n\n", websiteName, url, websiteID)

	// Get latest 5 logs
	rows, err := conn.Query(context.Background(), `
		SELECT checked_at, status, status_code, response_time_ms, dns_resolved, tcp_port_open, ssl_valid, ip_address, error_message, root_cause, final_decision_source, resolver_stage 
		FROM monitoring_logs 
		WHERE website_id = $1 
		ORDER BY checked_at DESC 
		LIMIT 5`, websiteID)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Latest 5 Logs:")
	for rows.Next() {
		var checkedAt interface{}
		var status string
		var statusCode *int
		var responseTime *int
		var dnsResolved bool
		var tcpPortOpen bool
		var sslValid *bool
		var ipAddress *string
		var errorMsg *string
		var rootCause *string
		var decisionSource *string
		var stage *string

		err := rows.Scan(&checkedAt, &status, &statusCode, &responseTime, &dnsResolved, &tcpPortOpen, &sslValid, &ipAddress, &errorMsg, &rootCause, &decisionSource, &stage)
		if err != nil {
			log.Fatal(err)
		}

		fmt.Printf("Time: %v\n", checkedAt)
		fmt.Printf("  Status: %s\n", status)
		if statusCode != nil {
			fmt.Printf("  StatusCode: %d\n", *statusCode)
		} else {
			fmt.Printf("  StatusCode: nil\n")
		}
		if responseTime != nil {
			fmt.Printf("  ResponseTime: %dms\n", *responseTime)
		}
		fmt.Printf("  DNSResolved: %t, TCPPortOpen: %t\n", dnsResolved, tcpPortOpen)
		if sslValid != nil {
			fmt.Printf("  SSLValid: %t\n", *sslValid)
		} else {
			fmt.Printf("  SSLValid: nil\n")
		}
		if ipAddress != nil {
			fmt.Printf("  IPAddress: %s\n", *ipAddress)
		}
		if errorMsg != nil {
			fmt.Printf("  ErrorMsg: %s\n", *errorMsg)
		}
		if rootCause != nil {
			fmt.Printf("  RootCause: %s\n", *rootCause)
		}
		if decisionSource != nil {
			fmt.Printf("  DecisionSource: %s\n", *decisionSource)
		}
		if stage != nil {
			fmt.Printf("  ResolverStage: %s\n", *stage)
		}
		fmt.Println("-------------------------------------------")
	}
}
