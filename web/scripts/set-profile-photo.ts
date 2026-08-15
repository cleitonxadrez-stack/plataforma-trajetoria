// scripts/set-profile-photo.ts — define a foto de perfil (categoria FOTO).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { frioKey, putObject } from "../lib/storage/r2";
import { generateRegistryCode, sha256OfBuffer } from "../lib/domain/registry";

const USER_ID = process.env.INGEST_USER_ID as string;
const PATH = "/Users/cleitonmarinosantana/Library/CloudStorage/OneDrive-Pessoal/Imagens/foto cleiton.jpg";
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

async function main() {
  const buf = readFileSync(PATH);
  const sha = sha256OfBuffer(buf);
  let docId: string;
  const ex = await sql`select id from documents where user_id=${USER_ID} and sha256=${sha} and deleted_at is null limit 1`;
  if (ex.length) docId = ex[0].id as string;
  else {
    docId = randomUUID();
    const key = frioKey(docId, "foto-perfil.jpg");
    await putObject({ bucket: "frio", key, body: buf, contentType: "image/jpeg" });
    await sql`insert into documents (id,user_id,original_filename,mime_type,size_original,storage_key_original,sha256,registry_code,ocr_status,processing_status,visibility,has_text_layer)
      values (${docId},${USER_ID},'foto-perfil.jpg','image/jpeg',${buf.length},${key},${sha},${generateRegistryCode()},'PENDENTE','CONFIRMADO','PRIVADO',false)`;
  }
  await sql`delete from personal_documents where user_id=${USER_ID} and category='FOTO'`;
  await sql`insert into personal_documents (user_id,category,label,document_id) values (${USER_ID},'FOTO','Foto de perfil',${docId})`;
  console.log("✓ Foto de perfil definida:", docId);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
