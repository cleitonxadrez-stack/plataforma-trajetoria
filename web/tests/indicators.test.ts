// tests/indicators.test.ts
// Bloco 5 — funções puras do painel de indicadores pessoais.
// Cobre as 4 métricas explicitadas em docs/01-arquitetura.md §6.6:
//   coverage_pct, amplitude, continuity_years, career_years_adjusted.

import { describe, it, expect } from "vitest";
import {
  computeCoverage,
  computeAmplitude,
  computeContinuity,
  computeAllIndicators,
  rawCareerYears,
  adjustForInterruptions,
  toIndicatorRow,
  EVIDENCE_OK,
  VALID_FOR_CONTINUITY,
  type IndicatorInputItem,
} from "../lib/domain/indicators";

// ─── helpers ───────────────────────────────────────────────────
function item(p: Partial<IndicatorInputItem> = {}): IndicatorInputItem {
  return {
    itemType: "ARTIGO",
    year: 2024,
    state: "VALIDADO",
    evidenceStatus: "COMPROVADO",
    ...p,
  };
}

// ─── COVERAGE ───────────────────────────────────────────────────
describe("indicators — coverage_pct", () => {
  it("0 itens → 0%", () => {
    expect(computeCoverage([])).toBe(0);
  });

  it("todos COMPROVADO → 100%", () => {
    const items = [item({ evidenceStatus: "COMPROVADO" }),
                   item({ evidenceStatus: "COMPROVADO" }),
                   item({ evidenceStatus: "COMPROVADO" })];
    expect(computeCoverage(items)).toBe(100);
  });

  it("todos SEM_COMPROVANTE → 0%", () => {
    const items = [item({ evidenceStatus: "SEM_COMPROVANTE" }),
                   item({ evidenceStatus: "SEM_COMPROVANTE" })];
    expect(computeCoverage(items)).toBe(0);
  });

  it("3 de 10 com evidência útil → 30%", () => {
    const items = [
      ...Array.from({ length: 7 }, () => item({ evidenceStatus: "SEM_COMPROVANTE" })),
      item({ evidenceStatus: "COMPROVADO" }),
      item({ evidenceStatus: "COMPROVADO" }),
      item({ evidenceStatus: "COM_COMPROVANTE_PARCIAL" }),
    ];
    expect(computeCoverage(items)).toBe(30);
  });

  it("PARCIAL conta como evidência útil", () => {
    expect(EVIDENCE_OK.has("COM_COMPROVANTE_PARCIAL")).toBe(true);
    expect(EVIDENCE_OK.has("COMPROVADO")).toBe(true);
    expect(EVIDENCE_OK.has("SEM_COMPROVANTE")).toBe(false);
  });
});

// ─── AMPLITUDE ──────────────────────────────────────────────────
describe("indicators — amplitude (year-span + tipos)", () => {
  it("0 itens → (0, 0)", () => {
    expect(computeAmplitude([])).toEqual({ years: 0, types: 0 });
  });

  it("1 item em um único ano e tipo → (1, 1)", () => {
    expect(computeAmplitude([item({ year: 2023, itemType: "ARTIGO" })])).toEqual({ years: 1, types: 1 });
  });

  it("5 itens de 2020 a 2024 (5 anos inclusivos) → years=5", () => {
    const items = [
      item({ year: 2020, itemType: "ARTIGO" }),
      item({ year: 2021, itemType: "ARTIGO" }),
      item({ year: 2022, itemType: "ARTIGO" }),
      item({ year: 2023, itemType: "ARTIGO" }),
      item({ year: 2024, itemType: "ARTIGO" }),
    ];
    expect(computeAmplitude(items).years).toBe(5);
  });

  it("3 itens em tipos distintos → types=3", () => {
    const items = [
      item({ itemType: "ARTIGO",     year: 2024 }),
      item({ itemType: "CERTIFICADO", year: 2023 }),
      item({ itemType: "DIPLOMA",     year: 2020 }),
    ];
    expect(computeAmplitude(items).types).toBe(3);
  });

  it("tipos repetidos não duplicam contagem", () => {
    const items = Array.from({ length: 10 },
      (_, i) => item({ itemType: i % 2 ? "ARTIGO" : "CERTIFICADO", year: 2020 + i }),
    );
    expect(computeAmplitude(items).types).toBe(2);
  });
});

// ─── CONTINUIDADE ───────────────────────────────────────────────
describe("indicators — continuity_years", () => {
  it("0 itens → 0", () => {
    expect(computeContinuity([])).toBe(0);
  });

  it("só AUTODECLARADO → 0 (não comprova continuidade)", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({
      year: 2020 + i, state: "AUTODECLARADO",
    }));
    expect(computeContinuity(items)).toBe(0);
  });

  it("VALID_FOR_CONTINUITY inclui apenas DOCUMENTADO e VALIDADO", () => {
    expect(VALID_FOR_CONTINUITY.has("DOCUMENTADO")).toBe(true);
    expect(VALID_FOR_CONTINUITY.has("VALIDADO")).toBe(true);
    expect(VALID_FOR_CONTINUITY.has("CONFIRMADO")).toBe(false);
    expect(VALID_FOR_CONTINUITY.has("AUTODECLARADO")).toBe(false);
  });

  it("3 anos distintos com item válido → 3", () => {
    const items = [
      item({ year: 2022, state: "DOCUMENTADO" }),
      item({ year: 2023, state: "VALIDADO" }),
      item({ year: 2024, state: "DOCUMENTADO" }),
      // AUTODECLARADO no ano 2025 NÃO conta:
      item({ year: 2025, state: "AUTODECLARADO" }),
    ];
    expect(computeContinuity(items)).toBe(3);
  });

  it("duplicatas no mesmo ano contam 1 única vez", () => {
    const items = [
      item({ year: 2024, state: "DOCUMENTADO" }),
      item({ year: 2024, state: "VALIDADO" }),
      item({ year: 2024, state: "DOCUMENTADO" }),
    ];
    expect(computeContinuity(items)).toBe(1);
  });
});

// ─── TEMPO EM CARREIRA ─────────────────────────────────────────
describe("indicators — tempo em carreira", () => {
  const now = new Date("2026-08-09T12:00:00Z");
  const start2010 = new Date("2010-08-09T00:00:00Z");

  it("sem careerStartDate → raw = 0", () => {
    expect(rawCareerYears(null, now)).toBe(0);
  });

  it("16 anos desde 2010 → raw ≈ 16.0", () => {
    const y = rawCareerYears(start2010, now);
    expect(y).toBeGreaterThanOrEqual(15.9);
    expect(y).toBeLessThanOrEqual(16.1);
  });

  it("start no futuro → 0", () => {
    const future = new Date("2030-01-01T00:00:00Z");
    expect(rawCareerYears(future, now)).toBe(0);
  });

  it("interrupção de 1 ano descontada corretamente", () => {
    const r = adjustForInterruptions(start2010, now, [{
      type: "MATERNIDADE", startDate: "2020-01-01", endDate: "2021-01-01",
    }]);
    // raw ~16.0, menos ~1.0 = ~15.0
    expect(r.yearsAdjusted).toBeGreaterThanOrEqual(14.9);
    expect(r.yearsAdjusted).toBeLessThanOrEqual(15.1);
    expect(r.interruptedDays).toBeGreaterThanOrEqual(360);
    expect(r.interruptedDays).toBeLessThanOrEqual(370);
  });

  it("interrupção em curso (endDate=null) para em `now`", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const r = adjustForInterruptions(start, now, [{
      type: "SAUDE", startDate: "2026-01-01", endDate: null,
    }]);
    // raw ~1.6 anos (de 2025-01-01 até 2026-08-09) — interrupção ~7 meses em JAN–AGO 2026
    // descontada → ajustado aproximadamente 0.9 anos
    expect(r.yearsAdjusted).toBeGreaterThanOrEqual(0.8);
    expect(r.yearsAdjusted).toBeLessThanOrEqual(1.0);
    expect(r.interruptedDays).toBeGreaterThanOrEqual(200);
  });

  it("interrupção totalmente no futuro é ignorada", () => {
    const r = adjustForInterruptions(start2010, now, [{
      type: "OUTRO", startDate: "2030-01-01", endDate: "2030-06-01",
    }]);
    expect(r.interruptedDays).toBe(0);
  });

  it("sem careerStartDate → adjust = (0, 0)", () => {
    const r = adjustForInterruptions(null, now, [{
      type: "MATERNIDADE", startDate: "2020-01-01", endDate: "2021-01-01",
    }]);
    expect(r).toEqual({ yearsAdjusted: 0, interruptedDays: 0 });
  });
});

// ─── ORQUESTRADOR ───────────────────────────────────────────────
describe("indicators — computeAllIndicators (orquestrador §6.6)", () => {
  const now = new Date("2026-08-09T12:00:00Z");
  const start2010 = new Date("2010-08-09T00:00:00Z");

  it("entrega 4 métricas principais + placeholders honestos", () => {
    const out = computeAllIndicators({
      userId: "u-1",
      now,
      careerStartDate: start2010,
      interruptions: [{
        type: "MATERNIDADE", startDate: "2020-01-01", endDate: "2021-01-01",
      }],
      items: [
        item({ year: 2022, itemType: "ARTIGO",     evidenceStatus: "COMPROVADO",            state: "VALIDADO" }),
        item({ year: 2023, itemType: "ARTIGO",     evidenceStatus: "COM_COMPROVANTE_PARCIAL", state: "DOCUMENTADO" }),
        item({ year: 2024, itemType: "CERTIFICADO",evidenceStatus: "SEM_COMPROVANTE",         state: "AUTODECLARADO" }),
      ],
    });

    expect(out.userId).toBe("u-1");
    // 2 de 3 com evidência útil → 66.7%
    expect(out.coveragePct).toBeCloseTo(66.7, 1);
    // amplitude: 3 anos (2022, 2023, 2024), 2 tipos (ARTIGO, CERTIFICADO)
    expect(out.amplitudeYears).toBe(3);
    expect(out.amplitudeTypes).toBe(2);
    // continuidade: 2022 e 2023 com DOCUMENTADO|VALIDADO → 2
    expect(out.continuityYears).toBe(2);
    // carreira ~16 anos − ~1 ano de interrupção ~ 15.0
    expect(out.careerYearsAdjusted).toBeGreaterThanOrEqual(14.9);
    expect(out.careerYearsAdjusted).toBeLessThanOrEqual(15.1);
    expect(out.interruptedDays).toBeGreaterThanOrEqual(360);
    // placeholders honestos (Blocos 4 e 7 ainda dependentes)
    expect(out.themeCount).toBe(0);
    expect(out.totalScorePlaceholder).toBe(0);
    expect(out.computedAt).toBe(now.toISOString());
  });

  it("0 itens + sem carreira → tudo zero", () => {
    const out = computeAllIndicators({
      userId: "u-empty",
      now, careerStartDate: null, interruptions: [], items: [],
    });
    expect(out.coveragePct).toBe(0);
    expect(out.amplitudeYears).toBe(0);
    expect(out.amplitudeTypes).toBe(0);
    expect(out.continuityYears).toBe(0);
    expect(out.careerYearsAdjusted).toBe(0);
    expect(out.interruptedDays).toBe(0);
  });
});

// ─── PERSISTÊNCIA ───────────────────────────────────────────────
describe("indicators — toIndicatorRow (§6.6 row shape)", () => {
  it("gera row pronto para upsert, com tipos numéricos estáveis", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const out = computeAllIndicators({
      userId: "u-2", now, careerStartDate: new Date("2020-01-01"),
      interruptions: [], items: [],
    });
    const row = toIndicatorRow(out, "2020-01-01");
    expect(row.userId).toBe("u-2");
    expect(typeof row.coverage_pct).toBe("string");   // numeric Drizzle
    expect(row.amplitude).toBe(0);
    expect(row.continuity_years).toBe(0);
    expect(row.theme_count).toBe(0);
    expect(row.career_start_date).toBe("2020-01-01");
    expect(row.computed_at).toBe(now.toISOString());
  });
});
