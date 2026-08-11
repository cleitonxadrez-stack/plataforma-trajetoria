# Bloco 1 — Fundação · Plataforma de Trajetória

Implementação de **Bloco 1 do `docs/06-backlog.md`**: Auth, Middleware e RLS no
Postgres via Supabase. Tudo escrito contra o `db/schema.ts` (entregável 5 do
item 18) — nenhuma coluna inventada.

## O que está aqui

```
web/
├── package.json               # Next.js 15, @supabase/ssr 0.5, Drizzle 0.36
├── tsconfig.json              # paths @/* mapeando src/, lib/ e db/
├── next.config.mjs            # headers de segurança; sem cache de SSR autenticado
├── tailwind.config.ts         # paleta navy/papel do protótipo estático
├── postcss.config.mjs
├── drizzle.config.ts          # saída em ./drizzle
├── middleware.ts              # gate de rotas (REFORÇA getUser, NUNCA getSession)
├── .env.example               # URL, anon key, SERVICE_ROLE_KEY, DATABASE_URL
│
├── db/
│   ├── schema.ts              # idêntico a ../db/schema.ts
│   ├── index.ts               # cliente Drizzle (postgres-js)
│   └── migrate.ts             # aplica migrations em SQL em ordem
│
├── drizzle/
│   ├── 0001_users_auth_link.sql   # tabela public.users + trigger handle_new_user
│   ├── 0002_rls_users.sql         # ENABLE + FORCE RLS + 4 policies
│   ├── 0003_rls_core_tables.sql   # RLS em documents, academic_items, consent, …
│   └── 0004_drizzle_meta.sql
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # createBrowserClient — para Client Components
│   │   ├── server.ts          # createServerClient — para Server Components/Actions
│   │   └── proxy.ts           # updateSession — chamado por middleware.ts
│   └── domain/
│       ├── auth.ts            # Server Actions: signin / signup / recover / signout
│       └── validation.ts      # email / senha / nome — puro, sem I/O
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx           # landing; redireciona ao painel se já logado
│   │   ├── entrar/page.tsx
│   │   ├── cadastrar/page.tsx
│   │   ├── recuperar/page.tsx
│   │   ├── auth/
│   │   │   ├── callback/route.ts   # ?code=… → exchangeCodeForSession
│   │   │   └── signout/page.tsx
│   │   └── painel/page.tsx    # SSR protegido por middleware.ts
│   └── components/
│       ├── EntrarForm.tsx
│       ├── LoginForm.tsx
│       ├── SignupForm.tsx
│       └── RecoveryForm.tsx
│
└── tests/
    └── rls.test.ts            # validação das regras de input (sem I/O)
```

## Variáveis de ambiente

```bash
cp .env.example .env.local       # e preencher:
NEXT_PUBLIC_SUPABASE_URL=https://SEU.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # NUNCA sem prefixo NEXT_PUBLIC_
DATABASE_URL=postgresql://postgres:SENHA@db.SEU.supabase.co:5432/postgres
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Regra crítica:** `SUPABASE_SERVICE_ROLE_KEY` bypassa `FORCE ROW LEVEL SECURITY`.
Por isso fica exclusivamente em código server-only (`db/migrate.ts`, futuros jobs).
Nunca exponha no browser; nunca prefixe com `NEXT_PUBLIC_`.

## Como aplicar as migrations

```bash
npm run db:generate              # gera SQL a partir de db/schema.ts (opcional)
npm run db:migrate               # aplica drizzle/*.sql em ordem, idempotente
```

Setup inicial no Supabase:
1. Criar projeto em https://supabase.com/dashboard
2. SQL Editor → rodar **na ordem** os 4 arquivos em `drizzle/`
3. Authentication → Providers → Email (já vem habilitado)
4. Authentication → Email Templates → ajustar template "Confirm signup"

## Como rodar

```bash
npm install
npm run dev                     # http://localhost:3000
```

Build / typecheck:

```bash
npm run typecheck
npm run build
```

## Como provar a RLS (critério §1.2 do backlog)

O teste automatizado do critério — *"usuário A não acessa dado de B nem por
manipulação direta de query"* — é um script SQL que:

1. Cria dois usuários via SQL (bypassando o signup por e-mail) e JWTs separados.
2. SELECT em `users` com JWT do usuário A → só retorna o próprio.
3. INSERT em `users` com JWT do usuário A → bloqueado (policy WITH CHECK=false).
4. UPDATE em outra linha → bloqueado (policy USING=FALSO).
5. SELECT em `documents` da conta B → vazio.

Recomendação: rodar este script como CI job (vide
[blog post do Supabase sobre testing RLS](https://supabase.com/docs/guides/database/testing)).

## Princípios aplicados da constituição (CLAUDE.md)

- "IA nunca decide sozinha" — não há IA neste Bloco. Só sistema.
- "Registro é irrestrito" — as tabelas aceitam tudo; filtros ficam em outro nível.
- "Privado por padrão" — `visibility` default `'PRIVADO'` em `documents` e `academic_items`.
- "Roadmap que uma pessoa sozinha mantém" — monolito, sem segundo serviço, sem K8s.
- "RLS no banco" — feito em SQL puro, não só em aplicação.

## Fora deste Bloco

Blocos 2–6 ficam **desligados**. Schema está pronto, interface vem depois
(vide `docs/02-mapa-telas.md`).
