// tests/methodology.test.ts
// BLOCO 4.1/4.2 — Parser determinístico de edital + seed Trajetória v1.
//
// Asserções (06-backlog.md §4.1/4.2):
//   • Seed Trajetória v1 cumpre windowYears=NULL e applyCaps=false (§6.6)
//   • Parser reconhece "janela: 5 anos" e "teto obrigatório" no texto
//   • Parser reconhece "coautoria > N autores, fator 0.8" no texto
//   • Categorias com nome >= 3 caracteres viram regras
//   • Status INSUFICIENTE quando não há padrões reconhecidos
//   • Status OK quando há ≥ 1 regra extraída com pontos > 0

import { describe, it, expect } from "vitest";
import { TRAJETORIA_V1, parseEdital, isQualis, type EditalParserStatus } from "../lib/domain/methodology";

describe("seed Trajetória v1 (§6.6 do 01-arquitetura.md)", () => {
  it("windowYears = null (vida inteira) e applyCaps = false (sem teto)", () => {
    expect(TRAJETORIA_V1.method.windowYears).toBeNull();
    expect(TRAJETORIA_V1.method.applyCaps).toBe(false);
  });

  it("tem ≥ 10 regras entre as categorias Produção / Formação / Ensino", () => {
    expect(TRAJETORIA_V1.rules.length).toBeGreaterThanOrEqual(10);
    const cats = new Set(TRAJETORIA_V1.rules.map((r) => r.categoryLabel));
    expect(cats.has("Produção Bibliográfica")).toBe(true);
    expect(cats.has("Produção Técnica")).toBe(true);
    expect(cats.has("Formação")).toBe(true);
    expect(cats.has("Ensino")).toBe(true);
  });

  it("cumpre ranking A1 > A2 > A3 > ... > C (Backlog 4.3 — sem IA decide)", () => {
    const artigos = TRAJETORIA_V1.rules.filter((r) => r.itemType === "ARTIGO" && r.qualisStratum);
    const a1 = artigos.find((r) => r.qualisStratum === "A1")!.points;
    const a4 = artigos.find((r) => r.qualisStratum === "A4")!.points;
    const c  = artigos.find((r) => r.qualisStratum === "C")!.points;
    expect(a1).toBeGreaterThan(a4);
    expect(a4).toBeGreaterThan(c);
  });

  it("STATUS = OK (seed sempre pronto)", () => {
    expect(TRAJETORIA_V1.status).toBe<EditalParserStatus>("OK");
  });
});

describe("parseEdital — extração determinística (§4.2)", () => {
  it("detecta janela '5 anos'", () => {
    const text = `
      PROGRESSÃO UFMT 2026
      Seção: Critérios de pontuação
      ARTIGO pontos: 25
      Janela: 5 anos
      Coautoria: > 3 autores, fator: 0.8
      Aplicar teto obrigatório
    `;
    const r = parseEdital(text, { name: "P-FURB" });
    expect(r.method.windowYears).toBe(5);
    expect(r.method.applyCaps).toBe(true);
    expect(r.method.coauthorRule).toEqual({ threshold: 3, factor: 0.8 });
    expect(r.rules.length).toBeGreaterThan(0);
    expect(r.status).toBe<EditalParserStatus>("OK");
  });

  it("categoria: extraída e persistida em categoryLabel", () => {
    const text = `
      PROGRESSÃO UFLA — EDITAL N. 12
      Categoria: Pesquisa
      ARTIGO pontos: 20
      LIVRO pontos: 35
    `;
    const r = parseEdital(text, { name: "UFLA" });
    const found = r.diagnostics.some((d) => d.toLowerCase().includes("categoria"));
    expect(found).toBe(true);
    expect(r.rules.length).toBe(2);
    expect(r.rules[0].categoryLabel).toBeTruthy();
  });

  it("regra com qualis e pontos: casa ótimo", () => {
    const text = `
      ARTIGO QUALIS A2 pontos: 25
      ARTIGO QUALIS B1 pontos: 12
      PATENTE pontos: 25
    `;
    const r = parseEdital(text, {});
    expect(r.rules.length).toBeGreaterThanOrEqual(3);
    const a2 = r.rules.find((x) => x.qualisStratum === "A2");
    expect(a2?.points).toBe(25);
    expect(a2?.itemType).toBe("ARTIGO");
    expect(isQualis("A2")).toBe(true);
    expect(isQualis("XPTO")).toBe(false);
  });

  it("retorna status INSUFICIENTE em texto sem padrões reconhecidos", () => {
    const text = "Lorem ipsum dolor sit amet. consectetur adipiscing.";
    const r = parseEdital(text, {});
    expect(r.status).toBe<EditalParserStatus>("INSUFICIENTE");
    // diagnóstico aponta IA como próximo passo — sem chamar a IA agora.
    expect(r.diagnostics.some((d) => d.includes("IA"))).toBe(true);
  });

  it("regra com 'teto 10/ano' captura capPerYear", () => {
    const text = `
      ARTIGO QUALIS A1 pontos: 30, teto: 10 por ano
    `;
    const r = parseEdital(text, {});
    const rule = r.rules.find((x) => x.qualisStratum === "A1");
    expect(rule?.capPerYear).toBe(10);
    expect(rule?.capPerCategory).toBeNull();
  });

  it("regra sem Qualis ainda é casável (itemType + qualis=null)", () => {
    const text = `
      LIVRO pontos: 30
    `;
    const r = parseEdital(text, {});
    const rule = r.rules.find((x) => x.itemType === "LIVRO");
    expect(rule?.qualisStratum).toBeNull();
    expect(rule?.points).toBe(30);
  });

  it("janela não detectada → windowYears=null (vida inteira, regra do §6.6)", () => {
    const text = `ARTIGO pontos: 20`;
    const r = parseEdital(text, {});
    expect(r.method.windowYears).toBeNull();
  });

  it("applyCaps desativado quando texto não menciona tetos", () => {
    const text = `ARTIGO pontos: 20`;
    const r = parseEdital(text, {});
    expect(r.method.applyCaps).toBe(false);
  });
});
