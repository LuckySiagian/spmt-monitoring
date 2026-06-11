# 🚀 SPMT Engine Golang - Cara Kerja Monitoring Website

## 📋 Gambaran Umum

SPMT (System Pemantauan Monitoring) adalah sistem monitoring website real-time yang menggunakan **Go backend dengan WebSocket broadcast** untuk mendeteksi status dan kesehatan website yang sedang dimonitor.

---

## 🔄 Alur Kerja Utama Engine

```
┌─────────────────────────────────────────────────────────────────┐
│                     START: Backend Server                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
         ┌──────▼──────┐         ┌────────▼─────┐
         │  Scheduler  │         │ Worker Pool  │
         │  (30s tick) │         │  (10 workers)│
         └──────┬──────┘         └──────┬───────┘
                │                       │
                │ Reload websites       │ Wait for jobs
                │ Create tickers        │
                │                       │
    ┌───────────▼──────────────┐        │
    │  Ticker untuk website #1 │        │
    │  Interval: 30s          │        │
    │  → Emit MonitorJob      │───────┐│
    ├───────────────────────────┤      ││
    │  Ticker untuk website #2 │      ││
    │  Interval: 60s          │      ││
    │  → Emit MonitorJob      │──────┤│
    └───────────────────────────┘      ││
                                        ││
                                ┌───────▼▼─────────┐
                                │  Worker picks up  │
                                │  MonitorJob from  │
                                │  job queue (500)  │
                                └────────┬──────────┘
                                         │
```

---

## 🔍 Fase 1: DNS Resolution & Classification

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 1: Extract hostname dari URL                              │
│ Contoh: "https://www.google.com/search" → "www.google.com"    │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 2: DNS Lookup (System Resolver dengan timeout 5s)         │
├────────────────────────────────────────────────────────────────┤
│ ✓ Jika berhasil:                                               │
│   - Dapatkan semua IP addresses yang terresolusi               │
│   - Catat IP utama (primary): 172.217.164.46                  │
│   - Semua IP: [172.217.164.46, 172.217.164.47, ...]          │
│                                                                 │
│ ✗ Jika gagal:                                                  │
│   → FALLBACK: Coba Google Public DNS (8.8.8.8)                │
│     Jika berhasil, gunakan public DNS results                  │
│     Jika gagal juga, STOP → Status = OFFLINE                  │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 3: IP Classification                                      │
├────────────────────────────────────────────────────────────────┤
│ Cek apakah IP adalah PRIVATE atau PUBLIC:                     │
│                                                                 │
│ PRIVATE IP (RFC 1918):                                         │
│   - 10.0.0.0/8                                                 │
│   - 172.16.0.0/12                                              │
│   - 192.168.0.0/16                                             │
│   - 127.0.0.0/8 (Loopback)                                     │
│                                                                 │
│ Jika Private IP:                                               │
│   - Coba reach ke IP:443 atau IP:80 dengan TCP timeout 2s      │
│   - UNREACHABLE? → Fallback ke Public DNS, jika publik lancar │
│   - REACHABLE? → Lanjut dengan private IP                      │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT DNS PHASE:
    ├─ dns_resolved: true ✓
    ├─ ip_address: "172.217.164.46"
    ├─ all_resolved_ips: [...]
    ├─ ip_classification: "PUBLIC"
    ├─ dns_latency_ms: 45
    ├─ hosting_asn: "Google Cloud"
    └─ hosting_provider: "Google LLC"
```

---

## 🔐 Fase 2: TLS/SSL Validation (Hanya untuk HTTPS)

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 4: Strict TLS Handshake (No InsecureSkipVerify)          │
├────────────────────────────────────────────────────────────────┤
│ Port: 443                                                       │
│ Timeout: 10s                                                    │
│                                                                 │
│ ✓ Berhasil:                                                    │
│   - Catat SSL/TLS valid = true                                │
│   - Ekstrak certificate info:                                  │
│     * Issuer: "DigiCert"                                      │
│     * NotAfter: "2025-06-10"                                  │
│     * TLS Version: "TLS 1.3"                                  │
│     * Cipher Suite: "ECDHE-ECDSA-AES128-GCM-SHA256"          │
│                                                                 │
│ ✗ Error Parsing:                                              │
│   - SSL_EXPIRED → Cert sudah kadaluarsa                       │
│   - HOSTNAME_MISMATCH → Domain tidak sesuai cert              │
│   - SSL_UNTRUSTED_CA → CA tidak dipercaya / intercepted       │
│   - SSL_PROTOCOL_ERROR → Handshake gagal                      │
│   - FIREWALL_INTERRUPTION → Koneksi timeout oleh firewall     │
│   - NETWORK_POLICY_BLOCK → RST/EOF oleh policy                │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT TLS PHASE:
    ├─ tls_handshake_ok: true ✓
    ├─ tls_latency_ms: 120
    ├─ tls_cert_issuer: "DigiCert"
    ├─ tls_cert_expiry: "2025-06-10T23:59:59Z"
    ├─ tls_error: null
    └─ tls_error (jika gagal): "SSL_EXPIRED"
```

---

## 🌐 Fase 3: HTTP Request & Application Probing

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 5: HTTP GET Request dengan detailed trace                │
├────────────────────────────────────────────────────────────────┤
│ Header yang dikirim:                                           │
│ - User-Agent: "Mozilla/5.0 (Windows NT 10.0...)"              │
│ - Accept: "*/*"                                                │
│ - Accept-Language: "id-ID, en-US"                             │
│ - Cache-Control: "no-cache"                                    │
│ - Priority: "u=0, i" (HTTP/2)                                 │
│                                                                 │
│ HTTP Trace Recording:                                          │
│   ▼ DNSStart ──→ DNSDone                [DNS latency]          │
│   ▼ ConnectStart ──→ ConnectDone        [TCP latency]          │
│   ▼ TLSHandshakeStart ──→ TLSHandshakeDone [TLS latency]      │
│   ▼ GotFirstResponseByte              [TTFB latency]           │
│   ▼ Response complete                  [Response time]         │
│                                                                 │
│ Timeout dinamis berdasarkan network context:                   │
│ - Baseline: 0ms      → Dial timeout: 10s, HTTP timeout: 30s    │
│ - Baseline: 500ms    → Dial timeout: 11.5s, HTTP timeout: 31.5s│
│ - Baseline: 1000ms   → Dial timeout: 13s, HTTP timeout: 33s    │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 6: Response Analysis                                      │
├────────────────────────────────────────────────────────────────┤
│ ✓ HTTP 200-299 (Success):                                      │
│   - Baca response body (max: 1MB)                             │
│   - Extract response headers (Content-Type, Server, etc)       │
│   - Catat redirect chain (jika ada)                            │
│                                                                 │
│ ⚠ HTTP 300-399 (Redirect):                                    │
│   - Follow redirect (max 10 redirects)                         │
│   - Catat semua redirect URLs dalam chain                      │
│   - Jika ada redirect ke domain berbeda = MIGRATION indicator  │
│                                                                 │
│ ⚠ HTTP 400-499 (Client Error):                                │
│   - 403: Forbidden (mungkin WAF block)                         │
│   - 404: Not Found                                             │
│   - 401: Auth required                                         │
│   - Tetap ada respons = BROWSER_ACCESSIBLE = true              │
│                                                                 │
│ ✗ HTTP 500-599 (Server Error):                                │
│   - 500: Internal Server Error                                │
│   - 502: Bad Gateway                                           │
│   - 503: Service Unavailable                                   │
│   - Ada respons = BROWSER_ACCESSIBLE = true                    │
│                                                                 │
│ ✗ Network Error (No Response):                                │
│   - Connection Refused (koneksi ditolak)                       │
│   - Connection Timeout (no response after timeout)             │
│   - Connection Reset (RST packet)                              │
│   - EOF (connection closed)                                    │
│   - BROWSER_ACCESSIBLE = false                                │
│   - Fallback: Coba HTTP jika HTTPS gagal                       │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT HTTP PHASE:
    ├─ tcp_connected: true ✓
    ├─ tcp_latency_ms: 50
    ├─ http_status_code: 200
    ├─ response_time_ms: 450
    ├─ ttfb_ms: 120
    ├─ redirect_chain: ["https://example.com", "https://example.com/home"]
    ├─ redirect_count: 1
    ├─ server_header: "nginx/1.20.0"
    ├─ content_type: "text/html; charset=utf-8"
    ├─ is_cdn: true
    ├─ cdn_provider: "Cloudflare"
    ├─ waf_detected: "Cloudflare"
    ├─ response_body_preview: "<!DOCTYPE html>..."
    └─ http_error: null
```

---

## 🖼️ Fase 4: Headless Chrome Diagnostics

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 7: Launch Headless Chrome (Browser Rendering)            │
├────────────────────────────────────────────────────────────────┤
│ Kondisi launch:                                                │
│ - DISABLE_CHROME_DIAGNOSTIC != "true"                          │
│ - Semaphore: Maksimal 3 Chrome instances parallel              │
│                                                                 │
│ Apa yang di-extract:                                           │
│                                                                 │
│ 1. Page Title                                                  │
│    Dari: <title>Search</title>                                 │
│    Output: "Search"                                            │
│                                                                 │
│ 2. Page Text Content                                           │
│    Dari: Semua text nodes di DOM (after rendering)             │
│    Output: "Search Google Products Home About..."              │
│                                                                 │
│ 3. Screenshot (opsional)                                       │
│    - Full page screenshot ke PNG                               │
│    - Convert ke Base64                                         │
│    - Simpan hanya jika website.save_screenshot = true          │
│                                                                 │
│ 4. Dynamic Migration Detection                                 │
│    Cari keywords di page text:                                 │
│    "migrated", "moved", "dialihkan", "has been moved"         │
│    "please access via", "silakan kunjungi"                     │
│                                                                 │
│    Deteksi HTML meta refresh:                                  │
│    <meta http-equiv="refresh" content="0;url=...">            │
│                                                                 │
│ Timeout: 30s per Chrome instance                              │
│ Error handling: Cache previous successful result               │
│ Memory optimization: Reuse ChromeDP context                    │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT CHROME PHASE:
    ├─ chrome_success: true ✓
    ├─ page_title: "Search"
    ├─ page_text_preview: "Search Google Products Home..."
    ├─ screenshot: "iVBORw0KGgoAAAANS..." (Base64)
    ├─ is_migrated: false
    └─ migration_hint: null
```

---

## 🔧 Fase 5: ICMP Ping (Optional)

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 8: Send ICMP Echo Request                                │
├────────────────────────────────────────────────────────────────┤
│ Target: hostname (bukan IP)                                    │
│ Timeout: 4s                                                     │
│                                                                 │
│ ✓ Berhasil:                                                    │
│   - icmp_status: true                                         │
│   - icmp_latency_ms: 35                                        │
│                                                                 │
│ ✗ Gagal:                                                       │
│   - icmp_status: false (firewall block ICMP, atau host offline)│
│   - icmp_latency_ms: null                                      │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT ICMP PHASE:
    ├─ icmp_status: true ✓
    └─ icmp_latency_ms: 35
```

---

## 📊 Fase 6: Evidence Collection & Correlation

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 9: Build Complete Evidence JSON (25 fields)              │
├────────────────────────────────────────────────────────────────┤
│ Struktur Evidence JSON:                                        │
│                                                                 │
│ {                                                               │
│   "dns_resolved": true,                                        │
│   "dns_latency_ms": 45,                                        │
│   "ip_address": "172.217.164.46",                              │
│   "all_resolved_ips": ["172.217.164.46", "172.217.164.47"],   │
│   "ip_classification": "PUBLIC",                               │
│                                                                 │
│   "tcp_connected": true,                                       │
│   "tcp_latency_ms": 50,                                        │
│   "icmp_status": true,                                         │
│   "icmp_latency_ms": 35,                                       │
│                                                                 │
│   "tls_handshake_ok": true,                                    │
│   "tls_latency_ms": 120,                                       │
│   "tls_cert_issuer": "DigiCert",                               │
│   "tls_cert_expiry": "2025-06-10T23:59:59Z",                   │
│   "tls_error": null,                                           │
│                                                                 │
│   "http_status_code": 200,                                     │
│   "response_time_ms": 450,                                     │
│   "ttfb_ms": 120,                                              │
│   "redirect_count": 1,                                         │
│   "redirect_chain": [...],                                     │
│   "content_type": "text/html; charset=utf-8",                  │
│   "server_header": "nginx/1.20.0",                             │
│   "is_cdn": true,                                              │
│   "cdn_provider": "Cloudflare",                                │
│   "http_error": null,                                          │
│                                                                 │
│   "waf_detected": "Cloudflare",                                │
│   "hosting_asn": "Google Cloud",                               │
│   "hosting_provider": "Google LLC",                            │
│                                                                 │
│   "response_body_preview": "<!DOCTYPE html>...",               │
│   "is_migrated": false,                                        │
│   "migration_hint": null,                                      │
│   "chrome_success": true,                                      │
│   "screenshot": "iVBORw0KGgo...",                              │
│   "page_title": "Search",                                      │
│   "page_text_preview": "Search Google Products..."             │
│ }                                                               │
│                                                                 │
│ STEP 10: Inference & Root Cause Analysis                      │
│ Evaluasi semua evidence dengan correlation rules:              │
│ - Jika DNS gagal → OFFLINE (root cause: DNS failure)           │
│ - Jika DNS OK, TCP gagal → OFFLINE (root cause: Server down)   │
│ - Jika TCP OK, TLS gagal → CRITICAL (root cause: SSL issue)    │
│ - Jika HTTP 500 → CRITICAL (root cause: Server error)          │
│ - Jika response > 3000ms → WARNING (root cause: High latency)   │
│ - Jika SSL expiry < 7 hari → WARNING (root cause: SSL expiry)   │
│ - Jika semua OK → ONLINE (root cause: All systems normal)      │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    📊 OUTPUT INFERENCE:
    ├─ status: "ONLINE"
    ├─ root_cause: "{complete 25-field evidence JSON}"
    ├─ health_score: 100
    ├─ confidence: 100
    ├─ primary_root_cause_key: "ALL_SYSTEMS_NORMAL"
    ├─ is_browser_accessible: true
    ├─ final_reason: "Evidence Collected"
    ├─ final_decision_source: "EVIDENCE_COLLECTION_V2"
    ├─ recommendation: "Tidak ada tindakan yang diperlukan."
    └─ investigation_report: {
        evidence: [...],
        primary_issue: null,
        secondary_issues: [],
        final_recommendation: "..."
       }
```

---

## 💾 Fase 7: Save & Broadcast

```
┌────────────────────────────────────────────────────────────────┐
│ STEP 11: Insert Monitoring Log to PostgreSQL                  │
├────────────────────────────────────────────────────────────────┤
│ Table: monitoring_logs                                         │
│                                                                 │
│ INSERT INTO monitoring_logs (                                  │
│   id, website_id, checked_at,                                  │
│   dns_resolved, dns_latency_ms,                               │
│   tcp_port_open, tls_latency_ms, ttfb_latency_ms,             │
│   status_code, response_time_ms,                               │
│   ssl_valid, ssl_expiry_date,                                  │
│   ip_address, status, root_cause,                              │
│   recommendation, health_score, confidence,                    │
│   is_browser_accessible, final_reason,                        │
│   final_decision_source, resolver_stage                       │
│ ) VALUES (...)                                                 │
│                                                                 │
│ STEP 12: Broadcast via WebSocket (Real-time)                 │
│                                                                 │
│ ┌─ Jika status berubah:                                        │
│ │  - Insert status_event record                              │
│ │  - Broadcast "status_change" event ke semua client          │
│ │  - Trigger incident auto-create jika kritis                 │
│ │  - Trigger incident auto-resolve jika kembali online        │
│ │  - Send notification (Telegram, etc)                        │
│ │                                                              │
│ └─ Event JSON (WebSocket):                                     │
│    {                                                           │
│      "type": "status_change",                                  │
│      "website": "Google",                                      │
│      "website_id": "550e8400-e29b-41d4-a716-446655440000",    │
│      "url": "https://www.google.com",                          │
│      "old_status": "ONLINE",                                   │
│      "new_status": "OFFLINE",                                  │
│      "root_cause": "{complete evidence JSON}",                │
│      "ip_address": "172.217.164.46",                           │
│      "response_time_ms": null,                                 │
│      "timestamp": "2025-06-10T10:30:45Z"                       │
│    }                                                           │
│                                                                 │
│ ┌─ Selalu broadcast "monitor_update" (refresh dashboard):     │
│ │  {                                                           │
│ │    "type": "monitor_update",                                │
│ │    "website_id": "550e8400...",                              │
│ │    "website_name": "Google",                                 │
│ │    "url": "https://www.google.com",                          │
│ │    "status": "ONLINE",                                       │
│ │    "ip_address": "172.217.164.46",                           │
│ │    "dns_resolved": true,                                     │
│ │    "dns_latency_ms": 45,                                     │
│ │    "tcp_port_open": true,                                    │
│ │    "tls_latency_ms": 120,                                    │
│ │    "ttfb_latency_ms": 120,                                   │
│ │    "status_code": 200,                                       │
│ │    "response_time_ms": 450,                                  │
│ │    "ssl_valid": true,                                        │
│ │    "ssl_expiry_date": "2025-06-10T23:59:59Z",               │
│ │    "health_score": 100,                                      │
│ │    "confidence": 100,                                        │
│ │    "is_browser_accessible": true                             │
│ │  }                                                           │
│ └─                                                              │
│                                                                 │
│ STEP 13: Update Prometheus Metrics                            │
│ - total_checks++                                               │
│ - monitoring_duration (histogram)                              │
│ - failed_checks (jika status != ONLINE)                        │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
    ✅ Monitoring cycle complete, ready untuk website berikutnya
```

---

## 📈 Output Data Structure

### 1. **MonitoringLog** (Stored in DB)
```go
type MonitoringLog struct {
    ID                  uuid.UUID     // Unique ID
    WebsiteID           uuid.UUID     // Foreign key to Website
    CheckedAt           time.Time     // Waktu check dilakukan
    
    // Network Layer
    DNSResolved         bool          // DNS berhasil?
    DNSLatencyMs        *int          // Berapa lama DNS lookup?
    TCPPortOpen         bool          // Port terbuka?
    ICMPStatus          bool          // Ping berhasil?
    ICMPLatencyMs       *int          // Ping latency
    
    // Security Layer
    TLSLatencyMs        *int          // TLS handshake latency
    SSLValid            bool          // SSL valid?
    SSLExpiryDate       *time.Time    // Kapan SSL expired?
    
    // Application Layer
    StatusCode          *int          // HTTP status code
    ResponseTimeMs      *int          // Total response time
    TTFBLatencyMs       *int          // Time To First Byte
    
    // Diagnosis
    Status              LogStatus     // ONLINE|WARNING|DEGRADED|CRITICAL|OFFLINE
    RootCause           string        // Complete 25-field evidence JSON
    Recommendation      string        // What to do
    HealthScore         int           // 0-100
    Confidence          int           // 0-100
    IsBrowserAccessible bool          // Can user see page?
    
    // Meta
    ErrorMessage        *string       // Error details if any
    IPAddress           string        // Resolved IP
    FinalReason         string        // Why this status?
    FinalDecisionSource string        // Decision source (v2 engine)
}
```

### 2. **Status Values**
```
ONLINE       → ✅ Website working normally
WARNING      → ⚠️  Some issues (e.g., slow, SSL expiring soon)
DEGRADED     → ⚠️  Performance issues or minor problems
CRITICAL     → 🔴 Severe issues (e.g., SSL error, high error rate)
OFFLINE      → ❌ Website unreachable
```

### 3. **Health Score Calculation**
```
100 = All systems normal (DNS ✓, TCP ✓, TLS ✓, HTTP 200 ✓, <1000ms ✓)
80-99 = Minor issues (High latency, warnings)
60-79 = Moderate issues (Some failed components)
40-59 = Serious issues (Multiple failures)
0-39 = Critical (Most systems failing)
```

---

## 🎯 Anti-Flapping Protection

Sistem menggunakan **2-failure rule** untuk mencegah false alarms:

```
1. Check 1: Status = OFFLINE
   ├─ Is this the first failure? → Keep previous status (ONLINE)
   └─ Log: "FLAPPING_PENDING"

2. Check 2: Status still = OFFLINE
   └─ Confirmed failure → Change to OFFLINE
   └─ Trigger incident

3. Check 3: Status = ONLINE
   ├─ Reset consecutive_failures counter
   └─ Auto-resolve incident
```

---

## 🔄 Concurrent Execution

```
Worker Pool Design:
├─ 10 workers (configurable)
├─ Job queue size: 500
├─ Each worker:
│  ├─ Picks job from queue
│  ├─ Runs full probe (DNS → HTTP → Chrome → ICMP)
│  ├─ Performs correlation analysis
│  ├─ Saves to DB
│  ├─ Broadcasts via WebSocket
│  └─ Metrics update
│
├─ Scheduler:
│  ├─ Every 30 seconds
│  ├─ Load all active websites from DB
│  ├─ Create/update tickers for each website
│  └─ Emit MonitorJob based on interval
│
└─ Example flow:
   Website #1 (interval 30s)  → emit job every 30s
   Website #2 (interval 60s)  → emit job every 60s
   Website #3 (interval 30s)  → emit job every 30s
   
   All jobs go to single queue → workers process in parallel
```

---

## 🌐 Real-time Frontend Updates

Frontend menerima real-time updates via WebSocket:

```javascript
// Connected to ws://localhost:8080/ws

// Event 1: Monitoring Update (every check)
{
  "type": "monitor_update",
  "website_id": "550e8400...",
  "website_name": "Google",
  "status": "ONLINE",
  "response_time_ms": 450,
  // ... 30+ fields
}

// Event 2: Status Change (when status changes)
{
  "type": "status_change",
  "website": "Google",
  "old_status": "ONLINE",
  "new_status": "OFFLINE",
  "root_cause": "{complete evidence}"
}

// Event 3: Dashboard Summary (summary aggregated)
{
  "type": "dashboard_summary",
  "total_websites": 50,
  "online_count": 48,
  "critical_count": 1,
  "offline_count": 1
}
```

---

## 🛠️ Configuration Tuning

### Environment Variables:
```bash
# Worker & Job Queue
RECHECK_BATCH_SIZE=10              # Batch size untuk revalidate
RECHECK_BATCH_INTERVAL=2s          # Delay antar batch

# Chrome Diagnostics
DISABLE_CHROME_DIAGNOSTIC=false    # Set true untuk disable Chrome

# Network Timeout Compensation
# (Automatic, based on baseline latency)
```

### Website Settings (per website):
```json
{
  "name": "Google",
  "url": "https://www.google.com",
  "interval_seconds": 30,          // Check setiap 30 detik
  "save_screenshot": true          // Simpan screenshot
}
```

---

## 📝 Summary: What Each Component Does

| Component | Purpose | Input | Output |
|-----------|---------|-------|--------|
| **Scheduler** | Load websites & create tickers | PostgreSQL | MonitorJob events |
| **Worker Pool** | Execute probe jobs in parallel | MonitorJob | Monitoring check complete |
| **HTTPProber** | Perform HTTP request with tracing | Website URL | Telemetry (HTTP details) |
| **TLS Validator** | Strict SSL certificate check | Hostname + IP | TLS status, cert expiry |
| **Chrome Diagnostic** | Render page & extract visuals | URL | Screenshot, title, page text |
| **Correlation Engine** | Analyze evidence & deduce root cause | Evidence JSON | Final Status + Health Score |
| **Repository** | Store logs in PostgreSQL | MonitoringLog | Audit trail, history |
| **WebSocket Hub** | Broadcast updates in real-time | Event data | Live dashboard updates |
| **Notification Service** | Send alerts | Status change | Email, Telegram, etc |

---

## 🔍 Example: Monitoring Google

```
Timeline: 2025-06-10 10:30:45

[10:30:45.000] Worker #3 picks up: Monitor Google (interval 30s)
[10:30:45.050] DNS lookup: www.google.com → 172.217.164.46 (45ms)
[10:30:45.055] IP classification: PUBLIC ✓
[10:30:45.105] SSL handshake: Expired 2025-06-10 (120ms)
[10:30:45.155] HTTP GET: Status 200, Response time 450ms, TTFB 120ms
[10:30:45.185] Chrome: Screenshot captured, Title "Search", migrated: false
[10:30:45.220] ICMP: Ping OK (35ms)
[10:30:45.220] Analysis: All systems normal → Status = ONLINE, Health = 100
[10:30:45.225] Saved to DB + Broadcast via WS
[10:30:45.230] Frontend refreshed with new metrics ✓

Time to complete: ~185ms

Next check: [10:31:15.000] (30 seconds later)
```

---

**Generated at: 2025-06-10**
**Engine Version: V2 (EVIDENCE_COLLECTION_V2)**
