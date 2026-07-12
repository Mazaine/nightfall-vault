param(
  [string]$OutputDir = "backups",
  [string]$ComposeService = "postgres"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$fileName = "nightfall-vault-$timestamp.dump"
$containerFile = "/tmp/$fileName"
$hostFile = Join-Path $backupDir $fileName

$containerId = docker compose ps -q $ComposeService
if (-not $containerId) {
  throw "Postgres container is not running."
}

docker compose exec -T $ComposeService sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --file=$containerFile"
docker cp "$containerId`:$containerFile" $hostFile
docker compose exec -T $ComposeService rm -f $containerFile | Out-Null
Write-Output $hostFile
