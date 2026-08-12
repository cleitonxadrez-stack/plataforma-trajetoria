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
import { classifyDocumentFields } from "./ai-classify";

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

  // ── 3b. classificação por IA (opcional) ───────────────────────
  // A cascata só extrai TEXTO BRUTO; a IA estrutura em campos (tipo, título,
  // instituição, ano) — que a tela de revisão pré-preenche. Só roda com texto
  // + IA_EXTRACTION_API_KEY. A IA apenas SUGERE (o usuário confirma na revisão).
  const fields: Record<string, unknown> = { ...out.fields };
  let aiUsed = false;
  let aiCostCents = 0;
  const rawText = typeof out.fields.rawText === "string" ? out.fields.rawText : "";
  if (rawText && process.env.IA_EXTRACTION_API_KEY) {
    const ai = await classifyDocumentFields(rawText);
    if (ai.ok) {
      Object.assign(fields, ai.fields);
      aiUsed = true;
      aiCostCents = ai.costCents;
      log({ level: "info", scope: "cascade", event: "ai-classified", msg: `documentId=${documentId} IA estruturou ${Object.keys(ai.fields).length} campos`, data: { documentId, model: ai.model, costCents: ai.costCents } });
    } else {
      log({ level: "warn", scope: "cascade", event: "ai-skip", msg: `documentId=${documentId} IA não classificou: ${ai.reason}`, data: { documentId, reason: ai.reason } });
    }
  }
  const usedAI = out.usedAI || aiUsed;
  const totalCostCents = out.totalCostCents + aiCostCents;

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
        ...fields,
        source: aiUsed ? "ia" : (okStep ? "cascade" : "none"),
        step: okStep?.step ?? null,
      }),
    })
    .where(eq(documents.id, documentId));

  log({
    level: status === "OK" ? "info" : "warn",
    scope: "cascade",
    event: status === "OK" ? "done" : "all-failed",
    msg: `documentId=${documentId} ${status} step=${okStep?.step ?? "-"} ia=${aiUsed}`,
    data: { documentId, usedAI, totalCostCents, status },
  });

  return {
    documentId, fields, steps: out.steps,
    totalCostCents, usedAI,
    status, reason: status === "FAILED" ? "all-steps-failed" : undefined,
  };
}
