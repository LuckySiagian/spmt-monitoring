package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"time"

	"golang.org/x/net/http2"
)

func main() {
	jar, _ := cookiejar.New(nil)
	transport := &http.Transport{
		TLSClientConfig:   &tls.Config{InsecureSkipVerify: true, ServerName: "www.adobe.com"},
		ForceAttemptHTTP2: true,
		DisableKeepAlives: false,
		IdleConnTimeout:   10 * time.Second,
	}

	// Force enable HTTP/2 on the custom transport configuration
	err := http2.ConfigureTransport(transport)
	if err != nil {
		fmt.Printf("Error configuring http2: %v\n", err)
		return
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		Jar:     jar,
		Transport: transport,
	}

	req, _ := http.NewRequest("GET", "https://www.adobe.com", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")

	fmt.Println("Sending request using custom TLS + HTTP/2 transport to https://www.adobe.com...")
	start := time.Now()
	resp, err := client.Do(req)
	duration := time.Since(start)

	if err != nil {
		fmt.Printf("Error: %v (Took %v)\n", err, duration)
		return
	}
	defer resp.Body.Close()

	fmt.Printf("HTTP Status: %d\n", resp.StatusCode)
	fmt.Printf("Proto: %s\n", resp.Proto)
	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Body size: %d bytes\n", len(body))
}
