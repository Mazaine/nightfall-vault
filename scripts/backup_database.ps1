param(
  [string]$OutputDir = "backups",
  [string]$ComposeService = "postgres",
  [string]$MediaVolume = "nightfall_vault_media",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$root = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $root $OutputDir
$backupSet = Join-Path $backupRoot "nightfall-vault-$timestamp"
New-Item -ItemType Directory -Force -Path $backupSet | Out-Null
$databaseFile = Join-Path $backupSet "database.dump"
$mediaFile = Join-Path $backupSet "media.tar.gz"
$containerFile = "/tmp/nightfall-$timestamp.dump"

function Invoke-CheckedCommand {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

$containerId = docker compose ps -q $ComposeService
if (-not $containerId) { throw "Postgres container is not running." }
if (-not (docker volume ls -q --filter "name=^$MediaVolume`$")) { throw "Media volume $MediaVolume does not exist." }

try {
  Invoke-CheckedCommand { docker compose exec -T $ComposeService sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --file=$containerFile" }
  Invoke-CheckedCommand { docker cp "$containerId`:$containerFile" $databaseFile }
  Invoke-CheckedCommand { docker run --rm -v "${MediaVolume}:/source:ro" -v "${backupSet}:/backup" postgres:16-alpine tar -czf /backup/media.tar.gz -C /source . }
} finally {
  docker compose exec -T $ComposeService rm -f $containerFile 2>$null | Out-Null
}

if (-not (Test-Path $databaseFile) -or (Get-Item $databaseFile).Length -eq 0) { throw "Database backup is missing or empty." }
if (-not (Test-Path $mediaFile) -or (Get-Item $mediaFile).Length -eq 0) { throw "Media backup is missing or empty." }

@{
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  database = "database.dump"
  media = "media.tar.gz"
  media_volume = $MediaVolume
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $backupSet "manifest.json")

Get-ChildItem -Path $backupRoot -Directory -Filter "nightfall-vault-*" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Recurse -Force

Write-Output $backupSet
