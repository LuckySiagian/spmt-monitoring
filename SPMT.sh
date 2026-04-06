#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SPMT Monitoring — One-command launcher
# Usage: ./start.sh
# ─────────────────────────────────────────────────────────────────
set -e

# Deteksi IP lokal otomatis
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || echo "your-local-ip")
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         SPMT MONITORING SYSTEM — Starting...             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Start backend
echo "▶  [1/2] Starting Backend (Go) — port 8080 ..."
cd backend
go run cmd/server/main.go &
BACKEND_PID=$!
cd ..

# Tunggu backend ready
echo "⏳ Waiting for backend to be ready..."
for i in $(seq 1 10); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Backend ready!"
    break
  fi
  sleep 1
done

# Install frontend deps jika belum
cd frontend
if [ ! -d "node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  npm install --silent
fi

echo ""
echo "▶  [2/2] Starting Frontend (Vite) — port 5173 ..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🖥️   Lokal (PC ini)  : http://localhost:5173"
echo "  🌐   LAN (device lain): http://${LOCAL_IP}:5173"
echo "  🔧   Backend API     : http://${LOCAL_IP}:8080"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  💡 Dari HP/laptop lain: buka http://${LOCAL_IP}:5173"
echo "  ⌨️   Ctrl+C untuk stop semua"
echo ""

# Stop semua proses saat Ctrl+C
trap "echo ''; echo '⏹  Stopping all services...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

# Jalankan frontend dengan host 0.0.0.0
VITE_API_URL="" npm run dev -- --host 0.0.0.0
