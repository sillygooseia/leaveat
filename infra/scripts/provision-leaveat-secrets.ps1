<#
.SYNOPSIS
    Creates or updates the Kubernetes secrets for the LeaveAt deployment.

.DESCRIPTION
    Reads secrets from secrets/leaveat.json (gitignored).
        Creates four secrets in the leaveat namespace:
      leaveat-postgres-secret   POSTGRES_PASSWORD, DATABASE_URL
            leaveat-redis-secret      REDIS_PASSWORD, REDIS_URL
      leaveat-backend-secret    LICENSE_PUBLIC_KEY
            leaveat-license-secret    PRIVATE_KEY_PEM, PUBLIC_KEY_PEM, optional Lemon Squeezy credentials

    Uses kubectl dry-run | apply for idempotency - safe to re-run after
    password rotations or on a fresh cluster.

.EXAMPLE
    .\\infra\\scripts\\provision-leaveat-secrets.ps1
#>

$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$SecretsFile = Join-Path $RepoRoot "secrets\leaveat.json"
$Namespace   = "leaveat"
$ReleaseName = "leaveat"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [ok] $msg" -ForegroundColor Green }
function Die($msg)  { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $SecretsFile)) {
    Die "secrets/leaveat.json not found.`nCopy secrets/leaveat.example.json -> secrets/leaveat.json and fill in real values."
}

$secrets = Get-Content $SecretsFile -Raw | ConvertFrom-Json

if (-not $secrets.postgresPassword) { Die "postgresPassword is missing or empty in secrets/leaveat.json" }
if (-not $secrets.redisPassword) { Die "redisPassword is missing or empty in secrets/leaveat.json" }
if (-not $secrets.licensePrivateKey) { Die "licensePrivateKey is missing or empty in secrets/leaveat.json" }
if (-not $secrets.licensePublicKey) { Die "licensePublicKey is missing or empty in secrets/leaveat.json" }

function Apply-Secret($name, [hashtable]$data) {
    [string[]]$literals = @($data.GetEnumerator() | ForEach-Object { "--from-literal=$($_.Key)=$($_.Value)" })
    $applyArgs = @("create", "secret", "generic", $name, "-n", $Namespace) + $literals + @("--dry-run=client", "-o", "yaml")
    $yaml = & kubectl @applyArgs 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to render secret $name : $yaml" }
    $yaml | kubectl apply -f - 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to apply secret $name" }
    Ok "$Namespace/$name"
}

# Ensure namespace exists
Step "Ensuring namespace '$Namespace' exists"
kubectl get namespace $Namespace --no-headers 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Namespace '$Namespace' not found - creating it" -ForegroundColor Yellow
    kubectl create namespace $Namespace | Out-Null
}

$pgUser = "leaveat"
$pgDb   = "leaveat"
$dbUrl  = "postgresql://${pgUser}:$($secrets.postgresPassword)@${ReleaseName}-postgres:5432/${pgDb}"
$redisUrl = "redis://:$($secrets.redisPassword)@${ReleaseName}-redis:6379"

Step "Provisioning leaveat secrets"

Apply-Secret "$ReleaseName-postgres-secret" @{
    POSTGRES_PASSWORD = $secrets.postgresPassword
    DATABASE_URL      = $dbUrl
}

Apply-Secret "$ReleaseName-redis-secret" @{
    REDIS_PASSWORD = $secrets.redisPassword
    REDIS_URL      = $redisUrl
}

# LICENSE_PUBLIC_KEY and the license service key pair are multiline PEM values -
# write them to temp files and use --from-file so line breaks are preserved.
$tmpPublicKey = [System.IO.Path]::GetTempFileName()
$tmpPrivateKey = [System.IO.Path]::GetTempFileName()
try {
    # Normalise \n escapes in case the JSON was written with literal \n strings
    $publicKeyContent = $secrets.licensePublicKey -replace '\\n', "`n"
    $privateKeyContent = $secrets.licensePrivateKey -replace '\\n', "`n"
    Set-Content -Path $tmpPublicKey -Value $publicKeyContent -NoNewline
    Set-Content -Path $tmpPrivateKey -Value $privateKeyContent -NoNewline

    $backendSecretArgs = @(
        'create', 'secret', 'generic', "$ReleaseName-backend-secret",
        '-n', $Namespace,
        "--from-file=LICENSE_PUBLIC_KEY=$tmpPublicKey"
    )
    if ($secrets.smtpHost)   { $backendSecretArgs += "--from-literal=SMTP_HOST=$($secrets.smtpHost)" }
    if ($secrets.smtpPort)   { $backendSecretArgs += "--from-literal=SMTP_PORT=$($secrets.smtpPort)" }
    if ($secrets.smtpSecure) { $backendSecretArgs += "--from-literal=SMTP_SECURE=$($secrets.smtpSecure)" }
    if ($secrets.smtpUser)   { $backendSecretArgs += "--from-literal=SMTP_USER=$($secrets.smtpUser)" }
    if ($secrets.smtpPass)   { $backendSecretArgs += "--from-literal=SMTP_PASS=$($secrets.smtpPass)" }
    if ($secrets.mailFrom)   { $backendSecretArgs += "--from-literal=MAIL_FROM=$($secrets.mailFrom)" }
    if ($secrets.mailNotify) { $backendSecretArgs += "--from-literal=MAIL_NOTIFY=$($secrets.mailNotify)" }
    $backendSecretArgs += @('--dry-run=client', '-o', 'yaml')
    $yaml = & kubectl @backendSecretArgs 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to render secret $ReleaseName-backend-secret : $yaml" }
    $yaml | kubectl apply -f - 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to apply secret $ReleaseName-backend-secret" }
    Ok "$Namespace/$ReleaseName-backend-secret"

    $licenseSecretArgs = @(
        'create', 'secret', 'generic', "$ReleaseName-license-secret",
        '-n', $Namespace,
        "--from-file=PRIVATE_KEY_PEM=$tmpPrivateKey",
        "--from-file=PUBLIC_KEY_PEM=$tmpPublicKey"
    )

    if ($null -ne $secrets.lemonSqueezyApiKey) {
        $licenseSecretArgs += "--from-literal=LEMONSQUEEZY_API_KEY=$($secrets.lemonSqueezyApiKey)"
    }
    if ($null -ne $secrets.lemonSqueezyStoreId) {
        $licenseSecretArgs += "--from-literal=LEMONSQUEEZY_STORE_ID=$($secrets.lemonSqueezyStoreId)"
    }
    if ($null -ne $secrets.lemonSqueezyVariantId) {
        $licenseSecretArgs += "--from-literal=LEMONSQUEEZY_VARIANT_ID=$($secrets.lemonSqueezyVariantId)"
    }
    if ($null -ne $secrets.lemonSqueezyWebhookSecret) {
        $licenseSecretArgs += "--from-literal=LEMONSQUEEZY_WEBHOOK_SECRET=$($secrets.lemonSqueezyWebhookSecret)"
    }
    if ($secrets.smtpHost)     { $licenseSecretArgs += "--from-literal=SMTP_HOST=$($secrets.smtpHost)" }
    if ($secrets.smtpPort)     { $licenseSecretArgs += "--from-literal=SMTP_PORT=$($secrets.smtpPort)" }
    if ($secrets.smtpSecure)   { $licenseSecretArgs += "--from-literal=SMTP_SECURE=$($secrets.smtpSecure)" }
    if ($secrets.smtpUser)     { $licenseSecretArgs += "--from-literal=SMTP_USER=$($secrets.smtpUser)" }
    if ($secrets.smtpPass)     { $licenseSecretArgs += "--from-literal=SMTP_PASS=$($secrets.smtpPass)" }
    if ($secrets.mailFrom)     { $licenseSecretArgs += "--from-literal=MAIL_FROM=$($secrets.mailFrom)" }
    if ($secrets.mailNotify)   { $licenseSecretArgs += "--from-literal=MAIL_NOTIFY=$($secrets.mailNotify)" }

    $licenseSecretArgs += @('--dry-run=client', '-o', 'yaml')
    $yaml = & kubectl @licenseSecretArgs 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to render secret $ReleaseName-license-secret : $yaml" }
    $yaml | kubectl apply -f - 2>&1
    if ($LASTEXITCODE -ne 0) { Die "Failed to apply secret $ReleaseName-license-secret" }
    Ok "$Namespace/$ReleaseName-license-secret"
} finally {
    Remove-Item $tmpPublicKey -ErrorAction SilentlyContinue
    Remove-Item $tmpPrivateKey -ErrorAction SilentlyContinue
}

Step "Restarting workloads to load new secrets"
kubectl -n $Namespace rollout restart deployment/$ReleaseName-backend 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [warn] Backend deployment may not exist yet - skipping restart" -ForegroundColor Yellow
} else {
    Ok "backend restarted"
}

kubectl -n $Namespace rollout restart deployment/$ReleaseName-license 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [warn] License deployment may not exist yet - skipping restart" -ForegroundColor Yellow
} else {
    Ok "license restarted"
}

kubectl -n $Namespace rollout restart statefulset/$ReleaseName-postgres 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [warn] Postgres statefulset may not exist yet - skipping restart" -ForegroundColor Yellow
} else {
    Ok "postgres restarted"
}

kubectl -n $Namespace rollout restart statefulset/$ReleaseName-redis 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [warn] Redis statefulset may not exist yet - skipping restart" -ForegroundColor Yellow
} else {
    Ok "redis restarted"
}

Write-Host "`nAll LeaveAt secrets provisioned." -ForegroundColor Green
Write-Host "Tip: re-run this script any time you rotate secrets in secrets/leaveat.json" -ForegroundColor DarkGray
