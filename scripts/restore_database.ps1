param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$TargetDatabase = "nightfall_vault_restore_test",
  [string]$ComposeService = "postgres",
  [string[]]$ComposeFiles = @("docker-compose.yml"),
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

$composeArgs = Get-ComposeArgs
$containerId = & docker @composeArgs ps -q $ComposeService
if (-not $containerId) {
  throw "Postgres container is not running for service $ComposeService."
}

$containerFile = "/tmp/nightfall-restore.dump"
Invoke-CheckedCommand { docker cp $BackupFile "$containerId`:$containerFile" }
Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "dropdb -U `"`$POSTGRES_USER`" --if-exists `"$TargetDatabase`"" }
Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "createdb -U `"`$POSTGRES_USER`" `"$TargetDatabase`"" }
Invoke-CheckedCommand { & docker @composeArgs exec -T $ComposeService sh -c "pg_restore -U `"`$POSTGRES_USER`" -d `"$TargetDatabase`" --clean --if-exists --no-owner $containerFile" }
docker @composeArgs exec -T $ComposeService rm -f $containerFile | Out-Null
Write-Output "Restore completed into $TargetDatabase on service $ComposeService"
