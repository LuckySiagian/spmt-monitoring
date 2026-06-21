package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
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

	// Throughput sampling (live download/upload rate)
	rxMbps       float64
	txMbps       float64
	lastRxBytes  uint64
	lastTxBytes  uint64
	lastSampleAt time.Time
}

func NewNetworkService(hub *ws.Hub, onChanged func()) *NetworkService {
	return &NetworkService{
		hub:       hub,
		onChanged: onChanged,
	}
}

func (s *NetworkService) Start(ctx context.Context) {
	log.Printf("[Network] Starting environment monitoring")
	s.updateContext()    // Initial check
	s.sampleThroughput() // Prime throughput counters

	// Throughput is sampled on a faster cadence than the context probe so the
	// "current network speed" readout feels live.
	go s.throughputLoop(ctx)

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

func (s *NetworkService) throughputLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sampleThroughput()
		}
	}
}

func (s *NetworkService) GetCurrentContext() model.NetworkContext {
	s.mu.Lock()
	defer s.mu.Unlock()
	ctx := s.currentCtx
	ctx.RxMbps = s.rxMbps
	ctx.TxMbps = s.txMbps
	return ctx
}

func (s *NetworkService) updateContext() {
	newCtx := s.probeNetwork()
	
	s.mu.Lock()
	changed := s.isChanged(s.currentCtx, newCtx)
	if changed {
		log.Printf("[Network] CONTEXT CHANGED: %s (%s) -> %s (%s)", s.currentCtx.NetworkType, s.currentCtx.ConnectionName, newCtx.NetworkType, newCtx.ConnectionName)
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
		   old.DNSResolver != new.DNSResolver ||
		   old.ConnectionName != new.ConnectionName ||
		   old.InterfaceAlias != new.InterfaceAlias
}

func (s *NetworkService) probeNetwork() model.NetworkContext {
	ctx := model.NetworkContext{
		UpdatedAt: time.Now(),
	}

	// 1. Public IP & ASN/Provider
	// Bounded client: the default http.Get has NO timeout, so on a slow/dropped
	// uplink this call could hang the network-probe loop indefinitely.
	ipClient := &http.Client{Timeout: 5 * time.Second}
	resp, err := ipClient.Get("http://ip-api.com/json")
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

	// 4. Connection profile info (Windows specific)
	var interfaceAlias, connectionName string
	if runtime.GOOS == "windows" {
		interfaceAlias, connectionName = s.getWindowsConnectionProfile()
	}

	ctx.InterfaceAlias = interfaceAlias
	ctx.ConnectionName = connectionName

	// 5. Link speed of the active adapter (Windows specific)
	if runtime.GOOS == "windows" {
		ctx.LinkSpeed = s.getWindowsLinkSpeed(interfaceAlias)
	}

	// 6. Network Type Logic
	ctx.NetworkType = "UNKNOWN"
	if interfaceAlias != "" {
		ctx.NetworkType = interfaceAlias
	} else {
		prov := strings.ToLower(ctx.Provider)
		if strings.Contains(prov, "pelindo") || strings.Contains(prov, "telkom") && ctx.LocalGateway != "" {
			ctx.NetworkType = "OFFICE"
		} else if strings.Contains(prov, "mobile") || strings.Contains(prov, "hotspot") {
			ctx.NetworkType = "PUBLIC"
		} else if ctx.PublicIP != "" {
			ctx.NetworkType = "PUBLIC"
		}

		if strings.Contains(ctx.ASN, "AS136502") {
			ctx.NetworkType = "OFFICE"
		}
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

func (s *NetworkService) getWindowsConnectionProfile() (string, string) {
	out, err := exec.Command("powershell", "-Command", "(Get-NetConnectionProfile | Select-Object -First 1) | ForEach-Object { $_.InterfaceAlias + '|' + $_.Name }").Output()
	if err != nil {
		return "", ""
	}
	parts := strings.Split(strings.TrimSpace(string(out)), "|")
	if len(parts) >= 2 {
		return parts[0], parts[1]
	} else if len(parts) == 1 && parts[0] != "" {
		return parts[0], parts[0]
	}
	return "", ""
}

// getWindowsLinkSpeed returns the negotiated link rate of the active network
// adapter (e.g. "144 Mbps" for Wi-Fi, "1 Gbps" for Ethernet). It queries the
// adapter that backs the current connection profile. Falls back to the first
// adapter that is Up if the alias lookup fails.
func (s *NetworkService) getWindowsLinkSpeed(alias string) string {
	var psCmd string
	if alias != "" {
		safeAlias := strings.ReplaceAll(alias, "'", "''")
		psCmd = fmt.Sprintf("(Get-NetAdapter -Name '%s' -ErrorAction SilentlyContinue | Select-Object -First 1).LinkSpeed", safeAlias)
	} else {
		psCmd = "(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).LinkSpeed"
	}

	out, err := exec.Command("powershell", "-Command", psCmd).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// sampleThroughput reads the cumulative byte counters of the active adapter and
// derives the live download/upload rate (Mbps) from the delta since the last
// sample. Counter resets (adapter change, reconnect) are treated as zero.
func (s *NetworkService) sampleThroughput() {
	s.mu.Lock()
	alias := s.currentCtx.InterfaceAlias
	s.mu.Unlock()

	rx, tx, ok := s.getAdapterBytes(alias)
	if !ok {
		return
	}
	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.lastSampleAt.IsZero() {
		dt := now.Sub(s.lastSampleAt).Seconds()
		if dt > 0 {
			if rx >= s.lastRxBytes && tx >= s.lastTxBytes {
				s.rxMbps = float64(rx-s.lastRxBytes) * 8 / dt / 1e6
				s.txMbps = float64(tx-s.lastTxBytes) * 8 / dt / 1e6
			} else {
				// Counter went backwards (reset/wraparound) — skip this delta.
				s.rxMbps = 0
				s.txMbps = 0
			}
		}
	}

	s.lastRxBytes = rx
	s.lastTxBytes = tx
	s.lastSampleAt = now
}

// getAdapterBytes returns the cumulative received/sent byte counters for the
// given interface alias. When the alias is empty it aggregates over all active
// adapters. Returns ok=false if the counters could not be read.
func (s *NetworkService) getAdapterBytes(alias string) (uint64, uint64, bool) {
	if runtime.GOOS != "windows" {
		return 0, 0, false
	}

	var psCmd string
	if alias != "" {
		safeAlias := strings.ReplaceAll(alias, "'", "''")
		psCmd = fmt.Sprintf("$s = Get-NetAdapterStatistics -Name '%s' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($s) { \"$($s.ReceivedBytes)|$($s.SentBytes)\" }", safeAlias)
	} else {
		psCmd = "$a = Get-NetAdapterStatistics -ErrorAction SilentlyContinue; $rx = ($a | Measure-Object -Property ReceivedBytes -Sum).Sum; $tx = ($a | Measure-Object -Property SentBytes -Sum).Sum; \"$rx|$tx\""
	}

	out, err := exec.Command("powershell", "-Command", psCmd).Output()
	if err != nil {
		return 0, 0, false
	}
	parts := strings.Split(strings.TrimSpace(string(out)), "|")
	if len(parts) != 2 {
		return 0, 0, false
	}
	rx, err1 := strconv.ParseUint(strings.TrimSpace(parts[0]), 10, 64)
	tx, err2 := strconv.ParseUint(strings.TrimSpace(parts[1]), 10, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return rx, tx, true
}
