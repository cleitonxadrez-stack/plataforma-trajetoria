// lib/domain/compute-indicators.ts
// Item #8 — calcular total_score + theme_count a partir de academic_items
// + career_interruptions e produzir a linha de upsert em `trajectory_indicators`.
//
// PURO (sem DB) — chamada pelo worker com input já materializado.
// "theme" aproxima-se por categoria predominante + palavras-chave; real
// engine entra em Sprint 7 (Bloco 7 da camada temática).

import { computeAllIndicators, type IndicatorInput, type IndicatorInputItem, type IndicatorInputCareerInterruption } from "./indicators";

export interface ComputeIndicatorsInput {
  userId: string;
  items: IndicatorInputItem[];
  interruptions: IndicatorInputCareerInterruption[];
  careerStartDate: string | null;
}

export interface TrajectoryIndicatorsUpsert {
  userId: string;
  totalScore: number;
  amplitude: number;
  continuityYears: number;
  coveragePct: number;
  themeCount: number;
  careerStartDate: string | null;
  careerYearsAdjusted: number;
  computedAt: string;
}

const KEYWORD_THEMES = [
  "ensino", "extensão", "extensao", "pesquisa", "gestão", "gestao",
  "inovação", "inovacao", "internacionalização", "internacionalizacao",
  "formação", "formacao", "avaliação", "avaliacao",
] as const;

function countThemes(items: IndicatorInputItem[]): number {
  const set = new Set<string>();
  for (const it of items) {
    if (typeof it.keywords !== "string") continue;
    for (const k of KEYWORD_THEMES) if (it.keywords.toLowerCase().includes(k)) set.add(k);
  }
  // cada keyword encontrada +1 — proteção: mínimo 0.
  return set.size;
}

export function computeIndicatorsUpsert(input: ComputeIndicatorsInput): TrajectoryIndicatorsUpsert {
  const ind: IndicatorInput = {
    userId: input.userId,
    now: new Date(),
    items: input.items,
    interruptions: input.interruptions ?? [],
    careerStartDate: input.careerStartDate ? new Date(input.careerStartDate) : null,
  };
  const result = computeAllIndicators(ind);
  const themeCount = countThemes(input.items);
  const totalScore =
    result.coveragePct * 1 +
    result.continuityYears * 50 +
    outputAmplitudeYears(result) * 30 +
    themeCount * 200;
  return {
    userId: input.userId,
    totalScore: Math.round(totalScore * 100) / 100,
    amplitude: outputAmplitudeYears(result),
    continuityYears: result.continuityYears,
    coveragePct: result.coveragePct,
    themeCount,
    careerStartDate: input.careerStartDate,
    careerYearsAdjusted: result.careerYearsAdjusted,
    computedAt: new Date().toISOString(),
  };
}

function outputAmplitudeYears(r: ReturnType<typeof computeAllIndicators>): number {
  const v = (r as unknown as { amplitudeYears?: number }).amplitudeYears
    ?? (r as unknown as { amplitude?: number }).amplitude
    ?? 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}
