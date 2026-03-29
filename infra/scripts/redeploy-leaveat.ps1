#!/usr/bin/env pwsh
# LeaveAt Redeploy Script
# Builds, pushes, and deploys backend, license, and/or frontend Docker images.
#
# Usage:
#   .\infra\scripts\redeploy-leaveat.ps1                   # redeploy all services with auto-versioned tag
#   .\infra\scripts\redeploy-leaveat.ps1 -Tag v2          # redeploy all services with explicit tag
#   .\infra\scripts\redeploy-leaveat.ps1 -Backend         # backend only
#   .\infra\scripts\redeploy-leaveat.ps1 -License         # license service only
#   .\infra\scripts\redeploy-leaveat.ps1 -Frontend        # frontend only
#   .\infra\scripts\redeploy-leaveat.ps1 -Backend -Tag v3 # backend only, explicit tag

param(
    [string]$Tag = "",
    [switch]$Backend,
    [switch]$License,
    [switch]$Frontend,
    [string]$Registry = "silentcoil.sillygooseia.com:5000",
    [string]$Namespace = "leaveat",
    [string]$ReleaseName = "leaveat"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$HelmChartPath = Join-Path $RepoRoot "infra/helm/leaveat"
$HelmValuesPath = Join-Path $HelmChartPath "values.yaml"
$BackendPath = Join-Path $RepoRoot "backend"
$LicensePath = Join-Path $RepoRoot "license"
$FrontendPath = Join-Path $RepoRoot "frontend"

# Default: all if no specific flags are given
if (-not $Backend -and -not $License -and -not $Frontend) {
    $Backend = $true
    $License = $true
    $Frontend = $true
}

# Auto-generate tag from timestamp if not supplied
if ($Tag -eq "") {
    $Tag = "v$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}

Write-Host ""
Write-Host "=== LeaveAt Redeploy ===" -ForegroundColor Cyan
Write-Host "  Tag       : $Tag" -ForegroundColor Gray
Write-Host "  Registry  : $Registry" -ForegroundColor Gray
Write-Host "  Backend   : $Backend" -ForegroundColor Gray
Write-Host "  License   : $License" -ForegroundColor Gray
Write-Host "  Frontend  : $Frontend" -ForegroundColor Gray
Write-Host ""

function Invoke-Step {
    param([string]$Label, [scriptblock]$ScriptBlock)
    Write-Host "--> $Label" -ForegroundColor Yellow
    & $ScriptBlock
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Label (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "    OK" -ForegroundColor Green
}

function Get-StatefulSetServiceName {
    param(
        [string]$Namespace,
        [string]$Name
    )

    $serviceName = & kubectl -n $Namespace get statefulset $Name -o jsonpath='{.spec.serviceName}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return "$serviceName".Trim()
}

function Remove-StatefulSetForMigrationIfNeeded {
    param(
        [string]$Namespace,
        [string]$Name,
        [string]$ExpectedServiceName
    )

    $currentServiceName = Get-StatefulSetServiceName -Namespace $Namespace -Name $Name
    if ([string]::IsNullOrWhiteSpace($currentServiceName)) {
        return
    }

    if ($currentServiceName -eq $ExpectedServiceName) {
        return
    }

    Write-Host "    Migrating StatefulSet $Name from service '$currentServiceName' to '$ExpectedServiceName'" -ForegroundColor DarkYellow
    & kubectl -n $Namespace delete statefulset $Name --wait=true
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: Delete StatefulSet $Name for migration (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$helmArgs = @(
    "upgrade", "--install", $ReleaseName, $HelmChartPath,
    "-n", $Namespace,
    "--create-namespace",
    "-f", $HelmValuesPath
)

# ---- Backend ----
if ($Backend) {
    $backendImage = "$Registry/leaveat/backend:$Tag"

    Invoke-Step "Build backend image ($backendImage)" {
        docker build -t $backendImage $BackendPath
    }

    Invoke-Step "Push backend image" {
        docker push $backendImage
    }

    $helmArgs += @("--set", "backend.image.repository=$Registry/leaveat/backend", "--set", "backend.image.tag=$Tag")
}

# ---- License ----
if ($License) {
    $licenseImage = "$Registry/leaveat/license:$Tag"

    Invoke-Step "Build license image ($licenseImage)" {
        docker build -t $licenseImage $LicensePath
    }

    Invoke-Step "Push license image" {
        docker push $licenseImage
    }

    $helmArgs += @("--set", "license.image.repository=$Registry/leaveat/license", "--set", "license.image.tag=$Tag")
}

# ---- Frontend ----
if ($Frontend) {
    $frontendImage = "$Registry/leaveat/frontend:$Tag"

    Invoke-Step "Build frontend image ($frontendImage)" {
        docker build -t $frontendImage $FrontendPath
    }

    Invoke-Step "Push frontend image" {
        docker push $frontendImage
    }

    $helmArgs += @("--set", "frontend.image.repository=$Registry/leaveat/frontend", "--set", "frontend.image.tag=$Tag")
}

# ---- Helm upgrade ----
Invoke-Step "Prepare StatefulSet migration" {
    Remove-StatefulSetForMigrationIfNeeded -Namespace $Namespace -Name "$ReleaseName-postgres" -ExpectedServiceName "$ReleaseName-postgres-headless"
    Remove-StatefulSetForMigrationIfNeeded -Namespace $Namespace -Name "$ReleaseName-redis" -ExpectedServiceName "$ReleaseName-redis-headless"
}

Invoke-Step "Helm upgrade ($ReleaseName @ $Namespace)" {
    & helm @helmArgs
}

Write-Host ""
Write-Host "=== Deploy complete: tag $Tag ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify:" -ForegroundColor White
Write-Host "  kubectl -n $Namespace get pods" -ForegroundColor Gray
Write-Host "  kubectl -n $Namespace rollout status deployment/leaveat-backend" -ForegroundColor Gray
Write-Host "  kubectl -n $Namespace rollout status deployment/bafgo-leaveat-license" -ForegroundColor Gray
Write-Host "  kubectl -n $Namespace rollout status deployment/leaveat-frontend" -ForegroundColor Gray
