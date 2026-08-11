#!/usr/bin/env bash
# scripts/schedule-compute-indicators.sh
# Dispara o batch compute-indicators via cron. Idempotente.
set -euo pipefail
BASE="${CRON_BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-dev-secret}"
curl -sS -X POST -H "Authorization: Bearer ${SECRET}" \
  "${BASE}/api/cron/compute-indicators" \
  | tee /dev/stderr \
  | grep -q '"ok":true' && exit 0
exit 1
