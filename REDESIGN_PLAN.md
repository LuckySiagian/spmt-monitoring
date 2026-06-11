# 📋 REDESIGN PLAN - SPMT Engine Simplification

## Target: 4 Core Parameters Only
1. **HTTP Status Code** (200, 404, 500, timeout, etc)
2. **ICMP Ping Status** (reachable/not reachable)
3. **DNS Resolution** (resolved/failed)
4. **Last Checked Time** (when the check was performed)

---

## Current vs New Architecture

### BEFORE (Complex - 25+ fields):
```
MonitoringLog {
  dns_resolved, dns_latency_ms, tcp_port_open, icmp_status, icmp_latency_ms,
  tls_latency_ms, ttfb_latency_ms, status_code, response_time_ms, ssl_valid,
  ssl_expiry_date, ip_address, error_message, status, root_cause,
  recommendation, health_score, confidence, is_browser_accessible,
  final_reason, final_decision_source, resolver_stage
}
```

### AFTER (Simple - 4 fields):
```
MonitoringLog {
  checked_at: time.Time,        // Last checked time
  http_status_code: *int,       // HTTP status code (or null if error)
  icmp_status: bool,            // Ping reachable?
  dns_resolved: bool            // DNS OK?
}
```

---

## Changes Required

### 1. Database Schema
```sql
-- Old table (keep for history)
ALTER TABLE monitoring_logs RENAME TO monitoring_logs_legacy;

-- New simplified table
CREATE TABLE monitoring_logs (
  id UUID PRIMARY KEY,
  website_id UUID NOT NULL REFERENCES websites(id),
  checked_at TIMESTAMP NOT NULL,
  
  dns_resolved BOOLEAN NOT NULL,
  icmp_status BOOLEAN NOT NULL,
  http_status_code INTEGER,           -- NULL if error
  http_error_message TEXT,            -- Only store error message if any
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_monitoring_logs_website_checked 
ON monitoring_logs(website_id, checked_at DESC);
```

### 2. Model Structure (Go)
```go
type MonitoringLog struct {
  ID                uuid.UUID  
  WebsiteID         uuid.UUID  
  CheckedAt         time.Time  
  
  DNSResolved       bool       // DNS OK?
  ICMPStatus        bool       // Ping OK?
  HTTPStatusCode    *int       // HTTP status code (200, 404, 500, etc)
  HTTPErrorMessage  *string    // Error if HTTP failed
}

type WebsiteStatus struct {
  WebsiteID         uuid.UUID
  WebsiteName       string
  URL               string
  
  LastCheckedAt     time.Time
  DNSResolved       bool
  ICMPStatus        bool
  HTTPStatusCode    *int
  HTTPErrorMessage  *string
  
  IsOnline          bool       // Computed: DNS OK && ICMP OK && HTTP 2xx
}
```

### 3. Engine Probe Flow (Simplified)

```
Worker Job:
├─ 1. DNS Lookup
│  ├─ Resolve hostname
│  └─ Set dns_resolved = true/false
│
├─ 2. ICMP Ping
│  ├─ Send ping to hostname
│  └─ Set icmp_status = true/false
│
├─ 3. HTTP GET Request
│  ├─ If DNS failed: skip HTTP
│  └─ Capture HTTP status code (or error)
│
└─ 4. Save & Broadcast
   ├─ Insert to DB
   └─ Send WebSocket update
```

### 4. WebSocket Events (Simplified)

**monitor_update (every check):**
```json
{
  "type": "monitor_update",
  "website_id": "uuid",
  "website_name": "Google",
  "url": "https://www.google.com",
  "last_checked": "2025-06-10T10:30:45Z",
  "dns_resolved": true,
  "icmp_status": true,
  "http_status_code": 200,
  "http_error": null,
  "is_online": true
}
```

**status_change (when status changes):**
```json
{
  "type": "status_change",
  "website": "Google",
  "website_id": "uuid",
  "url": "https://www.google.com",
  "old_status": "ONLINE",
  "new_status": "OFFLINE",
  "last_checked": "2025-06-10T10:31:15Z",
  "reason": "DNS resolution failed"
}
```

### 5. API Response (Simplified)

**GET /api/websites**
```json
[
  {
    "id": "uuid",
    "name": "Google",
    "url": "https://www.google.com",
    "interval_seconds": 30,
    "last_checked": "2025-06-10T10:30:45Z",
    "dns_resolved": true,
    "icmp_status": true,
    "http_status_code": 200,
    "http_error": null,
    "is_online": true
  }
]
```

**GET /api/websites/{id}/logs** (last 100 records)
```json
[
  {
    "checked_at": "2025-06-10T10:30:45Z",
    "dns_resolved": true,
    "icmp_status": true,
    "http_status_code": 200,
    "http_error": null
  }
]
```

### 6. Dashboard Summary (Simplified)

```json
{
  "total_websites": 50,
  "online_count": 48,
  "offline_count": 2,
  "last_updated": "2025-06-10T10:45:30Z",
  "recent_changes": [
    {
      "website": "GitHub",
      "old_is_online": true,
      "new_is_online": false,
      "reason": "DNS resolution failed",
      "timestamp": "2025-06-10T10:35:20Z"
    }
  ]
}
```

---

## Implementation Order

1. ✅ Update MonitoringLog model
2. ✅ Update Website model (add computed fields)
3. ✅ Update database queries
4. ✅ Simplify prober logic (DNS, ICMP, HTTP only)
5. ✅ Update repository layer
6. ✅ Update handler/API layer
7. ✅ Update WebSocket events
8. ✅ Update frontend integration

---

## Accuracy Measures

1. **DNS Resolution**: Use multiple resolvers (system + fallback to 8.8.8.8)
2. **ICMP Ping**: Direct ping with timeout, retry if failed
3. **HTTP Status Code**: Accurate HTTP status capture or error message
4. **Last Checked**: Use server time, not client time
5. **Retry Logic**: If a check fails, automatically retry before marking as offline
6. **Consistency**: All checks run in sequence to avoid race conditions

---

## File Changes Needed

```
backend/
├─ internal/
│  ├─ model/model.go              ← Simplify MonitoringLog
│  ├─ prober/http.go              ← Simplify probe logic
│  ├─ prober/prober.go            ← Keep interface same
│  ├─ worker/pool.go              ← Simplify check() method
│  ├─ repository/repository.go    ← Update queries
│  ├─ handler/handler.go          ← Update API response
│  ├─ websocket/hub.go            ← Simplify events
│  └─ service/service.go          ← Add computed fields
└─ migrations/
   └─ 015_simplify_monitoring.sql  ← New migration
```

---

**Status: READY FOR IMPLEMENTATION**
