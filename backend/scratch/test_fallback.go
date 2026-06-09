package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"time"
)

func isPrivateIPAddress(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()
}

func lookupPublicDNS(ctx context.Context, host string) ([]string, error) {
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{
				Timeout: 3 * time.Second,
			}
			return d.DialContext(ctx, "udp", "8.8.8.8:53")
		},
	}
	return r.LookupHost(ctx, host)
}

func main() {
	host := "gen-c.pelindo.co.id"
	url := "https://gen-c.pelindo.co.id/login.aspx"

	fmt.Printf("1. Resolving %s via system resolver...\n", host)
	addrs, err := net.LookupHost(host)
	if err != nil {
		fmt.Printf("System DNS failed: %v\n", err)
	} else {
		fmt.Printf("System DNS resolved: %v\n", addrs)
	}

	targetIP := ""
	if len(addrs) > 0 {
		targetIP = addrs[0]
		if isPrivateIPAddress(targetIP) {
			fmt.Printf("IP %s is private. Testing reachability on port 443...\n", targetIP)
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(targetIP, "443"), 2*time.Second)
			if err != nil {
				fmt.Printf("Private IP unreachable: %v. Attempting public DNS fallback...\n", err)
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				publicAddrs, pubErr := lookupPublicDNS(ctx, host)
				cancel()
				if pubErr == nil && len(publicAddrs) > 0 {
					fmt.Printf("Public DNS resolved: %v\n", publicAddrs)
					targetIP = publicAddrs[0]
				} else {
					fmt.Printf("Public DNS fallback failed: %v\n", pubErr)
				}
			} else {
				conn.Close()
				fmt.Printf("Private IP is reachable. Using %s\n", targetIP)
			}
		}
	}

	fmt.Printf("2. Target IP selected: %s\n", targetIP)

	if targetIP == "" {
		fmt.Println("No target IP found.")
		return
	}

	// SSL test
	fmt.Printf("3. Testing SSL handshake directly to %s with SNI %s...\n", targetIP, host)
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(targetIP, "443"), &tls.Config{
		ServerName: host,
	})
	if err != nil {
		fmt.Printf("SSL handshake failed: %v\n", err)
	} else {
		fmt.Printf("SSL handshake successful! Subject: %s\n", conn.ConnectionState().PeerCertificates[0].Subject)
		conn.Close()
	}

	// HTTP Client test
	fmt.Printf("4. Testing HTTP GET request directly to %s via transport override...\n", targetIP)
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true, ServerName: host},
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			targetAddr := net.JoinHostPort(targetIP, port)
			d := &net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, network, targetAddr)
		},
	}
	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
	}

	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("HTTP Request failed: %v\n", err)
	} else {
		fmt.Printf("HTTP Request successful! Status: %d\n", resp.StatusCode)
		resp.Body.Close()
	}
}
