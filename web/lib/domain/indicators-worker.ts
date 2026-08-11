// lib/domain/indicators-worker.ts
// Job `compute-indicators` — recalcula `trajectory_indicators` quando
// academic_items mudam ou o usuário pede manualmente.
//
// REGRA: vida inteira, sem teto e sem janela de ranking (BLoco 5 / §6.6).
// Esta função é a única autorizada a escrever em `trajectory_indicators`.

import { createClient } from "@/lib/supabase/server";
import {
  computeAllIndicators, toIndicatorRow,
  type IndicatorInputItem, type IndicatorInputCareerInterruption,
} from "./indicators";
import { log } from "../observability/log";

export interface ComputeIndicatorsPayload {
  userId: string;
  reason: "manual" | "academic_items_changed";
}

export async function processComputeIndicators(input: ComputeIndicatorsPayload): Promise<{
  ok: boolean;
  reason: string;
  userId: string;
  totalScore?: number;
  error?: string;
}> {
  const sb = await createClient();
  const { data: user, error: ue } = await sb.from("users")
    .select("id, career_start_date")
    .eq("id", input.userId).maybeSingle();
  if (ue || !user) {
    return { ok: false, reason: input.reason, userId: input.userId, error: "user-not-found" };
  }

  const [{ data: items }, { data: ints }] = await Promise.all([
    sb.from("academic_items")
      .select("id, item_type, year, evidence_status, verification_level")
      .eq("user_id", input.userId).is("deleted_at", null),
    sb.from("career_interruptions")
      .select("type, start_date, end_date")
      .eq("user_id", input.userId).is("deleted_at", null),
  ]);

  const ALLOWED_TYPES = ["ARTIGO", "CAPITULO", "CERTIFICADO", "DIPLOMA", "CAPA_FICHA", "OUTROS"];
  const ALLOWED_STATES = ["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"];
  const ALLOWED_EVIDENCE = ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"];
  const ALLOWED_INTERRUPTIONS = ["MATERNIDADE", "PATERNIDADE", "ADOCAO", "SAUDE", "OUTRO"];

  const mappedItems: IndicatorInputItem[] = ((items ?? []) as Array<{
    item_type: string; year: number | null; verification_level: string; evidence_status: string;
  }>).map((r) => ({
    itemType: (ALLOWED_TYPES.includes(r.item_type) ? r.item_type : "OUTROS") as IndicatorInputItem["itemType"],
    year: r.year ?? 0,
    state: (ALLOWED_STATES.includes(r.verification_level) ? r.verification_level : "AUTODECLARADO") as IndicatorInputItem["state"],
    evidenceStatus: (ALLOWED_EVIDENCE.includes(r.evidence_status) ? r.evidence_status : "SEM_COMPROVANTE") as IndicatorInputItem["evidenceStatus"],
  }));

  const mappedInterruptions: IndicatorInputCareerInterruption[] = ((ints ?? []) as Array<{
    type: string; start_date: string; end_date: string | null;
  }>).map((r) => ({
    type: (ALLOWED_INTERRUPTIONS.includes(r.type) ? r.type : "OUTRO") as IndicatorInputCareerInterruption["type"],
    startDate: r.start_date,
    endDate: r.end_date,
  }));

  const careerStart = (user as { career_start_date?: string | null }).career_start_date;
  const ind = computeAllIndicators({
    userId: input.userId,
    now: new Date(),
    careerStartDate: careerStart ? new Date(careerStart + "T00:00:00Z") : null,
    interruptions: mappedInterruptions,
    items: mappedItems,
  });

  const row = toIndicatorRow(ind, careerStart ?? null as string | null);
  void row.userId; // retirada de campos não persistidos pela API

  // Persist via upsert RLS-friendly.
  const payload = {
    user_id: input.userId,
    total_score: String((ind as unknown as { totalScore?: number }).totalScore ?? 0),
    amplitude: ind.amplitudeYears,
    continuity_years: ind.continuityYears,
    coverage_pct: ind.coveragePct.toFixed(2),
    theme_count: (ind as unknown as { themeCount?: number }).themeCount ?? 0,
    career_start_date: careerStart ?? null,
    career_years_adjusted: ind.careerYearsAdjusted.toFixed(2),
    computed_at: ind.computedAt,
  };
  const { error: upErr } = await sb.from("trajectory_indicators").upsert(payload, { onConflict: "user_id" });
  if (upErr) {
    return { ok: false, reason: input.reason, userId: input.userId, error: upErr.message };
  }
  log({
    level: "info", scope: "indicators-worker", event: "recompute",
    msg: `userId=${input.userId} coverage=${ind.coveragePct.toFixed(2)}% continuity=${ind.continuityYears} amplitude=${ind.amplitudeYears}`,
    data: { reason: input.reason, interruptedDays: ind.interruptedDays },
  });
  return { ok: true, reason: input.reason, userId: input.userId, totalScore: Number((ind as unknown as { totalScore?: number }).totalScore ?? 0) };
}
