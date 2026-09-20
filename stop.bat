@echo off
title Mind Redemption Shutdown
cd /d "%~dp0"

echo ===================================================
echo             Mind Redemption Shutdown
echo ===================================================
echo.

echo Stopping Mind Redemption services...

:: Terminate background processes by window title
taskkill /fi "WINDOWTITLE eq Mind Redemption Backend*" /f /t >nul 2>&1
taskkill /fi "WINDOWTITLE eq Mind Redemption Frontend*" /f /t >nul 2>&1

:: Terminate any processes listening on port 8000 (Backend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Terminate any processes listening on port 3000 (Frontend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo ===================================================
echo  Mind Redemption servers have stopped cleanly.
echo  - Port 8000 (Backend):  Terminated
echo  - Port 3000 (Frontend): Terminated
echo ===================================================
echo.
ping 127.0.0.1 -n 3 >nul
