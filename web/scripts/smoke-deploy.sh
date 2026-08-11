#!/usr/bin/env bash
# scripts/smoke-deploy.sh
# Verifica se o deploy respondeu os endpoints críticos.
# Uso:  ./scripts/smoke-deploy.sh https://app.example.com
set -euo pipefail
URL="${1:-${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}}"

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; }

echo "→ GET /api/health/alive (liveness puro, sempre 200)"
code=$(curl -sS -o /tmp/alive.json -w "%{http_code}" "$URL/api/health/alive")
[[ "$code" == "200" ]] && pass "200" || { fail "esperava 200, recebeu $code"; exit 1; }

echo "→ GET /api/health (métricas + ts)"
code=$(curl -fsS -o /tmp/health.json -w "%{http_code}" "$URL/api/health" || true)
[[ "$code" == "200" ]] && pass "200" || { fail "esperava 200, recebeu $code"; exit 1; }
python3 -c 'import json; d=json.load(open("/tmp/health.json")); print(f"  ok={d.get(\"ok\")} ts={d.get(\"ts\")}")'

echo "→ GET /api/health?ready=1 (Supabase + R2 healthy)"
code=$(curl -sS -o /tmp/ready.json -w "%{http_code}" "$URL/api/health?ready=1" || true)
if [[ "$code" == "200" ]]; then
  pass "200 — dependências OK"
  python3 -c 'import json; d=json.load(open("/tmp/ready.json")); print("  ", json.dumps(d.get("checks", {}), indent=2))'
else
  fail "recebeu $code — prováveis causas: (a) buckets R2 sem permissão do token; (b) Supabase URL/anon key erradas"
  cat /tmp/ready.json || true
  echo
  echo "  → ações:"
  echo "    1. rode localmente: npx tsx scripts/check-r2.ts"
  echo "    2. rode localmente: curl $URL/api/health?ready=1 para inspecionar os checks"
  exit 1
fi

echo "→ GET / (landing — espera HTML público)"
code=$(curl -fsS -o /dev/null -w "%{http_code}" "$URL" || true)
[[ "$code" == "200" ]] && pass "200" || { fail "esperava 200, recebeu $code"; exit 1; }

echo "→ GET /verificar/PLT-AAAA-XXXX-XXXX (espera 200 com aviso de autenticidade)"
code=$(curl -sS -o /tmp/verify.html -w "%{http_code}" "$URL/verificar/PLT-AAAA-XXXX-XXXX" || true)
if [[ "$code" == "200" ]]; then
  if grep -q "atestar\|autenticidade" /tmp/verify.html 2>/dev/null; then
    pass "200 + aviso de autenticidade presente"
  else
    fail "200 mas aviso de autenticidade AUSENTE — corrigir texto em src/app/verificar/[codigo]/page.tsx"
    exit 1
  fi
else
  fail "rota /verificar não existe ainda (status=$code) — esperado no Item #3 da planilha"
fi

echo "→ GET /painel sem sessão (espera redirect 307 → /entrar)"
out=$(curl -sS -o /dev/null -w "%{http_code}|%{redirect_url}" "$URL/painel" || true)
code="${out%%|*}"
loc="${out#*|}"
[[ "$code" == "307" || "$code" == "302" ]] && pass "redirect $code → $loc" \
  || fail "esperava 307/302, recebeu $code"

echo "Smoke OK."
