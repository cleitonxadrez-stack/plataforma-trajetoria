// lib/domain/pdf-regen-picker.ts
// BLOCO 8 — scanner PURO para identificar `dossiers` que precisam de
// regeneração de PDF.
//
// Política (CLAUDE.md §Sem mentira):
//   1. ZERO I/O — recebe array cru de `dossiers` filtrados pela route e devolve
//      a lista priorizada para o caller enfileirar `pdf-generate`.
//   2. Critérios de seleção:
//      a. status ausente (null) ou status ≠ 'PRONTO' (dossiê ainda sem PDF).
//      b. OU pdf_storage_key ausente (banco diz PRONTO mas storage apagou).
//      c. OU pdf_storage_key presente mas pdf_generated_at mais velho que
//         `staleAfterDays` da rodada atual (default 90 — cobertura hot).
//   3. Ordenação: mais antigos primeiro (FIFO na fila do pg-boss), limitado por
//      `limit` (default 50, max 500 — teto defensivo).
//   4. NÃO decide se um dossiê deve SER regenerado pelo usuário; apenas
//      sinaliza para o cron.
//
// Determinístico: mesma entrada + mesmo `nowIso` → mesma ordem.

export type DossierStatus =
  | "RASCUNHO"
  | "PRONTO_SEM_PDF"
  | "PRONTO"
  | "FALHA_PDF"
  | string; // tolerância a valores futuros

export interface DossierRegenInput {
  id: string;
  userId: string;
  status: DossierStatus | null | undefined;
  pdfStorageKey: string | null | undefined;
  pdfGeneratedAt: string | null | undefined; // ISO ou null
  updatedAt: string | null | undefined; // ISO ou null
}

export interface RegenPickerConfig {
  /** Default 90. PDFs mais antigos do que isso viram candidatos à regeneração. */
  staleAfterDays?: number;
  /** Default 50; teto defensivo 500. */
  limit?: number;
  /** ISO injetado em testes. Default: new Date().toISOString(). */
  nowIso?: string;
}

export interface DossierRegenCandidate {
  dossierId: string;
  userId: string;
  reason: "missing_status" | "missing_pdf_key" | "missing_pdf_at" | "stale_pdf" | "not_pronto";
  ageDays: number;
}

export class RegenPickerConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RegenPickerConfigError";
  }
}

const DEFAULT_STALE_DAYS = 90;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function resolveCfg(cfg: RegenPickerConfig | undefined): Required<RegenPickerConfig> {
  const stale = cfg?.staleAfterDays ?? DEFAULT_STALE_DAYS;
  const limit = cfg?.limit ?? DEFAULT_LIMIT;
  if (limit < 1) throw new RegenPickerConfigError(`limit precisa ser ≥ 1; recebido ${limit}`);
  return {
    staleAfterDays: stale,
    limit: Math.min(limit, MAX_LIMIT),
    nowIso: cfg?.nowIso ?? new Date().toISOString(),
  };
}

function diffDays(nowMs: number, refIso: string | null | undefined): number {
  if (!refIso) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(refIso);
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return (nowMs - ms) / (1000 * 60 * 60 * 24);
}

/**
 * Aplica os critérios e devolve a lista priorizada. Estável, sem clock.timer,
 * sem dependency inyect.
 */
export function pickDossiersToRegen(
  dossiers: ReadonlyArray<DossierRegenInput>,
  cfg: RegenPickerConfig = {},
): DossierRegenCandidate[] {
  const c = resolveCfg(cfg);
  const nowMs = Date.parse(c.nowIso);
  if (!Number.isFinite(nowMs)) {
    throw new RegenPickerConfigError(`nowIso inválido: "${c.nowIso}"`);
  }
  const out: DossierRegenCandidate[] = [];
  for (const d of dossiers) {
    let reason: DossierRegenCandidate["reason"] | null = null;
    let ageDays = 0;

    if (!d.status) {
      reason = "missing_status";
    } else if (d.status !== "PRONTO") {
      reason = "not_pronto";
    } else if (!d.pdfStorageKey) {
      reason = "missing_pdf_key";
    } else if (!d.pdfGeneratedAt) {
      reason = "missing_pdf_at";
    } else {
      const age = diffDays(nowMs, d.pdfGeneratedAt);
      ageDays = age;
      if (age >= c.staleAfterDays) reason = "stale_pdf";
    }

    if (reason) {
      out.push({
        dossierId: d.id,
        userId: d.userId,
        reason,
        ageDays: Number.isFinite(ageDays) ? ageDays : 0,
      });
    }
  }
  // FIFO: mais antigos primeiro; secundário por id para estabilidade.
  out.sort((a, b) => {
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
    return a.dossierId.localeCompare(b.dossierId);
  });
  return out.slice(0, c.limit);
}
