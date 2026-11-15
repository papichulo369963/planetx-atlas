@echo off
rem Starts PlanetX Atlas in the background (no window) and opens http://127.0.0.1:8765
rem To stop it, run Stop-PlanetX-Atlas.bat
cd /d "%~dp0backend"
start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0backend\run_server.py"
