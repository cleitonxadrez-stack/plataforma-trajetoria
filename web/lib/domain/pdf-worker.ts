// lib/domain/pdf-worker.ts
// Wrapper do job `pdf-generate`. Puxa o dossiê do banco, chama o
// construtor de árvore (lib/domain/pdf-dossier) e renderiza o PDF (lazy).
// Persiste o resultado em `dossiers.pdf_storage_key` (quente) + atualiza
// `pdf_generated_at` para que a UI saiba que está pronto.

import { createClient } from "@/lib/supabase/server";
import { putObject, quenteKey, getR2Config } from "@/lib/storage/r2";
import { rankItemsAgainstMethod } from "./dossier";
import { TRAJETORIA_V1 } from "./methodology";
import { buildPdfDocument, renderDossier } from "./pdf-dossier";
import { log } from "../observability/log";

export interface PdfJobPayload {
  dossierId: string;
  userId: string;
}

export async function processPdfGenerate(input: PdfJobPayload): Promise<{
  ok: true | false;
  dossierId: string;
  storageKey?: string;
  mimeType?: string;
  warning?: string;
  error?: string;
}> {
  const sb = await createClient();
  const { data: dossier, error: ed } = await sb.from("dossiers")
    .select("id, title, purpose, method_id")
    .eq("id", input.dossierId)
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (ed || !dossier) {
    return { ok: false, dossierId: input.dossierId, error: "dossier-not-found" };
  }
  const dr = dossier as { id: string; title: string; purpose: string | null; method_id: string };

  const { data: items } = await sb.from("academic_items")
    .select("id, title, year, item_type, evidence_status")
    .eq("user_id", input.userId)
    .is("deleted_at", null);
  const lite = (items ?? []).map((i: any) => ({
    id: i.id,
    itemType: (i.item_type as string) ?? "OUTRO",
    title: (i.title as string) ?? "",
    year: (i.year as number | null) ?? null,
    qualis: null,
    authorCount: 1,
    evidenceStatus: (((i.evidence_status as string) ?? "COMPROVADO").toUpperCase().startsWith("COMPROVADO")
      ? "COMPROVADO"
      : "SEM_COMPROVANTE") as "COMPROVADO" | "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL",
  }));
  const ranked = rankItemsAgainstMethod(lite, TRAJETORIA_V1).ranked;
  const tree = buildPdfDocument({
    meta: {
      id: dr.id, title: dr.title, purpose: dr.purpose,
      methodName: TRAJETORIA_V1.name!, methodVersion: TRAJETORIA_V1.version!,
      generatedAt: new Date().toISOString(),
    },
    categories: TRAJETORIA_V1.categories ?? [],
    ranked,
  });

  const rendered = await renderDossier(tree);

  if (rendered.engine !== "@react-pdf/renderer") {
    log({ level: "warn", scope: "pdf-generate", event: "placeholder", msg: rendered.warning ?? "renderer ausente" });
    return { ok: true, dossierId: dr.id, mimeType: rendered.mimeType, warning: rendered.warning };
  }

  const key = quenteKey(dr.id, "dossie.pdf");
  try {
    await putObject({ bucket: "quente", key, body: rendered.bytes, contentType: "application/pdf" });
  } catch (e) {
    return {
      ok: false, dossierId: dr.id, error: `r2 put falhou: ${(e as Error).message?.slice(0, 80)}`,
    };
  }

  await sb.from("dossiers").update({
    pdf_storage_key: key,
    pdf_generated_at: new Date().toISOString(),
    status: "PRONTO",
  }).eq("id", dr.id);

  log({ level: "info", scope: "pdf-generate", event: "done", msg: `dossierId=${dr.id} bytes=${rendered.bytes.length}` });
  return { ok: true, dossierId: dr.id, storageKey: key, mimeType: "application/pdf" };
}

/** Re-export para o caller que quiser verificar config sem decorar. */
export const _cfg = () => { try { return getR2Config(); } catch { return null; } };
