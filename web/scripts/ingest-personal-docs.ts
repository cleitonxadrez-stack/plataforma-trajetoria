// scripts/ingest-personal-docs.ts
// Ingere documentos PESSOAIS (arquivos locais) no cofre privado do usuário:
// R2 (frio) + documents + personal_documents (categorizados). Dedup por sha256.
// USO: INGEST_USER_ID=<uuid> npx tsx --env-file=.env scripts/ingest-personal-docs.ts

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { frioKey, putObject } from "../lib/storage/r2";
import { generateRegistryCode, sha256OfBuffer } from "../lib/domain/registry";

const USER_ID = process.env.INGEST_USER_ID;
if (!USER_ID) { console.error("Falta INGEST_USER_ID"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

const DOCS_DIR = "/Users/cleitonmarinosantana/Library/CloudStorage/OneDrive-Pessoal/Documentos/";
interface Entry { path: string; category: string; label: string }
const ENTRIES: Entry[] = [
  { path: "DOCUCMENTOS PESSOASIS/01-4.pdf", category: "IDENTIDADE", label: "RG — Registro Geral" },
  { path: "DOCUCMENTOS PESSOASIS/2. CNH-e.pdf", category: "IDENTIDADE", label: "CNH — Carteira de Habilitação" },
  { path: "DOCUCMENTOS PESSOASIS/casamento.pdf", category: "IDENTIDADE", label: "Certidão de Casamento" },
  { path: "DOCUCMENTOS PESSOASIS/09_03.pdf", category: "IDENTIDADE", label: "Comprovante de endereço (Energisa)" },
  { path: "Declarações de Imposto de Renda/2025/04465948905-IRPF-2026-2025-retif-imagem-declaracao.pdf", category: "IMPOSTO_RENDA", label: "Imposto de Renda 2025 — Declaração" },
  { path: "Declarações de Imposto de Renda/2025/04465948905-IRPF-2026-2025-retif-imagem-recibo.pdf", category: "IMPOSTO_RENDA", label: "Imposto de Renda 2025 — Recibo" },
  { path: "Armas/CR.pdf", category: "ARMAS", label: "Certificado de Registro de Arma (CR)" },
  { path: "Armas/G3c/Guia_de_Trafego(27).pdf", category: "ARMAS", label: "Guia de Tráfego" },
  { path: "Armas/tx22/SINAR.pdf", category: "ARMAS", label: "SINAR" },
  { path: "Armas/tx22/51210604140099000188550010000561191005294053-nfe.pdf", category: "ARMAS", label: "Nota Fiscal — Pistola Taurus TX22" },
];

async function main() {
  await sql.unsafe(`
    create table if not exists public.personal_documents (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      category text not null,
      label text not null,
      document_id uuid not null references public.documents(id) on delete cascade,
      created_at timestamptz not null default now()
    );
    alter table public.personal_documents enable row level security;
    drop policy if exists personal_documents_owner on public.personal_documents;
    create policy personal_documents_owner on public.personal_documents
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  `);

  let created = 0, skipped = 0;
  for (const e of ENTRIES) {
    const filename = e.path.split("/").pop() as string;
    const buf = readFileSync(DOCS_DIR + e.path);
    const sha = sha256OfBuffer(buf);

    // já existe esse doc pessoal (por label)?
    const exPd = await sql`select id from personal_documents where user_id = ${USER_ID} and label = ${e.label} limit 1`;
    if (exPd.length) { skipped++; console.log("• SKIP (já existe):", e.label); continue; }

    // reusa documento se bytes idênticos
    let docId: string;
    const exDoc = await sql`select id from documents where user_id = ${USER_ID} and sha256 = ${sha} and deleted_at is null limit 1`;
    if (exDoc.length) {
      docId = exDoc[0].id as string;
    } else {
      docId = randomUUID();
      const key = frioKey(docId, filename);
      await putObject({ bucket: "frio", key, body: buf, contentType: "application/pdf" });
      await sql`
        insert into documents
          (id, user_id, original_filename, mime_type, size_original, storage_key_original,
           sha256, registry_code, ocr_status, processing_status, visibility, has_text_layer)
        values
          (${docId}, ${USER_ID}, ${filename}, 'application/pdf', ${buf.length}, ${key},
           ${sha}, ${generateRegistryCode()}, 'PENDENTE', 'CONFIRMADO', 'PRIVADO', false)`;
    }

    await sql`insert into personal_documents (user_id, category, label, document_id)
      values (${USER_ID}, ${e.category}, ${e.label}, ${docId})`;
    created++;
    console.log(`✓ ${e.category.padEnd(13)} ${e.label}`);
  }
  console.log(`\n── ${created} criados · ${skipped} pulados`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
