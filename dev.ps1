#!/usr/bin/env pwsh
# LeaveAt — local development launcher
#
# Usage:
#   .\dev.ps1           # start everything
#   .\dev.ps1 -Stop     # stop Docker infra and exit
#
# What it does:
#   1. Starts Postgres + Redis via docker compose (if not already running)
#   2. Opens three new terminals: backend (3000), license (3001), frontend (4201)
#
# Prerequisites:
#   - Docker Desktop running
#   - npm install run in backend/, license/, and frontend/  (or: npm run install:all)

param(
    [switch]$Stop
)

$Root = $PSScriptRoot

# ── Ensure NPM_TOKEN is set (needed for npm install of @bafgo scoped packages) ─
if (-not $env:NPM_TOKEN) {
    try {
        $r = Invoke-RestMethod -Uri "https://npm.sillygooseia.com/-/user/org.couchdb.user:admin" `
            -Method Put -ContentType "application/json" `
            -Body '{"name":"admin","password":"sillygooseia-Ddsd@2020!"}' -ErrorAction Stop
        $env:NPM_TOKEN = $r.token
        Write-Host "  npm registry auth OK" -ForegroundColor DarkGray
    } catch {
        Write-Host '  [warn] Could not get NPM_TOKEN - npm install of @bafgo packages may fail' -ForegroundColor Yellow
    }
}

if ($Stop) {
    Write-Host "Stopping LeaveAt docker infra..." -ForegroundColor Yellow
    Set-Location $Root
    docker compose down
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

# ── 1. Docker infra ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== LeaveAt Dev ===" -ForegroundColor Cyan

$running = docker compose -f "$Root\docker-compose.yml" ps --status running --quiet 2>$null
if ($running) {
    Write-Host "  Docker infra already running" -ForegroundColor DarkGray
} else {
    Write-Host "  Starting Postgres + Redis..." -ForegroundColor Yellow
    docker compose -f "$Root\docker-compose.yml" up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: docker compose failed" -ForegroundColor Red
        exit 1
    }

    # Wait for Postgres to be ready
    Write-Host "  Waiting for Postgres..." -ForegroundColor DarkGray
    $retries = 0
    do {
        Start-Sleep -Seconds 1
        $retries++
        $ready = docker compose -f "$Root\docker-compose.yml" exec -T postgres pg_isready -U leaveat 2>$null
    } while ($LASTEXITCODE -ne 0 -and $retries -lt 20)

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Postgres did not become ready in time" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Postgres ready" -ForegroundColor Green
}

# ── 2. Open service terminals ────────────────────────────────────────────────
$backendCmd  = "cd `"$Root\backend`"; `$env:PORT=3002; npm run dev"
$licenseCmd  = "cd `"$Root\license`"; npm run dev"
$frontendCmd = "cd `"$Root\frontend`"; npm start"

Write-Host "  Launching backend  -> http://localhost:3002" -ForegroundColor Gray
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Write-Host "  Launching license  -> http://localhost:3003" -ForegroundColor Gray
Start-Process powershell -ArgumentList "-NoExit", "-Command", $licenseCmd

Write-Host "  Launching frontend -> http://localhost:4201" -ForegroundColor Gray
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "All services starting. Press Ctrl+C in each terminal to stop them." -ForegroundColor Cyan
Write-Host 'To stop Docker infra: .\dev.ps1 -Stop' -ForegroundColor DarkGray
Write-Host ""
