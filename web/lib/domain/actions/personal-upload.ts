// lib/domain/actions/personal-upload.ts
// Server action: envia um documento pessoal ao cofre (R2 frio) e registra em
// documents + personal_documents. FOTO/ASSINATURA são únicos (substituem).

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sha256OfBuffer, generateRegistryCode } from "@/lib/domain/registry";
import { frioKey, putObject } from "@/lib/storage/r2";

const ACCEPTED = new Set([
  "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export type UploadResult = { ok: true } | { ok: false; error: string };

export async function uploadPersonalDoc(formData: FormData): Promise<UploadResult> {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Não autenticado." };

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "OUTROS");
  let label = String(formData.get("label") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Arquivo ausente." };
  if (!ACCEPTED.has(file.type)) return { ok: false, error: `Tipo não suportado: ${file.type || "?"}. Use PDF, JPG ou PNG.` };
  if (file.size > MAX_BYTES) return { ok: false, error: "Arquivo acima de 25 MB." };
  if (!label) label = file.name;

  const buf = Buffer.from(await file.arrayBuffer());
  const sha = sha256OfBuffer(buf);

  // reusa documento se bytes idênticos
  const { data: ex } = await sb.from("documents")
    .select("id").eq("user_id", u.user.id).eq("sha256", sha).is("deleted_at", null).maybeSingle<{ id: string }>();
  let docId = ex?.id;
  if (!docId) {
    docId = randomUUID();
    const key = frioKey(docId, file.name);
    await putObject({ bucket: "frio", key, body: buf, contentType: file.type });
    const { error } = await sb.from("documents").insert({
      id: docId, user_id: u.user.id, original_filename: file.name, mime_type: file.type,
      size_original: file.size, storage_key_original: key, sha256: sha,
      registry_code: generateRegistryCode(), ocr_status: "PENDENTE",
      processing_status: "CONFIRMADO", visibility: "PRIVADO", has_text_layer: false,
    });
    if (error) return { ok: false, error: error.message };
  }

  // FOTO e ASSINATURA são únicos: remove o anterior
  if (category === "FOTO" || category === "ASSINATURA") {
    await sb.from("personal_documents").delete().eq("user_id", u.user.id).eq("category", category);
  }

  const { error: pe } = await sb.from("personal_documents")
    .insert({ user_id: u.user.id, category, label, document_id: docId });
  if (pe) return { ok: false, error: pe.message };

  revalidatePath("/exportar/dados");
  revalidatePath("/exportar/curriculo");
  return { ok: true };
}
