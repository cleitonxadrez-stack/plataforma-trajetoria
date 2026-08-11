// scripts/seed-trajetoria-v1.ts
// Cria a metodologia pública "Trajetória v1" + 20 regras
// da Plataforma. getDa dos blocos 1–6, é idempotente.
// Necessário se a primeira migration 0011 não criar os seeds.

import postgres from "postgres";
import { TRAJETORIA_V1 } from "../lib/domain/methodology";

const ROOT_URL = process.env.DATABASE_URL;
if (!ROOT_URL) { console.error("DATABASE_URL ausente"); process.exit(2); }

async function main() {
  const sql = postgres(ROOT_URL!, { max: 1, prepare: false });

  // Procura usuário platform@local; se não existir, usa 'system' virtual (sem FK).
  const owner = await sql<{ id: string }[]>`
    SELECT id FROM auth.users WHERE email = 'platform@local' LIMIT 1
  `.catch(() => []);
  const userId = owner?.[0]?.id ?? "00000000-0000-0000-0000-000000000000";

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM ranking_methods WHERE name = ${TRAJETORIA_V1.method.name} AND deleted_at IS NULL LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`[seed] Trajetória v1 já existe (${existing[0]!.id}) — no-op`);
    await sql.end();
    return;
  }

  const method = await sql<{ id: string }[]>`
    INSERT INTO ranking_methods (
      user_id, name, version, scope,
      source_document_id, valid_from, valid_until, window_years, apply_caps,
      coauthor_rule, stratification_enabled, is_public, verified_by_user
    ) VALUES (
      ${userId}, ${TRAJETORIA_V1.method.name}, ${TRAJETORIA_V1.method.version}, ${TRAJETORIA_V1.method.scope},
      NULL, NULL, NULL, NULL, FALSE,
      NULL, FALSE, TRUE, TRUE
    ) RETURNING id
  `;
  const methodId = method[0]!.id;
  console.log(`[seed] method ${methodId} created`);

  for (const r of TRAJETORIA_V1.rules) {
    await sql`
      INSERT INTO ranking_rules (
        method_id, user_id, category_label, item_type, qualis_stratum,
        points, cap_per_year, cap_per_category, cap_total, order_index, conditions
      ) VALUES (
        ${methodId}, ${userId}, ${r.categoryLabel}, ${r.itemType}, ${r.qualisStratum},
        ${r.points}, ${r.capPerYear}, ${r.capPerCategory}, ${r.capTotal}, ${r.orderIndex}, NULL
      )
    `;
  }
  console.log(`[seed] ${TRAJETORIA_V1.rules.length} rules inserted`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
