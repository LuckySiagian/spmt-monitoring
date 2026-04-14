package middleware

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements IP-based rate limiting for brute force protection
type RateLimiter struct {
	attempts map[string][]time.Time
	mu       sync.Mutex
	maxAttempts int
	window   time.Duration
}

// NewRateLimiter creates a new rate limiter
// maxAttempts: max requests allowed per window
// window: time window for rate limiting (e.g., 15 * time.Minute)
func NewRateLimiter(maxAttempts int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		attempts:    make(map[string][]time.Time),
		maxAttempts: maxAttempts,
		window:      window,
	}

	// Cleanup old entries every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()

	return rl
}

// Middleware returns a chi-compatible middleware function
func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := getClientIP(r)

			if !rl.Allow(ip) {
				http.Error(w, `{"error":"too many requests - please try again later"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Allow checks if the request should be allowed
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	attempts := rl.attempts[ip]

	// Remove old attempts outside the window
	validAttempts := []time.Time{}
	for _, t := range attempts {
		if now.Sub(t) < rl.window {
			validAttempts = append(validAttempts, t)
		}
	}

	if len(validAttempts) >= rl.maxAttempts {
		return false
	}

	validAttempts = append(validAttempts, now)
	rl.attempts[ip] = validAttempts
	return true
}

// cleanup removes old entries to prevent memory leaks
func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for ip, attempts := range rl.attempts {
		validAttempts := []time.Time{}
		for _, t := range attempts {
			if now.Sub(t) < rl.window {
				validAttempts = append(validAttempts, t)
			}
		}
		if len(validAttempts) == 0 {
			delete(rl.attempts, ip)
		} else {
			rl.attempts[ip] = validAttempts
		}
	}
}

// getClientIP extracts the client IP from the request
// Handles X-Forwarded-For and X-Real-IP headers for proxied requests
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (used by proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For can contain multiple IPs, get the first one
		ips := net.SplitHostPort(xff)
		if len(ips) > 0 {
			return ips[0]
		}
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fallback to remote address
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		fmt.Println("Error parsing IP:", err)
		return r.RemoteAddr
	}

	return ip
}
