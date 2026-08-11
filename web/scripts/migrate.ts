// scripts/migrate.ts
// Runner idempotente: aplica 0001 → 0011 em ordem. Cada arquivo tem
// CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS etc — gravar
// migrations por cima é seguro.
//
// Uso:
//   DATABASE_URL=... npx tsx scripts/migrate.ts
//   Vercel "build": roda Drizzle Kit automaticamente
//   Local:        npm run db:migrate

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const ROOT_URL = process.env.DATABASE_URL;
if (!ROOT_URL) {
  console.error("[migrate] DATABASE_URL não definida");
  process.exit(2);
}

async function main() {
  const dir = join(process.cwd(), "drizzle");
  const all = (await readdir(dir)).filter((f) => /\.sql$/i.test(f)).sort();
  const rootUrl = process.env.DATABASE_URL;
  if (!rootUrl) {
    console.error("[migrate] DATABASE_URL sumiu entre o check inicial e o main; abortando");
    process.exit(2);
  }
  const sql = postgres(rootUrl, { max: 1, prepare: false });

  console.log(`[migrate] DATABASE_URL=${maskUrl(rootUrl)}`);
  console.log(`[migrate] applying ${all.length} file(s)…`);

  for (const file of all) {
    const path = join(dir, file);
    const txt = await readFile(path, "utf8");
    const t0 = Date.now();
    try {
      await sql.unsafe(txt);
      console.log(`  ✓ ${file} (${Date.now() - t0}ms)`);
    } catch (err) {
      console.error(`  ✗ ${file} — ${String(err)}`);
      await sql.end();
      process.exit(1);
    }
  }
  await sql.end();
  console.log("[migrate] done");
}

function maskUrl(u: string): string {
  return u.replace(/:[^:@]+@/, ":***@");
}

main().catch((e) => {
  console.error("[migrate] abort:", e);
  process.exit(1);
});
