// db/migrate.ts — aplica migrations SQL em db/migrations/ na ordem.
// Uso:  SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npx tsx db/migrate.ts
//
// Executa com chave service-role porque bypassa RLS.
// Em produção, rodar apenas em CI com segredo dedicado.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const sql = postgres(url, { max: 1, prepare: false });

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function applied(): Promise<Set<string>> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM _migrations`;
  return new Set(rows.map(r => r.name));
}

async function run() {
  await ensureMigrationsTable();
  const done = await applied();
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) {
      console.log(`✓ ${f} (já aplicada)`);
      continue;
    }
    const content = readFileSync(join(dir, f), "utf8");
    console.log(`→ aplicando ${f} ...`);
    await sql.unsafe(content);
    await sql`INSERT INTO _migrations (name) VALUES (${f})`;
    console.log(`✓ ${f}`);
  }
  console.log("\nMigrations concluídas.");
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
