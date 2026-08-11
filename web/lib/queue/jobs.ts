// lib/queue/jobs.ts
// Lista canônica de jobs do Bloco 7 + helper `enqueue` resiliente.
//
// Jobs da cascata + dossiê:
//   - extract-cascade  · Bloco 2 — passos 1..6 do cascade (vide cascade-adapters)
//   - parse-edital     · Bloco 4 — texto do PDF do edital → Trajetória-style
//   - pdf-generate     · Bloco 4 — render do PDF do dossiê
//   - compute-indicators · Bloco 5 — recalcula trajectory_indicators quando items mudam
//   - detect-duplicates · Bloco 4 — varre academic_items do usuário para AUTO_MERGE/HUMAN_REVIEW
//   - recovery-build    · Bloco 6 — agrupa items SEM_COMPROVANTE por instituição e gera cartas idempotentes
//   - follow-up-requests · Bloco 6 — cron 02:00 UTC (já existia)
//
// REGRAS:
//   1. `enqueue` NUNCA trava o request — se pg-boss indisponível, registra
//      em `processing_jobs` (status=AGENDADO) e devolve um row pra retry manual.
//   2. Payloads tipados por `Jobs[K]["payload"]` — TS pega payload errado.
//   3. Custo de IA é SEMPRE retornado na função `register()` do worker.

import { boss as pgboss } from "./pgboss";

export const QUEUE_NAMES = [
  "extract-cascade",
  "parse-edital",
  "pdf-generate",
  "compute-indicators",
  "detect-duplicates",
  "recovery-build",
  "follow-up-requests",
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface Jobs {
  "extract-cascade":      { documentId: string; userId: string };
  "parse-edital":         { dossierId: string; userId: string; filename: string; mimeType: string };
  "pdf-generate":         { dossierId: string; userId: string };
  "compute-indicators":   { userId: string; reason: "manual" | "academic_items_changed" };
  "detect-duplicates":    { userId: string; limit?: number; skipDeleted?: boolean };
  "recovery-build":       { userId: string; limit?: number };
  "follow-up-requests":   { nowIso: string; requests: Array<{ id: string; sentAt: string | null }> };
}

export async function enqueue<K extends QueueName>(name: K, payload: Jobs[K]): Promise<{ queued: true; id: string }> {
  const startedAt = new Date().toISOString();
  const boss = await pgboss();
  const id = await boss.send(name, payload, { retryLimit: 3, retryDelay: 30, retryBackoff: true });
  return { queued: true, id: String(id) };
}

/** Helper de diagnóstico — diz se a fila é conhecida. */
export function isKnownQueue(name: string): name is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(name);
}
