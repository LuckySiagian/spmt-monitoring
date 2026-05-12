package service

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/spmt/monitoring/internal/model"
	ws "github.com/spmt/monitoring/internal/websocket"
)

type NetworkService struct {
	hub        *ws.Hub
	currentCtx model.NetworkContext
	mu         sync.Mutex
	onChanged  func()
}

func NewNetworkService(hub *ws.Hub, onChanged func()) *NetworkService {
	return &NetworkService{
		hub:       hub,
		onChanged: onChanged,
	}
}

func (s *NetworkService) Start(ctx context.Context) {
	log.Printf("[Network] Starting environment monitoring")
	s.updateContext() // Initial check

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.updateContext()
		}
	}
}

func (s *NetworkService) GetCurrentContext() model.NetworkContext {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.currentCtx
}

func (s *NetworkService) updateContext() {
	newCtx := s.probeNetwork()
	
	s.mu.Lock()
	changed := s.isChanged(s.currentCtx, newCtx)
	if changed {
		log.Printf("[Network] CONTEXT CHANGED: %s -> %s", s.currentCtx.NetworkType, newCtx.NetworkType)
		s.currentCtx = newCtx
		s.mu.Unlock()
		
		// Broadcast to UI
		s.hub.Broadcast("network_context_changed", model.WSNetworkContextUpdate{
			Type:    "network_context_changed",
			Context: newCtx,
		})

		if s.onChanged != nil {
			s.onChanged()
		}
	} else {
		s.currentCtx = newCtx
		s.mu.Unlock()
	}
}

func (s *NetworkService) isChanged(old, new model.NetworkContext) bool {
	if old.PublicIP == "" { return false } // First run
	return old.PublicIP != new.PublicIP || 
		   old.LocalGateway != new.LocalGateway || 
		   old.DNSResolver != new.DNSResolver
}

func (s *NetworkService) probeNetwork() model.NetworkContext {
	ctx := model.NetworkContext{
		UpdatedAt: time.Now(),
	}

	// 1. Public IP & ASN/Provider
	resp, err := http.Get("http://ip-api.com/json")
	if err == nil {
		defer resp.Body.Close()
		var data struct {
			Query string `json:"query"`
			Isp   string `json:"isp"`
			As    string `json:"as"`
			Org   string `json:"org"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
			ctx.PublicIP = data.Query
			ctx.Provider = data.Isp
			ctx.ASN = data.As
		}
	}

	// 2. Local Gateway (Windows specific)
	ctx.LocalGateway = s.getWindowsGateway()

	// 3. DNS Resolver
	ctx.DNSResolver = s.getDNSResolver()

	// 4. Network Type Logic
	ctx.NetworkType = "UNKNOWN"
	
	prov := strings.ToLower(ctx.Provider)
	if strings.Contains(prov, "pelindo") || strings.Contains(prov, "telkom") && ctx.LocalGateway != "" {
		// Example heuristic: if provider is company ISP or specific gateway pattern
		ctx.NetworkType = "OFFICE"
	} else if strings.Contains(prov, "mobile") || strings.Contains(prov, "hotspot") {
		ctx.NetworkType = "PUBLIC"
	} else if ctx.PublicIP != "" {
		// Check for VPN signatures (usually via local interface names which we'd need more OS calls for)
		// For now, if we have public IP but it's not the usual ones
		ctx.NetworkType = "PUBLIC"
	}

	// Heuristic for Pelindo (Office)
	// If Local Gateway is in a specific range or ASN matches
	if strings.Contains(ctx.ASN, "AS136502") { // Pelindo ASN example
		ctx.NetworkType = "OFFICE"
	}

	return ctx
}

func (s *NetworkService) getWindowsGateway() string {
	out, err := exec.Command("route", "print", "0.0.0.0").Output()
	if err != nil {
		return ""
	}
	// Look for the line: 0.0.0.0 0.0.0.0 [Gateway] [Interface] [Metric]
	re := regexp.MustCompile(`0\.0\.0\.0\s+0\.0\.0\.0\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)`)
	matches := re.FindStringSubmatch(string(out))
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

func (s *NetworkService) getDNSResolver() string {
	// Quick way to get current DNS on Windows
	out, err := exec.Command("powershell", "-Command", "(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses -join ','").Output()
	if err == nil {
		return strings.TrimSpace(string(out))
	}
	return "8.8.8.8" // Fallback
}
