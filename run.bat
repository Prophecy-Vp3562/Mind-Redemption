@echo off
title Mind Redemption Launcher
cd /d "%~dp0"

echo ===================================================
echo             Mind Redemption Launcher
echo ===================================================
echo.

echo Cleaning up any previous server instances...
taskkill /fi "WINDOWTITLE eq Mind Redemption Backend*" /f /t >nul 2>&1
taskkill /fi "WINDOWTITLE eq Mind Redemption Frontend*" /f /t >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [1/3] Starting Backend Companion Server (Port 8000)...
start "Mind Redemption Backend" python server.py

echo [2/3] Waiting for backend initialization...
ping 127.0.0.1 -n 3 >nul

echo [3/3] Starting Frontend Web Server with Live Updates (Port 3000)...
start "Mind Redemption Frontend" python frontend_server.py 3000

ping 127.0.0.1 -n 2 >nul

echo.
echo Launching Mind Redemption in your default browser...
start http://localhost:3000

echo.
echo ===================================================
echo  Mind Redemption is now running!
echo  - Frontend: http://localhost:3000
echo  - Backend:  http://127.0.0.1:8000
echo  - Note: Live updates enabled (no-cache active)
echo  - To stop:  Run stop.bat
echo ===================================================
echo.
pause
