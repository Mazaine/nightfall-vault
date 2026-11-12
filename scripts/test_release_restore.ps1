# Local postgres-test only. Does not invoke any production restore or partner API.
$ErrorActionPreference = 'Stop'
$releaseProofPrefix = 'nightfall_release_' + [guid]::NewGuid().ToString('N').Substring(0,12)
$releaseProofRoot = Split-Path -Parent $PSScriptRoot
Push-Location $releaseProofRoot
function Invoke-ProofCommand([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw 'Isolated restore proof failed' }
}
try {
  Invoke-ProofCommand { docker compose exec -T backend python -m scripts.prove_release_restore setup $releaseProofPrefix }
  $releaseSourceDb = $releaseProofPrefix + '_source_test'
  $releaseRestoreDb = $releaseProofPrefix + '_restore_test'
  $releaseDumpPath = '/tmp/' + $releaseProofPrefix + '.dump'
  Invoke-ProofCommand { docker compose exec -T postgres-test sh -c 'pg_dump -U "$POSTGRES_USER" -d "$1" -Fc -f "$2"' sh $releaseSourceDb $releaseDumpPath }
  Invoke-ProofCommand { docker compose exec -T postgres-test sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1" "$2"' sh $releaseRestoreDb $releaseDumpPath }
  Invoke-ProofCommand { docker compose exec -T backend python -m scripts.prove_release_restore verify $releaseProofPrefix }
} finally {
  if ($releaseDumpPath) { docker compose exec -T postgres-test rm -f $releaseDumpPath }
  docker compose exec -T backend python -m scripts.prove_release_restore cleanup $releaseProofPrefix
  Pop-Location
}
