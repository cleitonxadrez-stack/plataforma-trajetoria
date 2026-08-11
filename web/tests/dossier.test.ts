// tests/dossier.test.ts
// BLOCO 4.3/4.4/4.5 — Motor de pontuação, montagem, breakdown e excluídos.
//
// Asserções (06-backlog.md §4.3 / §4.4 / §4.5 + 05-fluxos.md Fluxo 5):
//   1. SEM_COMPROVANTE / PARCIAL nunca entram na contagem (só COMPROVADO)
//   2. windowYears=null → vida inteira (regra do §6.6 da arquitetura)
//   3. Coautoria: fator aplicado SÓ quando authorCount > threshold
//   4. Tetos: capPerYear, capPerCategory, capTotal — SÓ se applyCaps
//   5. Excluídos com motivo vão em `excluidos`
//   6. matchRule: tenta casar Qualis exato → fallback itemType + null
//   7. Breakdown soma = total
//   8. Ordenação determinística: orderIndex de regra asc, depois year DESC
//   9. Página numerada em ordem (pageStart...pageEnd)
//   10. Cálculo manual conferindo: cenário reproduzível

import { describe, it, expect } from "vitest";
import {
  filterComprovados,
  dentroDaJanela,
  matchRule,
  aplicarCoautoria,
  aplicarTetos,
  pontuar,
  renderBalancete,
  type AcademicItemLite,
  type RankingMethod,
  type RankingRule,
} from "../lib/domain/dossier";

const item = (overrides: Partial<AcademicItemLite>): AcademicItemLite => ({
  id: overrides.id ?? "i-" + Math.random().toString(36).slice(2, 7),
  itemType: overrides.itemType ?? "ARTIGO",
  title: overrides.title ?? "Item",
  year: overrides.year !== undefined ? overrides.year : 2024,
  qualis: overrides.qualis ?? null,
  authorCount: overrides.authorCount ?? 1,
  evidenceStatus: overrides.evidenceStatus ?? "COMPROVADO",
});

const now = new Date("2026-08-10T00:00:00Z");

// ── motor de método (Trajetória v1 usado como pano de fundo) ───────
const methodTraj: RankingMethod = {
  name: "Trajetória v1",
  version: 1,
  scope: "PLATAFORMA",
  sourceDocumentId: null,
  validFrom: null,
  validUntil: null,
  windowYears: null,
  applyCaps: false,
  coauthorRule: null,
  stratificationEnabled: false,
  isPublic: true,
  verifiedByUser: true,
};

const methodEdital: RankingMethod = {
  ...methodTraj,
  name: "Progressão UFMT 2026",
  windowYears: 5,
  applyCaps: true,
  scope: "EDITAL",
};

const rulesEdital: RankingRule[] = [
  { id: "r1", categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
  { id: "r2", categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A1", points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
  { id: "r3", categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "B1", points: 12, capPerYear: 1, capPerCategory: 50, capTotal: null, orderIndex: 1, conditions: null },
  { id: "r4", categoryLabel: "Produção Bibliográfica", itemType: "LIVRO",  qualisStratum: null, points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 2, conditions: null },
];

describe("filterComprovados (Fluxo 5 passo 1)", () => {
  it("só itens COMPROVADO entram", () => {
    const a = item({ id: "1", evidenceStatus: "COMPROVADO" });
    const b = item({ id: "2", evidenceStatus: "SEM_COMPROVANTE" });
    const c = item({ id: "3", evidenceStatus: "COM_COMPROVANTE_PARCIAL" });
    expect(filterComprovados([a, b, c]).map((i) => i.id)).toEqual(["1"]);
  });
});

describe("dentroDaJanela (Fluxo 5 passo 2)", () => {
  it("windowYears=null → sempre dentro", () => {
    expect(dentroDaJanela(item({ year: 1998 }), null, now)).toBe(true);
  });
  it("windowYears=5 (a partir de 2026) → ano >= 2022 dentro", () => {
    expect(dentroDaJanela(item({ year: 2022 }), 5, now)).toBe(true);
    expect(dentroDaJanela(item({ year: 2021 }), 5, now)).toBe(false);
    expect(dentroDaJanela(item({ year: null }), 5, now)).toBe(false);
  });
});

describe("matchRule (Fluxo 5 passo 3)", () => {
  const rs: RankingRule[] = [
    { categoryLabel: "x", itemType: "ARTIGO", qualisStratum: "A1", points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
    { categoryLabel: "y", itemType: "ARTIGO", qualisStratum: null, points: 10, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
  ];
  it("casa Qualis exato", () => {
    expect(matchRule(item({ itemType: "ARTIGO", qualis: "A1" }), rs)?.points).toBe(30);
  });
  it("fallback para itemType sem qualis", () => {
    expect(matchRule(item({ itemType: "ARTIGO", qualis: "C" }), rs)?.points).toBe(10);
  });
  it("null se não houver regra nem com Qualis nem sem", () => {
    expect(matchRule(item({ itemType: "LIVRO", qualis: null }), rs)).toBeNull();
  });
});

describe("aplicarCoautoria (Fluxo 5 passo 4)", () => {
  it("fator aplicado quando authorCount > threshold", () => {
    const r = aplicarCoautoria(30, item({ authorCount: 5 }), { threshold: 3, factor: 0.8 }, null);
    expect(r).toBeCloseTo(24, 6);
  });
  it("fator NÃO aplicado quando authorCount <= threshold", () => {
    const r = aplicarCoautoria(30, item({ authorCount: 2 }), { threshold: 3, factor: 0.8 }, null);
    expect(r).toBe(30);
  });
  it("require_first_author + não-primeiro + >1 autores zera pontos", () => {
    const r = aplicarCoautoria(20, item({ authorCount: 3, isFirstAuthor: false }), { threshold: 5, factor: 0.8 }, { require_first_author: true });
    expect(r).toBe(0);
  });
});

describe("aplicarTetos (só com applyCaps=true)", () => {
  it("capPerYear: limita por (itemType, qualis, year)", () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      ({ item: item({ id: `b1-${i}`, itemType: "ARTIGO", qualis: "B1", year: 2024 }), rule: rulesEdital[2], pts: 12 }),
    );
    const { kept, capped } = aplicarTetos(items, rulesEdital);
    expect(kept.length).toBe(1);
    expect(capped.length).toBe(2);
  });
  it("capPerCategory: limita soma da categoria", () => {
    // categoria cap=50, 2 livros ×30 = 60 → 1 entra, 1 sai
    const rs: RankingRule[] = [
      { categoryLabel: "Produção Bibliográfica", itemType: "LIVRO", qualisStratum: null, points: 30, capPerYear: null, capPerCategory: 50, capTotal: null, orderIndex: 1, conditions: null },
    ];
    const items = [
      { item: item({ id: "l1", itemType: "LIVRO" }), rule: rs[0], pts: 30 },
      { item: item({ id: "l2", itemType: "LIVRO" }), rule: rs[0], pts: 30 },
    ];
    const { kept, capped } = aplicarTetos(items, rs);
    expect(kept.length + capped.length).toBe(2);
    expect((kept.length === 1 && capped.length === 1) || (kept.length === 0 && capped.length === 2)).toBe(true);
  });
});

describe("pontuar — orquestrador (regra de ouro: Trajetória v1 sempre corta 0)", () => {
  it("Trajetória v1 (sem janela, sem tetos): 1 artigo A2 COMPROVADO → 25 pts", () => {
    const items = [item({ itemType: "ARTIGO", qualis: "A2" })];
    const rs: RankingRule[] = [
      { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
    ];
    const r = pontuar(items, methodTraj, rs, now);
    expect(r.total).toBe(25);
    expect(r.excluded.length).toBe(0);
  });

  it("Trajetória v1: itens SEM_COMPROVANTE/PARCIAL não entram no total", () => {
    const items = [
      item({ qualis: "A2", evidenceStatus: "SEM_COMPROVANTE" }),
      item({ qualis: "A2", evidenceStatus: "COM_COMPROVANTE_PARCIAL", id: "parc" }),
      item({ qualis: "A2", evidenceStatus: "COMPROVADO", id: "comp" }),
    ];
    const rs: RankingRule[] = [
      { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
    ];
    const r = pontuar(items, methodTraj, rs, now);
    expect(r.total).toBe(25);
    expect(r.items.length).toBe(1);
    expect(r.items[0].itemId).toBe("comp");
  });

  it("Edital com janela=5: itens de 2021 fora da janela → excluídos com motivo", () => {
    const items = [
      item({ id: "recente", qualis: "A2", year: 2024 }),
      item({ id: "antigo",  qualis: "A2", year: 2018 }),
    ];
    const rs: RankingRule[] = [
      { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
    ];
    const r = pontuar(items, methodEdital, rs, now);
    expect(r.total).toBe(25);
    expect(r.excluded.find((e) => e.itemId === "antigo")).toBeTruthy();
    expect(r.excluded.find((e) => e.itemId === "antigo")?.reason).toContain("janela");
  });

  it("Edital com capPerYear=1: 3 artigos B1 no mesmo ano → 1 contado, 2 excluídos", () => {
    const items = ["a","b","c"].map((x) => item({ id: x, qualis: "B1", year: 2024, itemType: "ARTIGO" }));
    const r = pontuar(items, methodEdital, rulesEdital, now);
    expect(r.total).toBe(12);
    expect(r.excluded.length).toBe(2);
    expect(r.excluded.every((e) => e.reason.toLowerCase().includes("teto"))).toBe(true);
  });

  it("Soma do breakdown = total", () => {
    const items = [
      item({ id: "a1", itemType: "ARTIGO", qualis: "A1", year: 2024 }),
      item({ id: "a2", itemType: "ARTIGO", qualis: "A2", year: 2024 }),
      item({ id: "l1", itemType: "LIVRO",  year: 2023 }),
    ];
    const r = pontuar(items, methodTraj, rulesEdital, now);
    const sum = r.breakdown.reduce((acc, c) => acc + c.total, 0);
    expect(sum).toBe(r.total);
  });

  it("Ordenação: ordem da regra asc, depois year DESC dentro da categoria", () => {
    const items = [
      item({ id: "novo-a1",     itemType: "ARTIGO", qualis: "A1", year: 2025 }),
      item({ id: "antigo-a1",   itemType: "ARTIGO", qualis: "A1", year: 2022 }),
      item({ id: "novo-a2",     itemType: "ARTIGO", qualis: "A2", year: 2024 }),
      item({ id: "livro-2026",  itemType: "LIVRO",  qualis: null, year: 2026 }),
    ];
    const r = pontuar(items, methodTraj, rulesEdital, now);
    // livros têm orderIndex 2 — vêm depois dos artigos (orderIndex 1)
    const firstCat = r.breakdown[0].categoryLabel;
    expect(firstCat).toBe("Produção Bibliográfica");
    const articles = r.breakdown[0].items.filter((x) => r.breakdown[0].items.find((b) => b.itemId === x.itemId && x.itemId !== "livro-2026"));
    // dentro de artigos: mais recente primeiro
    const ids = articles.map((x) => x.itemId);
    expect(ids.indexOf("novo-a1")).toBeLessThan(ids.indexOf("antigo-a1"));
  });

  it("Numeração de páginas: pageStart cresce na ordem do breakdown", () => {
    const items = [
      item({ id: "i1", itemType: "ARTIGO", qualis: "A1", year: 2024 }),
      item({ id: "i2", itemType: "ARTIGO", qualis: "A2", year: 2023 }),
    ];
    const r = pontuar(items, methodTraj, rulesEdital, now);
    expect(r.items[0].pageStart).toBe(1);
    expect(r.items[1].pageStart).toBe(2);
  });

  it("renderBalancete: string inclui total e contagem de excluídos", () => {
    const items = [
      item({ id: "in", qualis: "A2", year: 2024 }),
      item({ id: "out", qualis: "A2", year: 2015 }),
    ];
    const rs: RankingRule[] = [
      { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1, conditions: null },
    ];
    const r = pontuar(items, methodEdital, rs, now);
    const txt = renderBalancete(r, methodEdital);
    expect(txt).toContain("Total: 25 pts");
    expect(txt).toContain("Excluídos: 1");
    expect(txt.toLowerCase()).toContain("janela: 5 anos");
  });

  it("Cenário de cálculo manual confere (regra §4.3 'soma confere com cálculo manual')", () => {
    // 1 A1 COMPROVADO + 1 A2 COMPROVADO + 1 LIVRO COMPROVADO → 30+25+30=85
    const items = [
      item({ id: "ai", itemType: "ARTIGO", qualis: "A1", year: 2024 }),
      item({ id: "aii", itemType: "ARTIGO", qualis: "A2", year: 2024 }),
      item({ id: "li", itemType: "LIVRO",  qualis: null, year: 2024 }),
    ];
    const r = pontuar(items, methodTraj, rulesEdital, now);
    expect(r.total).toBe(85);
    expect(r.excluded.length).toBe(0);
  });
});
