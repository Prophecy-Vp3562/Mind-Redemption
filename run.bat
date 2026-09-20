@echo off
title Mind Redemption Launcher
cd /d "%~dp0"

echo ===================================================
echo             Mind Redemption Launcher
echo ===================================================
echo.

echo [1/3] Starting Backend Companion Server (Port 8000)...
start "Mind Redemption Backend" /min python server.py

echo [2/3] Waiting for backend initialization...
ping 127.0.0.1 -n 3 >nul

echo [3/3] Starting Frontend Web Server (Port 3000)...
start "Mind Redemption Frontend" /min python -m http.server 3000

ping 127.0.0.1 -n 2 >nul

echo.
echo Launching Mind Redemption in your default browser...
start http://localhost:3000

echo.
echo ===================================================
echo  Mind Redemption is now running!
echo  - Frontend: http://localhost:3000
echo  - Backend:  http://127.0.0.1:8000
echo  - To stop:  Run stop.bat
echo ===================================================
echo.
pause
