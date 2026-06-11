# 📊 SPMT Engine - Output Data Examples

## 1. MonitoringLog Record (PostgreSQL)

### Example: Google ONLINE Status

```sql
SELECT * FROM monitoring_logs 
WHERE website_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY checked_at DESC 
LIMIT 1;
```

**Result:**
```
id                  │ b4f8c7d9-2e1a-4b5c-8f3a-1d2c3e4f5a6b
website_id          │ 550e8400-e29b-41d4-a716-446655440000
checked_at          │ 2025-06-10 10:30:45.000000+00
dns_resolved        │ true
dns_latency_ms      │ 45
icmp_status         │ true
icmp_latency_ms     │ 35
tcp_port_open       │ true
tls_latency_ms      │ 120
ttfb_latency_ms     │ 120
status_code         │ 200
response_time_ms    │ 450
ssl_valid           │ true
ssl_expiry_date     │ 2025-06-10 23:59:59.000000+00
ip_address          │ 172.217.164.46
error_message       │ NULL
status              │ ONLINE
root_cause          │ (see JSON below)
recommendation      │ Tidak ada tindakan yang diperlukan.
health_score        │ 100
confidence          │ 100
is_browser_accessible │ true
final_reason        │ Evidence Collected
final_decision_source │ EVIDENCE_COLLECTION_V2
resolver_stage      │ EVIDENCE_COLLECTION_V2
```

---

### Root Cause JSON (Complete Evidence)

```json
{
  "dns_resolved": true,
  "dns_latency_ms": 45,
  "ip_address": "172.217.164.46",
  "all_resolved_ips": [
    "172.217.164.46",
    "172.217.164.47",
    "172.217.164.48"
  ],
  "ip_classification": "PUBLIC",
  "tcp_connected": true,
  "tcp_latency_ms": 50,
  "icmp_status": true,
  "icmp_latency_ms": 35,
  "tls_handshake_ok": true,
  "tls_latency_ms": 120,
  "tls_cert_issuer": "DigiCert",
  "tls_cert_expiry": "2025-06-10T23:59:59Z",
  "tls_error": null,
  "http_status_code": 200,
  "response_time_ms": 450,
  "ttfb_ms": 120,
  "redirect_count": 0,
  "redirect_chain": [],
  "content_type": "text/html; charset=utf-8",
  "server_header": "gws",
  "is_cdn": true,
  "cdn_provider": "Cloudflare",
  "http_error": null,
  "waf_detected": "Cloudflare",
  "hosting_asn": "Google Cloud",
  "hosting_provider": "Google LLC",
  "response_body_preview": "<!DOCTYPE html><html>...",
  "is_migrated": false,
  "migration_hint": null,
  "chrome_success": true,
  "screenshot": "iVBORw0KGgoAAAANS...",
  "page_title": "Google",
  "page_text_preview": "Search Google Images Maps News Shopping Gmail Drive...",
  "investigation_report": {
    "evidence": [
      "✓ DNS resolved",
      "✓ Private IP detected: No (PUBLIC)",
      "✓ TCP connected",
      "✓ ICMP reachable",
      "✓ TLS handshake successful",
      "✓ HTTP status 200",
      "✓ Response time < 1000ms"
    ],
    "primary_issue": null,
    "secondary_issues": [],
    "final_recommendation": "Semua sistem berjalan normal. Tidak ada tindakan yang diperlukan."
  }
}
```

---

## 2. Example: Website OFFLINE (DNS Failed)

```
id                  │ a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6
website_id          │ 550e8400-e29b-41d4-a716-446655440111
checked_at          │ 2025-06-10 10:31:15.000000+00
dns_resolved        │ false
dns_latency_ms      │ 5000
icmp_status         │ false
icmp_latency_ms     │ NULL
tcp_port_open       │ false
tls_latency_ms      │ NULL
ttfb_latency_ms     │ NULL
status_code         │ NULL
response_time_ms    │ NULL
ssl_valid           │ false
ssl_expiry_date     │ NULL
ip_address          │ (empty)
error_message       │ no such host
status              │ OFFLINE
root_cause          │ (see JSON below)
recommendation      │ Periksa DNS server dan konektivitas jaringan
health_score        │ 0
confidence          │ 100
is_browser_accessible │ false
final_reason        │ Evidence Collected
final_decision_source │ EVIDENCE_COLLECTION_V2
resolver_stage      │ EVIDENCE_COLLECTION_V2
```

### Root Cause JSON:
```json
{
  "dns_resolved": false,
  "dns_latency_ms": 5000,
  "ip_address": "",
  "all_resolved_ips": [],
  "ip_classification": "UNKNOWN",
  "tcp_connected": false,
  "tcp_latency_ms": null,
  "icmp_status": false,
  "icmp_latency_ms": null,
  "tls_handshake_ok": false,
  "tls_latency_ms": null,
  "tls_cert_issuer": "",
  "tls_cert_expiry": null,
  "tls_error": null,
  "http_status_code": null,
  "response_time_ms": null,
  "ttfb_ms": null,
  "redirect_count": 0,
  "redirect_chain": [],
  "content_type": null,
  "server_header": null,
  "is_cdn": false,
  "cdn_provider": null,
  "http_error": "no such host",
  "waf_detected": "Not Detected",
  "hosting_asn": null,
  "hosting_provider": null,
  "response_body_preview": "",
  "is_migrated": false,
  "migration_hint": null,
  "chrome_success": false,
  "screenshot": "",
  "page_title": "",
  "page_text_preview": "",
  "investigation_report": {
    "evidence": [
      "✗ DNS failed",
      "✗ No IP addresses resolved"
    ],
    "primary_issue": "DNS_RESOLUTION_FAILED",
    "secondary_issues": [],
    "final_recommendation": "Hubungi administrator domain atau ISP. Periksa konfigurasi DNS dan konektivitas jaringan. Website mungkin sedang down atau domain sudah tidak valid."
  }
}
```

---

## 3. Example: Website CRITICAL (SSL Error)

```
id                  │ c5d6e7f8-g9h0-41i2-j3k4-l5m6n7o8p9q0
website_id          │ 550e8400-e29b-41d4-a716-446655440222
checked_at          │ 2025-06-10 10:32:45.000000+00
dns_resolved        │ true
dns_latency_ms      │ 42
icmp_status         │ true
icmp_latency_ms     │ 30
tcp_port_open       │ true
tls_latency_ms      │ NULL
ttfb_latency_ms     │ NULL
status_code         │ NULL
response_time_ms    │ NULL
ssl_valid           │ false
ssl_expiry_date     │ NULL
ip_address          │ 203.0.113.42
error_message       │ CERTIFICATE_VERIFY_FAILED: certificate has expired
status              │ CRITICAL
root_cause          │ (see JSON below)
recommendation      │ Segera perbarui sertifikat SSL/TLS sebelum pengguna melihat warning
health_score        │ 15
confidence          │ 100
is_browser_accessible │ false
final_reason        │ Evidence Collected
final_decision_source │ EVIDENCE_COLLECTION_V2
resolver_stage      │ EVIDENCE_COLLECTION_V2
```

### Root Cause JSON:
```json
{
  "dns_resolved": true,
  "dns_latency_ms": 42,
  "ip_address": "203.0.113.42",
  "all_resolved_ips": ["203.0.113.42"],
  "ip_classification": "PUBLIC",
  "tcp_connected": true,
  "tcp_latency_ms": 65,
  "icmp_status": true,
  "icmp_latency_ms": 30,
  "tls_handshake_ok": false,
  "tls_latency_ms": null,
  "tls_cert_issuer": "",
  "tls_cert_expiry": null,
  "tls_error": "SSL_EXPIRED",
  "http_status_code": null,
  "response_time_ms": null,
  "ttfb_ms": null,
  "redirect_count": 0,
  "redirect_chain": [],
  "content_type": null,
  "server_header": null,
  "is_cdn": false,
  "cdn_provider": null,
  "http_error": "CERTIFICATE_VERIFY_FAILED: certificate has expired",
  "waf_detected": "Not Detected",
  "hosting_asn": "PT Telkom Indonesia",
  "hosting_provider": "Telkom",
  "response_body_preview": "",
  "is_migrated": false,
  "migration_hint": null,
  "chrome_success": false,
  "screenshot": "",
  "page_title": "",
  "page_text_preview": "",
  "investigation_report": {
    "evidence": [
      "✓ DNS resolved",
      "✓ IP is PUBLIC (203.0.113.42)",
      "✓ TCP connected",
      "✗ TLS handshake failed: SSL_EXPIRED",
      "✗ Certificate has expired"
    ],
    "primary_issue": "SSL_EXPIRED",
    "secondary_issues": [],
    "final_recommendation": "URGENT: Sertifikat SSL untuk website ini sudah kadaluarsa. Pengguna akan melihat peringatan keamanan di browser. Segera hubungi hosting provider atau administrator sistem untuk memperbarui sertifikat SSL/TLS."
  }
}
```

---

## 4. Example: Website WARNING (High Latency)

```
id                  │ d7e8f9g0-h1i2-43j4-k5l6-m7n8o9p0q1r2
website_id          │ 550e8400-e29b-41d4-a716-446655440333
checked_at          │ 2025-06-10 10:33:15.000000+00
dns_resolved        │ true
dns_latency_ms      │ 180
icmp_status         │ true
icmp_latency_ms     │ 120
tcp_port_open       │ true
tls_latency_ms      │ 450
ttfb_latency_ms     │ 800
status_code         │ 200
response_time_ms    │ 5240
ssl_valid           │ true
ssl_expiry_date     │ 2026-06-10 23:59:59.000000+00
ip_address          │ 198.51.100.55
error_message       │ NULL
status              │ WARNING
root_cause          │ (see JSON below)
recommendation      │ Periksa beban server, database, atau infrastruktur jaringan
health_score        │ 50
confidence          │ 100
is_browser_accessible │ true
final_reason        │ Evidence Collected
final_decision_source │ EVIDENCE_COLLECTION_V2
resolver_stage      │ EVIDENCE_COLLECTION_V2
```

### Root Cause JSON:
```json
{
  "dns_resolved": true,
  "dns_latency_ms": 180,
  "ip_address": "198.51.100.55",
  "all_resolved_ips": ["198.51.100.55"],
  "ip_classification": "PUBLIC",
  "tcp_connected": true,
  "tcp_latency_ms": 150,
  "icmp_status": true,
  "icmp_latency_ms": 120,
  "tls_handshake_ok": true,
  "tls_latency_ms": 450,
  "tls_cert_issuer": "Let's Encrypt",
  "tls_cert_expiry": "2026-06-10T23:59:59Z",
  "tls_error": null,
  "http_status_code": 200,
  "response_time_ms": 5240,
  "ttfb_ms": 800,
  "redirect_count": 0,
  "redirect_chain": [],
  "content_type": "text/html; charset=utf-8",
  "server_header": "Apache/2.4.41",
  "is_cdn": false,
  "cdn_provider": null,
  "http_error": null,
  "waf_detected": "Not Detected",
  "hosting_asn": "AWS",
  "hosting_provider": "Amazon Web Services",
  "response_body_preview": "<!DOCTYPE html>...",
  "is_migrated": false,
  "migration_hint": null,
  "chrome_success": true,
  "screenshot": "iVBORw0KGgoAAAANS...",
  "page_title": "My Website",
  "page_text_preview": "Welcome to my website. This is the home page.",
  "investigation_report": {
    "evidence": [
      "✓ DNS resolved (180ms - SLOW)",
      "✓ IP is PUBLIC (198.51.100.55)",
      "✓ TCP connected (150ms - ACCEPTABLE)",
      "✓ TLS handshake successful (450ms - SLOW)",
      "✓ HTTP status 200 (OK)",
      "⚠ Response time: 5240ms (VERY SLOW)",
      "⚠ TTFB: 800ms (SLOW)"
    ],
    "primary_issue": "HIGH_LATENCY",
    "secondary_issues": ["DNS_SLOW", "TLS_SLOW"],
    "final_recommendation": "Website berfungsi tetapi sangat lambat (5.2 detik). Kemungkinan penyebab: (1) Server sedang kelebihan beban; (2) Database query lambat; (3) Bottleneck network; (4) CDN belum dikonfigurasi. Rekomendasi: Monitor server resource (CPU, RAM, disk), analisis slow queries, pertimbangkan implementasi CDN atau load balancing."
  }
}
```

---

## 5. WebSocket Real-time Events

### Event: monitor_update (Sent after every check)

```json
{
  "type": "monitor_update",
  "website_id": "550e8400-e29b-41d4-a716-446655440000",
  "website_name": "Google",
  "url": "https://www.google.com",
  "status": "ONLINE",
  "ip_address": "172.217.164.46",
  "dns_resolved": true,
  "dns_latency_ms": 45,
  "icmp_status": true,
  "icmp_latency_ms": 35,
  "tcp_port_open": true,
  "tls_latency_ms": 120,
  "ttfb_latency_ms": 120,
  "status_code": 200,
  "response_time_ms": 450,
  "ssl_valid": true,
  "ssl_expiry_date": "2025-06-10T23:59:59Z",
  "error_message": null,
  "root_cause": "{complete evidence JSON}",
  "recommendation": "Tidak ada tindakan yang diperlukan.",
  "health_score": 100,
  "confidence": 100,
  "is_browser_accessible": true,
  "final_reason": "Evidence Collected",
  "final_decision_source": "EVIDENCE_COLLECTION_V2",
  "resolver_stage": "EVIDENCE_COLLECTION_V2",
  "checked_at": "2025-06-10T10:30:45Z"
}
```

### Event: status_change (Sent when status changes)

```json
{
  "type": "status_change",
  "website": "GitHub",
  "website_id": "550e8400-e29b-41d4-a716-446655440111",
  "url": "https://github.com",
  "old_status": "ONLINE",
  "new_status": "OFFLINE",
  "root_cause": "{complete evidence JSON with DNS_FAILED}",
  "ip_address": "",
  "response_time_ms": null,
  "timestamp": "2025-06-10T10:35:20Z"
}
```

---

## 6. Status Events Table (Audit Trail)

```sql
SELECT * FROM status_events 
WHERE website_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC 
LIMIT 5;
```

**Result:**
```
id                    │ e1f2g3h4-i5j6-47k8-l9m0-n1o2p3q4r5s6
website_id            │ 550e8400-e29b-41d4-a716-446655440000
website_name          │ Google
old_status            │ ONLINE
new_status            │ WARNING
created_at            │ 2025-06-10 10:45:30.000000+00
───────────────────────────────────────────────────────────────
id                    │ d4e5f6g7-h8i9-46j0-k1l2-m3n4o5p6q7r8
website_id            │ 550e8400-e29b-41d4-a716-446655440000
website_name          │ Google
old_status            │ WARNING
new_status            │ ONLINE
created_at            │ 2025-06-10 10:46:00.000000+00
```

---

## 7. Dashboard Summary (Aggregated)

```json
{
  "total_websites": 50,
  "online_count": 46,
  "critical_count": 2,
  "offline_count": 2,
  "warning_count": 0,
  "degraded_count": 0,
  "sla_percent": 92.0,
  "avg_response_time": 385.5,
  "active_alerts": 4,
  "last_updated": "2025-06-10T10:45:30Z",
  "recent_status_changes": [
    {
      "website": "GitHub",
      "old_status": "ONLINE",
      "new_status": "OFFLINE",
      "timestamp": "2025-06-10T10:35:20Z"
    },
    {
      "website": "AWS Console",
      "old_status": "ONLINE",
      "new_status": "WARNING",
      "timestamp": "2025-06-10T10:40:15Z"
    }
  ]
}
```

---

## 8. Metrics (Prometheus Format)

```
# HELP monitoring_total_checks Total number of checks performed
# TYPE monitoring_total_checks counter
monitoring_total_checks 125430

# HELP monitoring_failed_checks Total number of failed checks
# TYPE monitoring_failed_checks counter
monitoring_failed_checks 523

# HELP monitoring_duration_seconds Monitoring check duration in seconds
# TYPE monitoring_duration_seconds histogram
monitoring_duration_seconds_bucket{website="Google",status="ONLINE",le="0.1"} 450
monitoring_duration_seconds_bucket{website="Google",status="ONLINE",le="0.5"} 780
monitoring_duration_seconds_bucket{website="Google",status="ONLINE",le="1"} 890
monitoring_duration_seconds_bucket{website="Google",status="ONLINE",le="5"} 920
monitoring_duration_seconds_bucket{website="GitHub",status="OFFLINE",le="0.1"} 10
monitoring_duration_seconds_bucket{website="GitHub",status="OFFLINE",le="5"} 890
```

---

## 9. Incident Auto-Created Example

```json
{
  "id": "f5g6h7i8-j9k0-48l2-m3n4-o5p6q7r8s9t0",
  "website_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Website GitHub is OFFLINE",
  "status": "TRIGGERED",
  "severity": "CRITICAL",
  "created_at": "2025-06-10T10:35:20Z",
  "resolved_at": null,
  "history": [
    {
      "id": "g6h7i8j9-k0l1-49m2-n3o4-p5q6r7s8t9u0",
      "incident_id": "f5g6h7i8-j9k0-48l2-m3n4-o5p6q7r8s9t0",
      "username": "SYSTEM",
      "action": "TRIGGER",
      "details": "System auto-triggered incident: status changed from ONLINE to OFFLINE",
      "created_at": "2025-06-10T10:35:20Z"
    }
  ]
}
```

---

## 10. Response Body Preview (First 500 chars)

```
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        .search-container {
            text-align: center;
            padding: 50px;
        }
    </style>
</head>
<body>
    <div class="search-container">
        <h1>Google Search</h1>
        ...
```

---

## Summary

| Data | Storage | Real-time? | Purpose |
|------|---------|-----------|---------|
| **MonitoringLog** | PostgreSQL | No | Audit trail, history, analysis |
| **Evidence JSON** | MonitoringLog.root_cause | No | Complete diagnostic data |
| **Status Events** | PostgreSQL status_events | No | Track status changes |
| **WebSocket Events** | In-memory broadcast | ✅ Yes | Live dashboard updates |
| **Incidents** | PostgreSQL incidents | No | Alert management |
| **Metrics** | Prometheus scrape endpoint | ✅ Yes | System observability |

---

**Last updated: 2025-06-10**
