// lib/domain/indicators.ts
// INDICADORES PESSOAIS — Bloco 5 do backlog, item 18 §6.6 da arquitetura.
//
// Métrica padrão do Bloco 5 (docs/01-arquitetura.md §6.6):
//   coverage_pct          · % itens com evidência útil
//   amplitude             · year-span × tipos distintos
//   continuity_years      · anos com ≥1 item válido (DOCUMENTADO|VALIDADO)
//   career_years_adjusted · tempo em carreira descontando interrupções
//                          (maternidade, paternidade, adoação, saúde, outro)
// theme_count e total_score também existem no schema (mesmo §6.6) e ficam
// prontos para a camada temática (Bloco 7) e o motor de metodologias
// (Bloco 4) — aqui só expostos como PLACEHOLDERS honestos.
//
// REGRA (arquitetura §6.6 — Métrica padrão):
//   window_years = NULL · apply_caps = false.
//   SEMPRE vida inteira, sem corte. Esta função não aplica nenhuma janela
//   nem limite superior — ela só conta o que existe.
//
// Esta camada é PURA — sem I/O. Roda em testes sem cadeia React/Supabase.

import type { ItemState, ItemType, EvidenceStatus } from "./items";

// ─── INPUT ────────────────────────────────────────────────────
// Aceita o subconjunto de ItemView que o indicador realmente consome.
// Isto permite testar tanto com ItemView quanto com projeções de banco
// (linhas Drizzle, mock fixtures, etc.) sem precisar importar o tipo
// completo.

export interface IndicatorInputItem {
  itemType: ItemType;
  year: number;
  state: ItemState;
  evidenceStatus: EvidenceStatus;
  /** Opcional — usado pelo motor do Item #8 (theme_count). */
  keywords?: string;
}

export type CareerInterruptionType =
  | "MATERNIDADE" | "PATERNIDADE" | "ADOCAO" | "SAUDE" | "OUTRO";

export interface IndicatorInputCareerInterruption {
  type: CareerInterruptionType;
  startDate: string;          // ISO date (YYYY-MM-DD)
  endDate: string | null;     // null = em curso
}

export interface IndicatorInput {
  userId: string;
  now: Date;                  // timestamp do cálculo — injetável em testes
  careerStartDate: Date | null;
  interruptions: ReadonlyArray<IndicatorInputCareerInterruption>;
  items: ReadonlyArray<IndicatorInputItem>;
}

// ─── OUTPUT ───────────────────────────────────────────────────
// Forma do row da tabela `trajectory_indicators` (§6.6) + campos
// derivados que o painel precisa exibir (raw, interruptedDays).

export interface TrajectoryIndicators {
  userId: string;
  coveragePct: number;            // 0..100, 1 casa decimal
  amplitudeYears: number;          // year-span (inclusive)
  amplitudeTypes: number;          // distinct itemType
  continuityYears: number;         // # anos com ≥1 item válido
  careerYearsAdjusted: number;     // 1 casa decimal
  rawCareerYears: number;          // 1 casa decimal — sem desconto
  interruptedDays: number;         // total de dias descontados
  themeCount: number;              // placeholder — Bloco 7
  totalScorePlaceholder: number;   // placeholder — motor em Bloco 4
  computedAt: string;              // ISO
}

// ─── CONSTANTES ───────────────────────────────────────────────

/** Estados que contam como "continuidade" (§6.6: continuidade_years). */
export const VALID_FOR_CONTINUITY: ReadonlySet<ItemState> = new Set<ItemState>([
  "DOCUMENTADO", "VALIDADO",
]);

/** Estados que contam como "comprovação útil" (coverage_pct). */
export const EVIDENCE_OK: ReadonlySet<EvidenceStatus> = new Set<EvidenceStatus>([
  "COM_COMPROVANTE_PARCIAL", "COMPROVADO",
]);

/** Dias em um ano — usamos o valor "civil" sem leap-year correction porque
    o resultado final é arredondado a 1 casa decimal e a imprecisão é
    inferior a 0,003 anos, invisível no painel. */
const DAYS_PER_YEAR = 365.25;

// ─── COVERAGE ─────────────────────────────────────────────────

/**
 * % itens com evidência útil (PARCIAL|COMPROVADO).
 * 0% se não há item. Arredondado a 1 casa decimal.
 */
export function computeCoverage(items: ReadonlyArray<IndicatorInputItem>): number {
  if (items.length === 0) return 0;
  let withEvidence = 0;
  for (const it of items) {
    if (EVIDENCE_OK.has(it.evidenceStatus)) withEvidence++;
  }
  const raw = (withEvidence / items.length) * 100;
  return Math.round(raw * 10) / 10;
}

// ─── AMPLITUDE ────────────────────────────────────────────────

/**
 * Amplitude geográfica (year-span) + amplitude temática (# itemTypes).
 *   years = max-year - min-year + 1   (inclusivo)
 *   types = # distinct itemType
 * Zeros ambos quando não há item.
 */
export function computeAmplitude(items: ReadonlyArray<IndicatorInputItem>):
  { years: number; types: number }
{
  if (items.length === 0) return { years: 0, types: 0 };
  const years = new Set<number>();
  const types = new Set<ItemType>();
  for (const it of items) {
    if (Number.isFinite(it.year)) years.add(it.year);
    if (it.itemType) types.add(it.itemType);
  }
  if (years.size === 0) return { years: 0, types: types.size };
  const min = Math.min(...years);
  const max = Math.max(...years);
  return { years: Math.max(0, max - min + 1), types: types.size };
}

// ─── CONTINUIDADE ─────────────────────────────────────────────

/**
 * # anos com ≥ 1 item em estado DOCUMENTADO ou VALIDADO.
 * 0 quando não há nenhum item válido (estado puro: cobertura sem
 * comprovação não conta).
 */
export function computeContinuity(items: ReadonlyArray<IndicatorInputItem>): number {
  const validYears = new Set<number>();
  for (const it of items) {
    if (VALID_FOR_CONTINUITY.has(it.state) && Number.isFinite(it.year)) {
      validYears.add(it.year);
    }
  }
  return validYears.size;
}

// ─── TEMPO EM CARREIRA ───────────────────────────────────────

/**
 * Tempo bruto entre careerStartDate e `now`, em anos (1 casa).
 * Retorna 0 se start > now (não começou ainda) ou se start é ausente.
 */
export function rawCareerYears(start: Date | null, now: Date): number {
  if (!start) return 0;
  const ms = now.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000)) * 10) / 10;
}

/**
 * Subtrai da carreira os dias/anos efetivamente cobertos por
 * career_interruptions. Interrupção em curso (endDate=null) para
 * em `now`. Interrupções totalmente no futuro são ignoradas.
 */
export function adjustForInterruptions(
  start: Date | null,
  now: Date,
  interruptions: ReadonlyArray<IndicatorInputCareerInterruption>,
): { yearsAdjusted: number; interruptedDays: number } {
  const raw = rawCareerYears(start, now);
  if (!start || raw === 0) return { yearsAdjusted: 0, interruptedDays: 0 };

  let interruptedMs = 0;
  for (const i of interruptions) {
    const s = parseISODate(i.startDate);
    if (!s) continue;
    const e = i.endDate ? parseISODate(i.endDate) : now;
    if (!e) continue;
    if (e.getTime() <= s.getTime()) continue;

    const startClamped = s.getTime() < start.getTime() ? start.getTime() : s.getTime();
    const endClamped   = e.getTime() > now.getTime()  ? now.getTime()  : e.getTime();
    if (startClamped >= endClamped) continue;
    interruptedMs += endClamped - startClamped;
  }
  const interruptedDays = Math.round(interruptedMs / (24 * 60 * 60 * 1000));
  const yearsAdjusted = Math.max(0, raw - interruptedDays / DAYS_PER_YEAR);
  return { yearsAdjusted: Math.round(yearsAdjusted * 10) / 10, interruptedDays };
}

/** Parsing tolerante de datas — aceita ISO e DD/MM/AAAA (formato Lattes). */
function parseISODate(s: string): Date | null {
  if (!s) return null;
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/AAAA  (manual estrutural v3)
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── ORQUESTRADOR ────────────────────────────────────────────

/**
 * Calcula TODOS os indicadores pessoais em uma passada.
 * Função pura — determinística dado `now` + inputs.
 */
export function computeAllIndicators(input: IndicatorInput): TrajectoryIndicators {
  const { userId, now, careerStartDate, interruptions, items } = input;

  const coveragePct = computeCoverage(items);
  const amp = computeAmplitude(items);
  const continuityYears = computeContinuity(items);
  const adj = adjustForInterruptions(careerStartDate, now, interruptions);
  const raw = rawCareerYears(careerStartDate, now);

  return {
    userId,
    coveragePct,
    amplitudeYears: amp.years,
    amplitudeTypes: amp.types,
    continuityYears,
    careerYearsAdjusted: adj.yearsAdjusted,
    rawCareerYears: raw,
    interruptedDays: adj.interruptedDays,
    // Placeholders honestos — dependem de Blocos 4 e 7.
    themeCount: 0,
    totalScorePlaceholder: 0,
    computedAt: now.toISOString(),
  };
}

// ─── Persistência ─────────────────────────────────────────────

/** Converte o resultado no formato do row da tabela
    `trajectory_indicators` (§6.6) sem nunca revelar PII. */
export function toIndicatorRow(
  ind: TrajectoryIndicators,
  careerStartDateIso: string | null,
): {
  userId: string;
  coverage_pct: string;
  amplitude: number;
  continuity_years: number;
  theme_count: number;
  career_start_date: string | null;
  career_years_adjusted: string;
  computed_at: string;
} {
  return {
    userId: ind.userId,
    coverage_pct: ind.coveragePct.toFixed(2),
    amplitude: ind.amplitudeYears,
    continuity_years: ind.continuityYears,
    theme_count: ind.themeCount,
    career_start_date: careerStartDateIso,
    career_years_adjusted: ind.careerYearsAdjusted.toFixed(2),
    computed_at: ind.computedAt,
  };
}
