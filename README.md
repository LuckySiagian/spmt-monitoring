# SPMT Website Monitoring 
**Enterprise-grade Dashboard | Light Mode | Real-time WebSocket**

---

## Stack
- **Backend**: Go 1.21, Chi Router, PostgreSQL, JWT, bcrypt, Gorilla WebSocket
- **Frontend**: React 18 + Vite, Canvas Topology, WebSocket client
- **Database**: PostgreSQL 14+

---

## 🚀 Cara Menjalankan

### 1. Persiapan Database (PostgreSQL)

```bash
# Buat database
psql -U postgres -c "CREATE DATABASE spmt_monitoring;"

# Jalankan SEMUA migration secara berurutan (001 → 018).
# Server TIDAK menjalankan migrasi otomatis, jadi semua file harus dijalankan manual.

# Linux/macOS:
for f in backend/migrations/*.sql; do psql -U postgres -d spmt_monitoring -f "$f"; done

# Windows PowerShell:
Get-ChildItem backend/migrations/*.sql | Sort-Object Name | ForEach-Object { psql -U postgres -d spmt_monitoring -f $_.FullName }
```

**Default superadmin sudah di-seed otomatis:**
- Username: `superadmin`
- Password: `admin123`

---

### 2. Backend (Go)

```bash
cd backend

# Copy env
cp .env.example .env

# Edit .env sesuai konfigurasi PostgreSQL kamu:
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=yourpassword
# DB_NAME=spmt_monitoring
# JWT_SECRET=ganti-dengan-secret-yang-kuat

# Download dependencies
go mod tidy

# Jalankan server
go run cmd/server/main.go
```

Backend berjalan di: `http://localhost:8080`

---

### 3. Frontend (React + Vite)

```bash
cd frontend

# Copy env
cp .env.example .env

# Install dependencies
npm install

# Jalankan dev server
npm run dev
```

Frontend berjalan di: `http://localhost:5173`

---

## 🔗 Cara Menghubungkan ke PostgreSQL

Edit file `backend/.env`:
```env
DB_HOST=localhost        # Host PostgreSQL
DB_PORT=5432             # Port default
DB_USER=postgres         # Username
DB_PASSWORD=yourpassword # Password kamu
DB_NAME=spmt_monitoring  # Nama database
DB_SSLMODE=disable       # disable untuk local, require untuk production
```

---

## 🧪 Testing dengan URL Contoh

Setelah login sebagai superadmin, masuk ke tab **WEBSITES** → **ADD WEBSITE**:

| Name | URL | Interval |
|------|-----|----------|
| Google | https://www.google.com | 30 |
| GitHub | https://github.com | 60 |
| Wikipedia | https://www.wikipedia.org | 60 |
| Cloudflare | https://www.cloudflare.com | 30 |
| Example (HTTP) | http://example.com | 60 |

Monitoring akan langsung berjalan dan update realtime via WebSocket di dashboard.

---

## 📋 API Endpoints

### Auth
```
POST /auth/login         { "username": "", "password": "" }
POST /auth/register      { "username": "", "password": "" }
```

### Websites (requires auth)
```
GET    /websites
POST   /websites         { "name":"","url":"","description":"","interval_seconds":60 }
PUT    /websites/:id     { "name":"","url":"","description":"","interval_seconds":60 }
DELETE /websites/:id
GET    /websites/:id/logs?limit=100
```

### Dashboard (requires auth)
```
GET /dashboard/summary
WS  /ws                  (WebSocket untuk realtime update)
```

### Users (superadmin only)
```
GET  /users
POST /users/promote      { "user_id": "uuid" }
POST /users/demote       { "user_id": "uuid" }
```

---

## 🏗 Struktur Folder

```
spmt-monitoring/
├── backend/
│   ├── cmd/server/main.go          ← Entry point
│   ├── internal/
│   │   ├── config/config.go        ← Konfigurasi env
│   │   ├── model/model.go          ← Struct data
│   │   ├── repository/repository.go ← Database layer
│   │   ├── service/service.go      ← Business logic
│   │   ├── handler/handler.go      ← HTTP handlers
│   │   ├── middleware/auth.go      ← JWT + RBAC middleware
│   │   ├── worker/pool.go          ← Worker pool monitoring
│   │   └── websocket/hub.go       ← WebSocket hub
│   ├── migrations/001_init.sql     ← SQL schema + seed
│   ├── .env.example
│   └── go.mod
└── frontend/
    ├── src/
    │   ├── App.jsx                 ← Root + routing
    │   ├── pages/
    │   │   ├── LoginPage.jsx       ← Halaman login NOC
    │   │   ├── DashboardPage.jsx   ← Dashboard utama
    │   │   ├── WebsitesPage.jsx    ← Manajemen website
    │   │   └── UsersPage.jsx       ← Manajemen user
    │   ├── components/
    │   │   ├── dashboard/
    │   │   │   ├── TopBar.jsx      ← Metric bar atas
    │   │   │   ├── StatusPanel.jsx ← Panel status kanan
    │   │   │   └── BottomStrip.jsx ← Uptime + ticker
    │   │   └── topology/
    │   │       └── NetworkTopology.jsx ← Canvas topology
    │   ├── hooks/useWebSocket.js   ← WS hook dengan auto-reconnect
    │   ├── services/api.js         ← Axios API client
    │   └── store/auth.jsx          ← Auth context
    ├── .env.example
    ├── package.json
    └── vite.config.js
```

---

## 🔐 RBAC System

| Feature | Viewer | Admin | Superadmin |
|---------|--------|-------|------------|
| Lihat dashboard | ✓ | ✓ | ✓ |
| Tambah/edit/hapus website | — | ✓ | ✓ |
| Lihat semua user | — | — | ✓ |
| Promosi viewer → admin | — | — | ✓ |
| Demosi admin → viewer | — | — | ✓ |
| Max jumlah | ∞ | **3** | **1** |

---

## 📊 Status Monitoring Logic

Penentuan status **deterministik berdasarkan DNS + HTTP** (lihat `classifyStatus` di `internal/worker/pool.go`). SSL, ICMP, screenshot, dan analisis konten **tidak** lagi memengaruhi status.

| Status | Kondisi | Notif Telegram |
|--------|---------|:---:|
| **ONLINE** | DNS OK + HTTP 200–399 dengan response time **≤ 2000ms**. (HTTP 403/429/503 dengan sidik jari WAF/anti-bot/CAPTCHA juga di-upgrade ke ONLINE.) | hanya saat recovery |
| **WARNING** | HTTP 200–399 tetapi lambat (**> 2000ms** = lambat, **> 5000ms** = sangat lambat), atau HTTP 4xx selain 403. | — (senyap) |
| **CRITICAL** | HTTP 5xx, atau HTTP 403 (Forbidden) **tanpa** tanda WAF/verifikasi manusia. | ✓ |
| **OFFLINE** | DNS gagal, timeout, connection refused/reset, atau tidak ada respons HTTP yang valid. | ✓ |

Ambang **2000ms** mengikuti *2-second rule* (Nielsen/Google/Akamai). **Kelambatan tidak pernah menjadi CRITICAL/OFFLINE** — situs yang masih menjawab = WARNING (degraded), bukan mati. Detail & sumber: lihat [DOCUMENTATION.md](DOCUMENTATION.md) §3.2.

> **Anti-flapping:** status hard-down (OFFLINE/CRITICAL) baru dilaporkan setelah **3 sampel berturut-turut** gagal, agar blip sesaat tidak memicu insiden palsu.
>
> **Notifikasi anti-spam:** Telegram hanya ping saat OFFLINE, CRITICAL, dan recovery ke ONLINE. WARNING senyap. **Eskalasi insiden otomatis dihapus** (dulu mengirim ulang tiap siklus → spam). Email = laporan mingguan terjadwal.

---

## 🏭 Production Build

```bash
# Frontend build
cd frontend && npm run build

# Backend binary
cd backend && go build -o spmt-server cmd/server/main.go
./spmt-server
```

---

## Notes
- WebSocket auto-reconnect setiap 3 detik jika koneksi putus
- Worker pool menggunakan 10 goroutine concurrent
- Interval monitoring minimal 10 detik per website
- Logs tersimpan selamanya di database (pertimbangkan cleanup job untuk production)
