@echo off
rem Stops the PlanetX Atlas background server (port 8765)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:"127.0.0.1:8765 .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
echo PlanetX Atlas stopped.
ping -n 3 127.0.0.1 >nul
