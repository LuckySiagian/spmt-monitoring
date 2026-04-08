package main

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"time"
)

func testURL(urlStr string) {
	fmt.Printf("\n--- Testing URL: %s ---\n", urlStr)
	client := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			fmt.Printf("   -> Redirect #%d to: %s\n", len(via), req.URL.String())
			if len(via) >= 15 {
				return fmt.Errorf("too many redirects")
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
			return nil
		},
	}

	req, _ := http.NewRequest("GET", urlStr, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")

	start := time.Now()
	resp, err := client.Do(req)
	duration := time.Since(start)

	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		return
	}
	defer resp.Body.Close()

	fmt.Printf("✅ SUCCESS! Status: %s\n", resp.Status)
	fmt.Printf("⏱️  Response Time: %v\n", duration)
	fmt.Printf("📍 Final URL: %s\n", resp.Request.URL.String())
    
    if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
        cert := resp.TLS.PeerCertificates[0]
        fmt.Printf("🔐 SSL Info: Subject=%s, Expiry=%v\n", cert.Subject.CommonName, cert.NotAfter)
    }
}

func main() {
	testURL("https://google.com")
	testURL("https://ibs.pelindo.co.id/Landing/Landing?ReturnUrl=%2F")
}
