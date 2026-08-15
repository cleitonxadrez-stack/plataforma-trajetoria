// scripts/attach-pos-certs.ts — anexa certificados (PDF local) como evidência
// de itens de formação existentes, elevando-os a DOCUMENTADO/COMPROVADO.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { frioKey, putObject } from "../lib/storage/r2";
import { generateRegistryCode, sha256OfBuffer } from "../lib/domain/registry";

const USER_ID = process.env.INGEST_USER_ID as string;
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

const MAP = [
  { path: "/Users/cleitonmarinosantana/Downloads/Cleiton Marino Santana-4.pdf", filename: "cert-especializacao-metodologias-ativas-faipe-2023.pdf", itemId: "42edd3e6-cd7e-475d-a291-51e265bafade" },
  { path: "/Users/cleitonmarinosantana/Downloads/Cleiton Marino Santana-5.pdf", filename: "cert-especializacao-ia-pratica-docente-faipe-2025.pdf", itemId: "4b1f068c-6bf4-4dbb-9ca8-d927e57a9ad9" },
];

async function main() {
  for (const m of MAP) {
    const buf = readFileSync(m.path);
    const sha = sha256OfBuffer(buf);
    let docId: string;
    const ex = await sql`select id from documents where user_id=${USER_ID} and sha256=${sha} and deleted_at is null limit 1`;
    if (ex.length) docId = ex[0].id as string;
    else {
      docId = randomUUID();
      const key = frioKey(docId, m.filename);
      await putObject({ bucket: "frio", key, body: buf, contentType: "application/pdf" });
      await sql`insert into documents (id,user_id,original_filename,mime_type,size_original,storage_key_original,sha256,registry_code,ocr_status,processing_status,visibility,has_text_layer)
        values (${docId},${USER_ID},${m.filename},'application/pdf',${buf.length},${key},${sha},${generateRegistryCode()},'PENDENTE','CONFIRMADO','PRIVADO',false)`;
    }
    await sql`insert into evidences (user_id,item_id,document_id,role,confidence)
      values (${USER_ID},${m.itemId},${docId},'PRIMARY',0.95)
      on conflict (item_id,document_id) do nothing`;
    await sql`update academic_items set verification_level='DOCUMENTADO', evidence_status='COMPROVADO', updated_at=now() where id=${m.itemId} and user_id=${USER_ID}`;
    console.log("✓ anexado + DOCUMENTADO:", m.filename);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
