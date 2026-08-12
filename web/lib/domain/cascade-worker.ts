// lib/domain/cascade-worker.ts
// Wrapper do extract-cascade que o worker chama. Faz cache do buffer em
// R2 frio (já enviado pelo flow), parse + atualiza `documents.extracted_*`
// e enfileira o passo seguinte (template learning) se aplicável.
//
// Para a Sprint 0/2, essa função é uma casca que **executa a cascata real**
// em memória e devolve os campos extraídos. Persistência fica em
// `document_extractions` — registrada como `OK` ou `FAILED`.

import { eq } from "drizzle-orm";
import { runCascade } from "./cascade";
import type { ExtractedFields, CascadeOutput } from "./cascade";
import { log } from "../observability/log";
import { db } from "../../db";
import { documents } from "../../db/schema";
import { getObject } from "../storage/r2";

export interface ExtractCascadeResult {
  documentId: string;
  fields: Partial<ExtractedFields>;
  steps: CascadeOutput["steps"];
  totalCostCents: number;
  usedAI: boolean;
  status: "OK" | "FAILED";
  reason?: string;
}

export async function processExtractCascade(documentId: string): Promise<ExtractCascadeResult> {
  if (!db) throw new Error("[cascade-worker] db (Drizzle) não inicializado — falta DATABASE_URL.");

  // ── 1. carrega o documento (worker roda como role postgres → bypassa RLS) ──
  const [doc] = await db
    .select({
      storageKeyOriginal: documents.storageKeyOriginal,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc || !doc.storageKeyOriginal) {
    log({ level: "warn", scope: "cascade", event: "no-doc", msg: `documentId=${documentId} sem storage_key`, data: { documentId } });
    return { documentId, fields: {}, steps: [], totalCostCents: 0, usedAI: false, status: "FAILED", reason: "no-storage-key" };
  }

  // ── 2. baixa o arquivo real do R2 (bucket frio) ───────────────
  const buf = await getObject({ bucket: "frio", key: doc.storageKeyOriginal });

  // ── 3. roda a cascata sobre o arquivo verdadeiro ──────────────
  const out = await runCascade(
    { buffer: buf, filename: doc.originalFilename, mimeType: doc.mimeType },
    documentId,
  );
  const okStep = out.steps.find((s) => s.succeeded);
  const status: "OK" | "FAILED" = okStep ? "OK" : "FAILED";

  // ── 4. persiste resultado + move o documento para EM_REVISAO ───
  // A cascata terminou; o documento aguarda a confirmação humana (nunca
  // entra na trajetória sem o clique do usuário). Mesmo quando nenhum passo
  // "vence", a extração terminou → sai da FILA para o usuário decidir.
  await db
    .update(documents)
    .set({
      processingStatus: "EM_REVISAO",
      ocrStatus: status === "OK" ? "OK" : "FALHOU",
      extractedText: JSON.stringify({
        ...out.fields,
        source: out.usedAI ? "ia" : (okStep ? "cascade" : "none"),
        step: okStep?.step ?? null,
      }),
    })
    .where(eq(documents.id, documentId));

  log({
    level: status === "OK" ? "info" : "warn",
    scope: "cascade",
    event: status === "OK" ? "done" : "all-failed",
    msg: `documentId=${documentId} ${status} step=${okStep?.step ?? "-"}`,
    data: { documentId, usedAI: out.usedAI, totalCostCents: out.totalCostCents, status },
  });

  return {
    documentId, fields: out.fields, steps: out.steps,
    totalCostCents: out.totalCostCents, usedAI: out.usedAI,
    status, reason: status === "FAILED" ? "all-steps-failed" : undefined,
  };
}
