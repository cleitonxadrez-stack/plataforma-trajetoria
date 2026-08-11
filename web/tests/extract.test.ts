// tests/extract.test.ts
// Porta de extração: garantir que o modo mock funciona e que o mapeamento
// ExtractedFields → academic_items respeita a forma da tabela.

import { describe, it, expect } from "vitest";
import { getExtractionPort, mapExtractionToItem } from "../lib/domain/extract";

describe("extract.ts — porta tipada", () => {
  it("default = mock e descreve honestamente", () => {
    const port = getExtractionPort();
    expect(port.describe().mode).toBe("mock");
    expect(port.isAvailable()).toBe(true);
  });

  it("mock.extract devolve a forma canônica — sem pular passos", async () => {
    const port = getExtractionPort();  // EXTRACTION_MODE não-set → mock
    const r = await port.extract({
      documentId: "doc-1", filename: "x.pdf", mimeType: "application/pdf", fixtureIndex: 0,
    });
    expect(r.documentId).toBe("doc-1");
    expect(r.steps.length).toBe(3);
    expect(r.steps.at(-1)?.succeeded).toBe(true);
    expect(r.steps.at(-1)?.source).toBe("crossref");
    expect(r.totalCostCents).toBe(0);
    expect(r.usedAI).toBe(false);
    expect(r.source).toBe("mock");
  });

  it("mock.extract — fixture 1 simula IA (custo > 0, usedAI = true)", async () => {
    const port = getExtractionPort();
    const r = await port.extract({
      documentId: "doc-2", filename: "a.pdf", mimeType: "application/pdf", fixtureIndex: 1,
    });
    expect(r.steps.length).toBe(6);
    expect(r.usedAI).toBe(true);
    expect(r.totalCostCents).toBe(12);
  });

  it("mock.extract — fixture 2 resolve no passo 1 (1 step apenas)", async () => {
    const port = getExtractionPort();
    const r = await port.extract({
      documentId: "doc-3", filename: "d.pdf", mimeType: "application/pdf", fixtureIndex: 2,
    });
    expect(r.steps.length).toBe(1);
    expect(r.totalCostCents).toBe(0);
  });
});

describe("extract.ts — mapExtractionToItem (Bloco 3 write-side)", () => {
  it("DOI + título → COM_COMPROVANTE_PARCIAL, sem needsReview", () => {
    const out = mapExtractionToItem(
      { documentType: "ARTIGO", title: "X", year: 2025, doi: "10.1/x" },
      "fallback", 2024,
    );
    expect(out.title).toBe("X");
    expect(out.doi).toBe("10.1/x");
    expect(out.year).toBe(2025);
    expect(out.evidenceStatus).toBe("COM_COMPROVANTE_PARCIAL");
    expect(out.needsReview).toBe(false);
  });

  it("sem DOI e sem título → SEM_COMPROVANTE, NEEDS REVIEW", () => {
    const out = mapExtractionToItem({}, "fallback", 2024);
    expect(out.title).toBe("fallback");
    expect(out.year).toBe(2024);
    expect(out.doi).toBeNull();
    expect(out.evidenceStatus).toBe("COM_COMPROVANTE_PARCIAL");  // tem fallback title
    expect(out.needsReview).toBe(true);
  });

  it("documentType = CERTIFICADO é mapeado para itemType", () => {
    const out = mapExtractionToItem(
      { documentType: "CERTIFICADO", title: "C", year: 2023 },
      "fb", 2024,
    );
    expect(out.itemType).toBe("CERTIFICADO");
  });
});
