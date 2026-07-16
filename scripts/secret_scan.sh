#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
patterns='(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|sk_live_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|BREVO_API_KEY[[:space:]]*=[[:space:]]*[^$<{[:space:]]{8,}|SECRET_KEY[[:space:]]*=[[:space:]]*[^$<{[:space:]]{16,})'
if git grep -nEI "$patterns" -- ':!*.example' ':!scripts/secret_scan.sh'; then
  echo "Lehetséges titok került a verziókövetett fájlokba." >&2
  exit 1
fi
echo "A titokszkennelés nem talált ismert mintát."
