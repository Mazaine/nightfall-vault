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

function Invoke-CheckedCommand {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

$containerId = docker compose ps -q $ComposeService
if (-not $containerId) {
  throw "Postgres container is not running."
}

try {
  Invoke-CheckedCommand { docker compose exec -T $ComposeService sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --file=$containerFile" }
  Invoke-CheckedCommand { docker cp "$containerId`:$containerFile" $hostFile }
} finally {
  docker compose exec -T $ComposeService rm -f $containerFile 2>$null | Out-Null
}

if (-not (Test-Path $hostFile) -or (Get-Item $hostFile).Length -eq 0) {
  throw "Backup file was not created or is empty."
}
Write-Output $hostFile
