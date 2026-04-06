# SPMT Website Monitoring Control Panel
**Enterprise-grade NOC Dashboard | Dark Mode | Real-time WebSocket**

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
psql -U postgres -c "CREATE DATABASE monitoring_db;"

# Jalankan migration
psql -U postgres -d spmt_monitoring -f backend/migrations/001_init.sql
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
# DB_NAME=monitoring_db
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

| Status | Kondisi |
|--------|---------|
| **ONLINE** | HTTP 200-399 + RT < 3000ms + DNS OK + SSL OK |
| **CRITICAL** | HTTP 500-599 OR RT > 5000ms OR SSL invalid |
| **OFFLINE** | DNS gagal OR timeout OR connection refused |

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
