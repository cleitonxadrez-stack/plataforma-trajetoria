// lib/domain/actions/upload.ts
// Server action que registra um documento novo.
//
// CHAIN (preserve esta ordem):
//   1. valida MIME + tamanho (validação client-side complementar)
//   2. verifica cota com `bump_quota()` atômico (Postgres)
//   3. detecta duplicata (sha256 → SELECT em documents)
//   4. salva original em R2 frio   (prefixo yyyy/mm/dd/<doc_id>)
//   5. cria linha em `documents`   (registry_code = PLT-AAAA-XXXX-XXXX)
//   6. enfileira job `extract-cascade` em pg-boss
//   7. retorna PLT para UI mostrar

"use server";

import { createClient } from "@/lib/supabase/server";
import { ACCEPTED_MIME, MAX_BYTES, sha256OfBuffer } from "@/lib/domain/registry";
import { frioKey, putObject } from "@/lib/storage/r2";
import { enqueue } from "@/lib/queue/pgboss";
import { generateRegistryCode } from "@/lib/domain/registry";

export type UploadResult =
  | { ok: true; documentId: string; registryCode: string; status: "NOVO" | "DUPLICADO"; sha256: string }
  | { ok: false; error: string };

export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  // ── 1. garantir auth ──────────────────────────────────────────
  const supabase = await createClient();
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) return { ok: false, error: "Não autenticado." };
  const userId = userData.user.id;

  // ── 2. leitura e validação do File (Web) ──────────────────────
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Arquivo ausente." };
  if (!ACCEPTED_MIME.has(file.type)) {
    return { ok: false, error: `Tipo não suportado: ${file.type}. Aceitos: PDF, JPG, PNG, HEIC, TIFF, DOC/DOCX.` };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "Arquivo acima de 50 MB." };

  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = sha256OfBuffer(buf);

  // ── 3. dedupe por hash ────────────────────────────────────────
  const { data: dup } = await supabase
    .from("documents")
    .select("id, registry_code")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .is("deleted_at", null)
    .maybeSingle();
  if (dup) {
    return { ok: true, documentId: dup.id, registryCode: dup.registry_code, status: "DUPLICADO", sha256 };
  }

  // ── 4. cota — `bump_quota` no Postgres faz check atômico ──────
  const { data: quota, error: quotaErr } = await supabase.rpc("bump_quota", {
    p_user_id: userId, p_delta: 1,
  });
  if (quotaErr) return { ok: false, error: quotaErr.message };
  // Postgres retorna um row com used, limit_count — se used > limit, rollback manual.
  const row = Array.isArray(quota) ? quota[0] : quota;
  if ((row?.used ?? 0) > (row?.limit_count ?? 500)) {
    return { ok: false, error: `Cota do plano excedida (${row?.used ?? "?"}/${row?.limit_count ?? 500}). Faça upgrade ou remova documentos.` };
  }

  // ── 5. criar linha primeiro — RLS escreve só se user_id==auth.uid()
  const registryCode = generateRegistryCode();
  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      original_filename: file.name,
      mime_type: file.type,
      size_original: file.size,
      storage_key_original: "",     // preenchido após upload R2
      sha256,
      registry_code: registryCode,
      processing_status: "FILA",
      ocr_status: "PENDENTE",
      visibility: "PRIVADO",
    })
    .select("id")
    .single();
  if (insertErr || !doc) return { ok: false, error: insertErr?.message ?? "Falha ao registrar documento." };

  // ── 6. upload em R2 frio ──────────────────────────────────────
  const key = frioKey(doc.id, file.name);
  await putObject({
    bucket: "frio", key, body: buf, contentType: file.type,
  });
  await supabase.from("documents").update({ storage_key_original: key }).eq("id", doc.id);

  // ── 7. enfileira cascata (best-effort) ────────────────────────
  // O documento JÁ está salvo (R2 + linha em `documents`). O enfileiramento
  // é para o worker de extração — se o pg-boss não estiver disponível (ex.:
  // pooler sem sessão, worker offline), NÃO derrubamos o upload: o documento
  // fica em `FILA` e pode ser reprocessado depois. Timeout para nunca pendurar.
  try {
    await Promise.race([
      enqueue("extract-cascade", { documentId: doc.id, userId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue-timeout")), 5000)),
    ]);
  } catch (e) {
    console.warn(`[upload] enqueue falhou (documento ${doc.id} salvo mesmo assim):`, (e as Error).message);
  }

  return { ok: true, documentId: doc.id, registryCode, status: "NOVO", sha256 };
}
