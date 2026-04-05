# AI by zb
param(
    [string]$Image = "ghcr.io/simple199589-maker/outlook-mail-station:latest",
    [int]$Port = 8015,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Error "docker command not found. Please install Docker first."
    exit 1
}

$envFile = Join-Path $root ".env"
$composeFile = Join-Path $root "docker-compose.ghcr.yml"
$dataDir = Join-Path $root "data"

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

$adminPassword = $env:OUTLOOK_MAIL_STATION_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    $adminPassword = "admin-" + ([guid]::NewGuid().ToString("N").Substring(0, 12))
}

$jwtBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Fill($jwtBytes)
$defaultJwtSecret = [Convert]::ToHexString($jwtBytes).ToLowerInvariant()

$apiKeyBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Fill($apiKeyBytes)
$defaultApiKey = [Convert]::ToHexString($apiKeyBytes).ToLowerInvariant()

$adminJwtSecret = $env:OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET
if ([string]::IsNullOrWhiteSpace($adminJwtSecret)) {
    $adminJwtSecret = $defaultJwtSecret
}

$openApiKey = $env:OUTLOOK_MAIL_STATION_OPEN_API_KEY
if ([string]::IsNullOrWhiteSpace($openApiKey)) {
    $openApiKey = $defaultApiKey
}

$openApiBearer = $env:OUTLOOK_MAIL_STATION_OPEN_API_BEARER
if ($null -eq $openApiBearer) {
    $openApiBearer = ""
}

if ((-not (Test-Path -LiteralPath $envFile)) -or $Force) {
    $envContent = @"
OUTLOOK_MAIL_STATION_DB=sqlite:////app/data/outlook_mail_station.db
OUTLOOK_MAIL_STATION_ADMIN_PASSWORD=$adminPassword
OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET=$adminJwtSecret
OUTLOOK_MAIL_STATION_OPEN_API_KEY=$openApiKey
OUTLOOK_MAIL_STATION_OPEN_API_BEARER=$openApiBearer
OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS=60
OUTLOOK_MAIL_STATION_OPEN_API_LEASE_SECONDS=1800
OUTLOOK_MAIL_STATION_AUTO_REFRESH=10
"@
    Set-Content -Path $envFile -Value $envContent
    $createdEnv = $true
}
else {
    $createdEnv = $false
}

if ((-not (Test-Path -LiteralPath $composeFile)) -or $Force) {
    $composeContent = @"
services:
  app:
    image: $Image
    container_name: outlook-mail-station
    restart: unless-stopped
    ports:
      - "$Port`:8015"
    env_file:
      - .env
    environment:
      OUTLOOK_MAIL_STATION_DB: sqlite:////app/data/outlook_mail_station.db
    volumes:
      - ./data:/app/data
"@
    Set-Content -Path $composeFile -Value $composeContent
    $createdCompose = $true
}
else {
    $createdCompose = $false
}

Write-Host "[INFO] Deploy root: $root"
Write-Host "[INFO] Pulling image: $Image"
& $docker.Source pull $Image

Write-Host "[INFO] Starting container..."
& $docker.Source compose -f $composeFile up -d

Write-Host "[INFO] Deployment completed."
Write-Host "[INFO] URL: http://localhost:$Port"
Write-Host "[INFO] Data dir: $dataDir"

if ($createdEnv) {
    Write-Host "[INFO] Created .env with generated defaults."
    Write-Host "[INFO] Admin password: $adminPassword"
    Write-Host "[INFO] Open API key: $openApiKey"
}
else {
    Write-Host "[INFO] Reused existing .env"
}

if ($createdCompose) {
    Write-Host "[INFO] Created docker-compose.ghcr.yml"
}
else {
    Write-Host "[INFO] Reused existing docker-compose.ghcr.yml"
}
