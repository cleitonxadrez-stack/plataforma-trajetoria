// scripts/import-lattes-local.ts
// Importa um XML do Lattes direto no banco (mesma lógica de /api/lattes/import,
// mas server-side, sem passar pela UI). Idempotente por lattes_dedupe_key.
//
// USO: INGEST_USER_ID=<uuid> npx tsx --env-file=.env scripts/import-lattes-local.ts <arquivo.xml>

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { planLattesImport } from "../lib/domain/lattes-import";
import { decodeXmlBytes } from "../lib/lattes/decode";

const USER_ID = process.env.INGEST_USER_ID;
const xmlPath = process.argv[2];
if (!USER_ID) { console.error("Falta INGEST_USER_ID"); process.exit(1); }
if (!xmlPath) { console.error("Uso: ... import-lattes-local.ts <arquivo.xml>"); process.exit(1); }

const text = decodeXmlBytes(readFileSync(xmlPath));
const plan = planLattesImport(text, USER_ID);
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

async function main() {
  console.log(`Titular: ${plan.fullName ?? "?"} · Lattes ${plan.lattesId ?? "?"}`);
  console.log(`Parse: ${plan.rows.length} itens · ${plan.sensitiveIgnored} campos sensíveis sanitizados · ${plan.categoryFallbackCount} em OUTROS`);

  if (!plan.rows.length) { console.log("Nada a importar."); await sql.end(); return; }

  // Purga opcional dos itens Lattes anteriores (para reimport limpo).
  if (process.env.PURGE_LATTES === "1") {
    const del = await sql`
      update academic_items set deleted_at = now()
      where user_id = ${USER_ID} and origin = 'LATTES' and deleted_at is null`;
    console.log(`Purga: ${del.count} itens Lattes antigos marcados como removidos.`);
  }

  // dedupe idempotente
  const keys = plan.rows.map((r) => r.lattes_dedupe_key);
  const existing = await sql`
    select lattes_dedupe_key from academic_items
    where user_id = ${USER_ID} and deleted_at is null and lattes_dedupe_key in ${sql(keys)}`;
  const pre = new Set(existing.map((e) => e.lattes_dedupe_key as string));
  const toInsert = plan.rows.filter((r) => !pre.has(r.lattes_dedupe_key));
  console.log(`Já existentes (dedupe): ${pre.size} · Novos a inserir: ${toInsert.length}`);

  let n = 0;
  for (const r of toInsert) {
    await sql`
      insert into academic_items
        (user_id, item_type, natureza, title, title_en, year, doi, issn, isbn, origin,
         verification_level, evidence_status, visibility, flagged_innovation, flagged_lattes,
         lattes_dedupe_key, raw_lattes_nature, raw_lattes_id, raw_authors)
      values
        (${USER_ID}, ${r.item_type}, ${r.natureza}, ${r.title}, ${r.title_en}, ${r.year}, ${r.doi}, ${r.issn}, ${r.isbn}, 'LATTES',
         ${r.state}, ${r.evidence_status}, ${r.visibility}, ${r.flagged_innovation}, ${r.flagged_lattes},
         ${r.lattes_dedupe_key}, ${r.raw_lattes_nature}, ${r.raw_lattes_id}, ${JSON.stringify(r.raw_authors)}::jsonb)`;
    n++;
  }

  // distribuição por tipo (diagnóstico)
  const byType = await sql`
    select item_type, count(*)::int c from academic_items
    where user_id = ${USER_ID} and origin = 'LATTES' and deleted_at is null
    group by item_type order by c desc`;
  console.log(`\n✓ Inseridos ${n} itens do Lattes.`);
  console.log("Por tipo:", byType.map((t) => `${t.item_type}:${t.c}`).join("  "));
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
