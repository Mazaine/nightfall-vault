param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$MediaBackupFile,
  [string]$MediaVolume = "nightfall_vault_media",
  [string]$TargetDatabase = "nightfall_vault_restore_test",
  [string]$ComposeService = "postgres",
  [string[]]$ComposeFiles = @("docker-compose.yml"),
  [switch]$UseExistingDatabase,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

function Get-ComposeArgs {
  $args = @("compose")
  foreach ($file in $ComposeFiles) {
    $args += @("-f", $file)
  }
  return $args
}

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
if ($MediaBackupFile -and -not (Test-Path $MediaBackupFile)) {
  throw "Media backup file not found."
}

$composeArgs = Get-ComposeArgs
$containerId = & docker @composeArgs ps -q $ComposeService
if (-not $containerId) {
  throw "Postgres container is not running for service $ComposeService."
}

$containerFile = "/tmp/nightfall-restore.dump"
Invoke-CheckedCommand { docker cp $BackupFile "$containerId`:$containerFile" }
if (-not $UseExistingDatabase) {
  Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "dropdb -U `"`$POSTGRES_USER`" --if-exists `"$TargetDatabase`"" }
  Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "createdb -U `"`$POSTGRES_USER`" `"$TargetDatabase`"" }
} else {
  Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "psql -U `"`$POSTGRES_USER`" -d `"$TargetDatabase`" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'" }
}
Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "pg_restore -U `"`$POSTGRES_USER`" -d `"$TargetDatabase`" --no-owner --exit-on-error $containerFile" }
docker @composeArgs exec -T $ComposeService rm -f $containerFile | Out-Null
if ($MediaBackupFile) {
  if (-not (docker volume ls -q --filter "name=^$MediaVolume`$")) {
    Invoke-CheckedCommand { docker volume create $MediaVolume }
  }
  $mediaDirectory = Split-Path -Parent (Resolve-Path $MediaBackupFile)
  $mediaName = Split-Path -Leaf $MediaBackupFile
  $safetyName = "pre-restore-media-$(Get-Date -Format 'yyyyMMdd-HHmmss').tar.gz"
  Invoke-CheckedCommand { docker run --rm -v "${MediaVolume}:/source:ro" -v "${mediaDirectory}:/backup" postgres:16-alpine tar -czf "/backup/$safetyName" -C /source . }
  Invoke-CheckedCommand { docker run --rm -v "${MediaVolume}:/target" -v "${mediaDirectory}:/backup:ro" postgres:16-alpine sh -c "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf /backup/$mediaName -C /target" }
}
Write-Output "Restore completed into $TargetDatabase on service $ComposeService"
