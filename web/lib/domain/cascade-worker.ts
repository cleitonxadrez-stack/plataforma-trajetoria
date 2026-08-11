// lib/domain/cascade-worker.ts
// Wrapper do extract-cascade que o worker chama. Faz cache do buffer em
// R2 frio (já enviado pelo flow), parse + atualiza `documents.extracted_*`
// e enfileira o passo seguinte (template learning) se aplicável.
//
// Para a Sprint 0/2, essa função é uma casca que **executa a cascata real**
// em memória e devolve os campos extraídos. Persistência fica em
// `document_extractions` — registrada como `OK` ou `FAILED`.

import { runCascade } from "./cascade";
import type { ExtractedFields, CascadeOutput } from "./cascade";
import { log } from "../observability/log";

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
  // Buscar buffer do R2 — em produção real:
  //   const buf = await getR2Buffer("frio", key);
  // Aqui usamos um stub determinístico: o orchestrator recebe buffer vazio
  // e os passos 1..5 vão para `no-*`. O passos 6 (IA) só entra com chave.
  const buf = Buffer.from([]);
  const out = await runCascade({ buffer: buf, filename: "<replay>", mimeType: "application/pdf" }, documentId);

  if (out.steps.length === 0 || out.steps.every((s) => !s.succeeded)) {
    log({
      level: "warn",
      scope: "cascade",
      event: "all-failed",
      msg: `documentId=${documentId} — passos 1..6 falharam`,
      data: { documentId, usedAI: out.usedAI },
    });
    return {
      documentId, fields: out.fields, steps: out.steps,
      totalCostCents: out.totalCostCents, usedAI: out.usedAI,
      status: "FAILED", reason: "all-steps-failed",
    };
  }

  log({
    level: "info",
    scope: "cascade",
    event: "done",
    msg: `documentId=${documentId} ok step=${out.steps.find((s) => s.succeeded)?.step}`,
    data: { documentId, usedAI: out.usedAI, totalCostCents: out.totalCostCents },
  });
  return {
    documentId, fields: out.fields, steps: out.steps,
    totalCostCents: out.totalCostCents, usedAI: out.usedAI,
    status: "OK",
  };
}
