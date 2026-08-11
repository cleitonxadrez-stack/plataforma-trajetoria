// tests/compute-indicators.test.ts
// Item #8 — pure-upsert do total_score + theme_count.

import { describe, it, expect } from "vitest";
import { computeIndicatorsUpsert } from "../lib/domain/compute-indicators";

const baseItems = [
  { itemType: "ARTIGO" as const, year: 2023, state: "VALIDADO" as const, evidenceStatus: "COMPROVADO" as const, keywords: "inovação pesquisa" },
  { itemType: "CAPITULO" as const, year: 2022, state: "VALIDADO" as const, evidenceStatus: "COMPROVADO" as const, keywords: "ensino extensão" },
  { itemType: "CERTIFICADO" as const, year: 2021, state: "CONFIRMADO" as const, evidenceStatus: "SEM_COMPROVANTE" as const, keywords: "" },
];

describe("compute-indicators (Item #8)", () => {
  it("emite upsert com total_score > 0 quando há itens válidos", () => {
    const up = computeIndicatorsUpsert({
      userId: "u1",
      items: baseItems,
      interruptions: [],
      careerStartDate: "2020-01-01",
    });
    expect(up.userId).toBe("u1");
    expect(up.totalScore).toBeGreaterThan(0);
    expect(up.themeCount).toBeGreaterThanOrEqual(4); // ensino/extensão/extensao/pesquisa/inovação/inovacao
    expect(up.themeCount).toBeLessThanOrEqual(6);
  });

  it("devolve themeCount=0 quando items não têm keywords", () => {
    const up = computeIndicatorsUpsert({
      userId: "u1",
      items: [
        { itemType: "ARTIGO" as const, year: 2023, state: "VALIDADO" as const, evidenceStatus: "COMPROVADO" as const, keywords: "" },
      ],
      interruptions: [],
      careerStartDate: null,
    });
    expect(up.themeCount).toBe(0);
    expect(up.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("totalScore cresce com continuidade+cobertura+temas", () => {
    const low = computeIndicatorsUpsert({
      userId: "u1", items: [], interruptions: [], careerStartDate: null,
    });
    const high = computeIndicatorsUpsert({
      userId: "u1", items: baseItems, interruptions: [], careerStartDate: "2010-01-01",
    });
    expect(high.totalScore).toBeGreaterThan(low.totalScore);
  });
});
