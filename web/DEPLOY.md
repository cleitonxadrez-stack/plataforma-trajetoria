# DEPLOY — Plataforma Trajetória

Data: 2026-08-10. Runbook gerado a partir do que está **no disco** deste repositório
(grep em `lib/`, `src/app/`, `app/api/`, `scripts/`, `middleware.ts`).
12 variáveis de ambiente. 11 migrations (0001 → 0011). 33 testes de domínio.

---

## 0. Pré-requisitos

| Item | Por quê |
|---|---|
| Conta Vercel (Hobby/Pro) | Deploy do Next.js 15 + Cron |
| Projeto Supabase (Postgres 16) | Banco + Auth + Storage |
| Conta Cloudflare R2 | Storage de arquivos |
| `npm` ≥ 10 (vem com Node 20) | `npm ci` |
| `psql` CLI | Aplicar migrations |

---

## 1. Provisionar Postgres no Supabase

1. Crie o projeto em [supabase.com](https://supabase.com). Anote o **Project Ref** (`xxxxxxxxxxxxx`).
2. Em **Project Settings → Database**, copie:
   - `DATABASE_URL` na aba **Transaction pooler** (porta 6543). Formato:
     `postgres://postgres.REF:senha@aws-0-region.pooler.supabase.com:6543/postgres`
3. Em **Project Settings → API**, copie:
   - `NEXT_PUBLIC_SUPABASE_URL` (`https://REF.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Em **Project Settings → Auth → Email Auth**, mantenha `Email` ligado.
   Desative confirmação por e-mail **só em dev** — em prod deixe ligada com
   template de "Confirme seu e-mail" apontando para `NEXT_PUBLIC_SITE_URL`.

---

## 2. Criar buckets R2

Na Cloudflare → R2:

| Bucket | Lifecycle | Finalidade |
|---|---|---|
| `plataforma-frio` | imutável, 0 expiry | originais (`originals/yyyy/mm/dd/...`) |
| `plataforma-quente` | versões otimizadas servidas pela CDN pública |

Em **R2 → Manage R2 API Tokens** crie um token com permissão
`Object Read & Write` nos 2 buckets. Copie:
- `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` — formato `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

---

## 3. Variáveis de ambiente (12 — todas do `.env.example`)

Configure na Vercel (Project Settings → Environment Variables) **em todos os
ambientes** (Production / Preview / Development):

```
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_FRIO
R2_BUCKET_QUENTE
IA_EXTRACTION_API_KEY            (opcional — cascade passo 6)
IA_CLASSIFY_API_KEY              (opcional — parser de edital fallback)
FOLLOWUP_NOTIFY_ENABLED          (false em MVP; ver §4 do código de obs/log)
CRON_SECRET                      (Vercel Cron — §6 abaixo)
```

> ⚠️ `IA_*` ausentes **não impedem** o deploy — a cascata cai no passo 5 (Tesseract)
> ou o parser de edital retorna `status=INSUFICIENTE` exigindo revisão manual.

---

## 4. Migrations

Aplique **em ordem** 0001 → 0011. Cada arquivo é idempotente
(`IF NOT EXISTS`).

```bash
cd web
export DATABASE_URL='postgres://...'
for f in drizzle/*.sql; do
  echo "→ $f"
  psql "$DATABASE_URL" -f "$f" || { echo "FALHOU em $f"; break; }
done
```

Alternativa equivalente — runner Node:
```bash
npx tsx scripts/migrate.ts
```

Sem isso, `ranking_methods`/`ranking_rules`/`dossiers`/`dossier_items`
(`migration/0011`) não existem e `/dossies/*` quebra em runtime.

---

## 5. Seed da metodologia pública

Após migrar, garanta o seed "Trajetória v1" (uma única vez, idempotente):

```bash
DATABASE_URL=... npx tsx scripts/seed-trajetoria-v1.ts
```

Sem o seed, `/dossies/novo` mostra os métodos do próprio usuário mas o
button "Trajetória v1" só funciona se o método público já tiver sido
criado por qualquer signup anterior (via `app/api/dossies/route.ts`
fallback — auto-cria no primeiro uso).

---

## 6. Cron `follow-up-requests`

`vercel.json` declara `crons[0]` rodando em `0 2 * * *` UTC, chamando
`/api/cron/followup-requests`. Configure:

```bash
vercel env add CRON_SECRET
# gera um valor aleatório, ex.: openssl rand -hex 32
```

A action **só persiste se** `FOLLOWUP_NOTIFY_ENABLED=true` — em MVP
fica `false`, então o cron só observa/coleta métricas (`metrics.inc(Schemas.followupSent)`).

---

## 7. Build

Local (opcional, sanity check):
```bash
cd web
npm ci --legacy-peer-deps
npm run typecheck          # tsc --noEmit (deve sair 0)
npm test                   # vitest — esperado 33+/33+
npm run build              # next build
```

Na Vercel: `vercel deploy --prod` após commit do `package-lock.json`.

---

## 8. Smoke test pós-deploy

```bash
./scripts/smoke-deploy.sh https://SEU-DOMINIO.example
```

Espera:
- `/api/health` → `{ok: true, ts, metrics: snapshot}`
- `/verificar/PLT-AAAA-XXXX-XXXX` → 200 + texto de aviso sobre autenticidade
- `/painel` (sem cookie) → 307 → `/entrar?redirect=/painel`

---

## 9. CI secrets (no GitHub)

Em **Settings → Secrets → Actions**, crie:

| Secret | Onde usar |
|---|---|
| `DATABASE_URL` | workflow `migrations` (push main) |
| `TEST_DATABASE_URL` | workflow `test` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | smoke `next start` |

Já configurados em `.github/workflows/ci.yml`. Sem secrets o CI falha na
rotação — secrets ausentes saem amarelo (`::warning::`), não vermelho.

---

## 10. Checklist — pronto para produção

- [ ] 12 env vars configuradas em **Production**
- [ ] 11 migrations aplicadas em ordem, sem erro
- [ ] Seed Trajetória v1 criado (ou auto-criação pelo 1º usuário)
- [ ] `npm run build` exit 0 na Vercel
- [ ] `curl https://dominio/api/health` → ok
- [ ] `curl https://dominio/verificar/PLT-AAAA-XXXX-XXXX` → aviso visível
- [ ] `curl -I https://dominio/painel` → 307 → `/entrar`
- [ ] RLS confirmado: `psql -c "USE authenticated; SET role authenticated; SELECT count(*) FROM trajectories_v1; -- deve dar 0"` (rodar com segundo usuário em janela anônima).
- [ ] Soft-delete: nenhum `DELETE FROM ...` em migrations — todas as exclusões passam por `deleted_at = now()`.
- [ ] Backup automático testado: Supabase → Project Settings → Database → Backups, cron diário, restore testado pelo menos 1 vez.

---

## 11. Próximo passo humano

**Teste de usuário real.** A UX só aparece quando alguém preenche
`/cadastrar` → `/documentos/enviar` → `/trajetoria` → `/dossies/novo`.
Antes de onboarding em massa, convide 1 pesquisador(a) com 5–10 itens reais
do Lattes.
