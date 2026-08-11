// tests/pdf-dossier.test.ts
// Cobre o construtor da árvore do PDF e o renderer em modo placeholder.

import { describe, it, expect } from "vitest";
import { buildPdfDocument, renderDossier } from "../lib/domain/pdf-dossier";
import type { ItemCategory, RankedItem } from "../lib/domain/dossier";

const CAT: ItemCategory[] = [
  {
    label: "Produção bibliográfica",
    rules: [
      { id: "r1", label: "Artigo Qualis A1", itemType: "ARTIGO", qualisStratum: "A1", points: 10, categoryLabel: "Produção bibliográfica", capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
      { id: "r2", label: "Capítulo", itemType: "CAPITULO", qualisStratum: null, points: 5, categoryLabel: "Produção bibliográfica", capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 2, conditions: null },
    ],
  },
];

const RANKED: RankedItem[] = [
  { itemId: "i1", categoryLabel: "Produção bibliográfica", rule: CAT[0].rules[0]!, points: 10,
    item: { title: "A federated survey", year: 2024 }, excluded: false, excludedReason: null, reason: "" },
  { itemId: "i2", categoryLabel: "Produção bibliográfica", rule: CAT[0].rules[1]!, points: 5,
    item: { title: "Cap. 1", year: 2023 }, excluded: false, excludedReason: null, reason: "" },
  { itemId: "i3", categoryLabel: "Produção bibliográfica", rule: CAT[0].rules[0]!, points: 0,
    item: { title: "Sem DOI", year: 2022 }, excluded: true, excludedReason: "no-doi-when-rule-requires", reason: "no-doi" },
];

describe("buildPdfDocument", () => {
  it("conta itens incluídos vs excluídos e soma pontos", async () => {
    const t = buildPdfDocument({
      meta: {
        id: "d1", title: "Edital FAPESP 2026/01", purpose: "bolsa",
        methodName: "Trajetória v1", methodVersion: 1,
        generatedAt: "2026-08-10T05:00:00Z",
      },
      categories: CAT, ranked: RANKED,
    });
    expect(t.totals.itemsCount).toBe(2);
    expect(t.totals.excludedCount).toBe(1);
    expect(t.totals.totalPoints).toBe(15);
    expect(t.categories[0]!.items.length).toBe(3);
    expect(t.signature.simulationNotice).toContain("SIMULAÇÃO");
  });
});

describe("renderDossier (fallback JSON)", () => {
  it("sem @react-pdf/renderer instalado devolve placeholder JSON válido", async () => {
    const t = buildPdfDocument({
      meta: { id: "d1", title: "X", purpose: null, methodName: "V1", methodVersion: 1, generatedAt: "2026-08-10" },
      categories: CAT, ranked: RANKED,
    });
    const out = await renderDossier(t);
    expect(out.ok).toBe(true);
    expect(out.engine).toBe("json-placeholder");
    expect(out.mimeType).toMatch(/json/);
    expect(out.bytes.length).toBeGreaterThan(0);
    // Conteúdo começa com "# Dossiê (placeholder)" — assinatura.
    expect(out.bytes.toString("utf8")).toContain("# Dossiê (placeholder)");
  });
});
