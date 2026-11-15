# Reinstalls PlanetX Atlas from scratch in this folder (Windows, PowerShell 5.1+).
# Requirements: Python 3.11+ and Node.js 20+ on PATH.
# Usage:  powershell -ExecutionPolicy Bypass -File .\install.ps1 [-SkipData]
param([switch]$SkipData)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1/5 Python environment (.venv)"
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Write-Host "2/5 Frontend (npm install + build)"
Push-Location frontend
npm install
npm run build
Pop-Location

if (-not $SkipData) {
  Write-Host "3/5 Full orbital catalog (JPL SBDB, ~60 MB)"
  .\.venv\Scripts\python.exe backend\scripts\build_orbit_catalog.py
  Write-Host "4/5 Demo cases with real SPHEREx data (several minutes)"
  Push-Location backend
  ..\.venv\Scripts\python.exe scripts\precache_demo.py
  Pop-Location
}

Write-Host "5/5 Tests"
Push-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Pop-Location
Write-Host "Done. Run PlanetX-Atlas.bat"
