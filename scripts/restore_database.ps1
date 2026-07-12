param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$TargetDatabase = "nightfall_vault_restore_test",
  [string]$ComposeService = "postgres",
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

if (-not $ConfirmRestore) {
  throw "Pass -ConfirmRestore to run restore. Use a separate test database for validation."
}
if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found."
}

$containerId = docker compose ps -q $ComposeService
if (-not $containerId) {
  throw "Postgres container is not running."
}

$containerFile = "/tmp/nightfall-restore.dump"
Invoke-CheckedCommand { docker cp $BackupFile "$containerId`:$containerFile" }
Invoke-CheckedCommand { docker compose exec -T $ComposeService sh -c "dropdb -U `"`$POSTGRES_USER`" --if-exists `"$TargetDatabase`"" }
Invoke-CheckedCommand { docker compose exec -T $ComposeService sh -c "createdb -U `"`$POSTGRES_USER`" `"$TargetDatabase`"" }
Invoke-CheckedCommand { docker compose exec -T $ComposeService sh -c "pg_restore -U `"`$POSTGRES_USER`" -d `"$TargetDatabase`" --clean --if-exists $containerFile" }
docker compose exec -T $ComposeService rm -f $containerFile | Out-Null
Write-Output "Restore completed into $TargetDatabase"
