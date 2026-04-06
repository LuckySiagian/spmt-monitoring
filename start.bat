@echo off
REM SPMT Monitoring — Windows Launcher
echo.
echo ==========================================================
echo   SPMT MONITORING SYSTEM — Starting...
echo ==========================================================
echo.

REM Ambil IP lokal
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set LOCAL_IP=%%a
  goto :gotip
)
:gotip
set LOCAL_IP=%LOCAL_IP: =%

echo [1/2] Starting Backend (Go) on port 8080...
cd backend
start "SPMT Backend" cmd /k "go run cmd/server/main.go"
cd ..

echo Waiting 4 seconds for backend...
timeout /t 4 /nobreak >nul

cd frontend
if not exist node_modules (
  echo Installing frontend dependencies...
  npm install
)

echo.
echo [2/2] Starting Frontend (Vite) on port 5173...
echo.
echo ──────────────────────────────────────────────────────────
echo   Lokal          : http://localhost:5173
echo   LAN (device lain) : http://%LOCAL_IP%:5173
echo ──────────────────────────────────────────────────────────
echo.
echo   Dari HP/laptop lain: buka http://%LOCAL_IP%:5173
echo.

start "SPMT Frontend" cmd /k "set VITE_API_URL=&& npm run dev -- --host 0.0.0.0"
cd ..

echo Kedua service sudah jalan. Tutup window CMD masing-masing untuk stop.
pause
