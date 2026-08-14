// scripts/ingest-drive.ts
// Ingestão em lote de comprovações do Google Drive → plataforma Trajetória360.
//
// FLUXO (por entrada do manifesto):
//   1. dedupe idempotente por lattes_dedupe_key = "DRIVE:<fileId>"  → re-run seguro
//   2. baixa os bytes DIRETO do link público do Drive (curl uc?export=download)
//   3. dedupe de bytes por sha256 (reusa documento se já existir)
//   4. sobe original no R2 frio
//   5. cria documents (CONFIRMADO) + academic_items (DOCUMENTADO/COMPROVADO) + evidences
//
// A extração de metadados é feita pelo Claude (lendo cada PDF, inclusive OCR) e
// entregue via manifesto JSON — não depende de worker/OCR local.
//
// USO:  INGEST_USER_ID=<uuid> npx tsx --env-file=.env scripts/ingest-drive.ts caminho/para/manifest.json

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { frioKey, putObject } from "../lib/storage/r2";
import { generateRegistryCode, sha256OfBuffer } from "../lib/domain/registry";

interface Entry {
  driveId: string;
  filename: string;
  itemType: "ARTIGO" | "CAPITULO" | "CERTIFICADO" | "DIPLOMA" | "CAPA_FICHA" | "OUTROS";
  title: string;
  year: number | null;
  natureza: string | null;
  note: string | null;
  /** texto OCR/lido — opcional, guardado em documents.extracted_text */
  text?: string | null;
}

const USER_ID = process.env.INGEST_USER_ID;
const manifestPath = process.argv[2];
if (!USER_ID) { console.error("Falta INGEST_USER_ID"); process.exit(1); }
if (!manifestPath) { console.error("Uso: ... ingest-drive.ts <manifest.json>"); process.exit(1); }

const entries: Entry[] = JSON.parse(readFileSync(manifestPath, "utf8"));
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

function download(driveId: string): Buffer {
  const tmp = `/tmp/ingest-${driveId}.pdf`;
  execFileSync("curl", ["-sL", "--max-time", "120",
    `https://drive.google.com/uc?export=download&id=${driveId}`, "-o", tmp], { stdio: "ignore" });
  const buf = readFileSync(tmp);
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("não é PDF (Drive retornou: " +
      buf.subarray(0, 40).toString("latin1").replace(/\s+/g, " ") + "…)");
  }
  return buf;
}

async function main() {
  let created = 0, skipped = 0, failed = 0;
  for (const e of entries) {
    const dedupeKey = "DRIVE:" + e.driveId;
    try {
      const dup = await sql`
        select id from academic_items
        where user_id = ${USER_ID} and lattes_dedupe_key = ${dedupeKey} and deleted_at is null
        limit 1`;
      if (dup.length) { skipped++; console.log("• SKIP (já existe):", e.filename); continue; }

      const buf = download(e.driveId);
      const sha = sha256OfBuffer(buf);

      // reusa documento se bytes idênticos já existem
      let docId: string;
      const exDoc = await sql`
        select id from documents
        where user_id = ${USER_ID} and sha256 = ${sha} and deleted_at is null limit 1`;
      if (exDoc.length) {
        docId = exDoc[0].id as string;
      } else {
        docId = randomUUID();
        const key = frioKey(docId, e.filename);
        await putObject({ bucket: "frio", key, body: buf, contentType: "application/pdf" });
        await sql`
          insert into documents
            (id, user_id, original_filename, mime_type, size_original, storage_key_original,
             sha256, registry_code, ocr_status, processing_status, visibility, has_text_layer, extracted_text)
          values
            (${docId}, ${USER_ID}, ${e.filename}, 'application/pdf', ${buf.length}, ${key},
             ${sha}, ${generateRegistryCode()}, 'CONCLUIDO', 'CONFIRMADO', 'PRIVADO', true, ${e.text ?? null})`;
      }

      const itemId = randomUUID();
      await sql`
        insert into academic_items
          (id, user_id, item_type, natureza, title, year, origin,
           verification_level, evidence_status, visibility, lattes_dedupe_key)
        values
          (${itemId}, ${USER_ID}, ${e.itemType}, ${e.natureza}, ${e.title}, ${e.year}, 'DRIVE',
           'DOCUMENTADO', 'COMPROVADO', 'PRIVADO', ${dedupeKey})`;

      await sql`
        insert into evidences (user_id, item_id, document_id, role, confidence, notes)
        values (${USER_ID}, ${itemId}, ${docId}, 'PRIMARY', 0.95, ${e.note ?? null})`;

      created++;
      console.log(`✓ ${e.itemType.padEnd(11)} ${String(e.year ?? "----")}  ${e.title.slice(0, 62)}`);
    } catch (err) {
      failed++;
      console.error("✗ FALHA:", e.filename, "→", (err as Error).message);
    }
  }
  console.log(`\n── RESUMO ── ${created} criados · ${skipped} pulados · ${failed} falhas`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
