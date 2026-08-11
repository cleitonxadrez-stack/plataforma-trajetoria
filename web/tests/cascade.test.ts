// tests/cascade.test.ts
// Prova formal da asserção do backlog §2.1:
//
//   "Se um passo N da cascata resolve, passos > N NUNCA rodam,
//    e o custo permanece 0. IA NÃO é chamada quando passo anterior resolve."
//
// Os adapters são mockados para simular cada caminho.

import { describe, it, expect, vi, beforeEach } from "vitest";

const adapterSlots = vi.hoisted(() => ({
  pdfParse: vi.fn(),
  qrReader: vi.fn(),
  idResolver: vi.fn(),
  templateMatch: vi.fn(),
  ocrLocal: vi.fn(),
  iaExtractor: vi.fn(),
}));

vi.mock("../lib/domain/cascade-adapters", () => adapterSlots);

import { runCascade, type CascadeInput } from "../lib/domain/cascade";

function input(): CascadeInput {
  return { buffer: Buffer.from("fake"), filename: "x.pdf", mimeType: "application/pdf" };
}

beforeEach(() => {
  adapterSlots.pdfParse.mockReset();
  adapterSlots.qrReader.mockReset();
  adapterSlots.idResolver.mockReset();
  adapterSlots.templateMatch.mockReset();
  adapterSlots.ocrLocal.mockReset();
  adapterSlots.iaExtractor.mockReset();
});

// Caso A — passo 1 resolve de cara: IA nunca chamada, 1 step, custo 0.
describe("cascade.ts — passo 1 resolve", () => {
  it("IA nunca é chamada, custo total 0, 1 step registrado", async () => {
    adapterSlots.pdfParse.mockResolvedValue({
      step: 1, source: "pdf-parse", succeeded: true, confidence: 0.9,
      fields: { title: "X" }, costCents: 0,
    });
    adapterSlots.iaExtractor.mockResolvedValue({
      step: 6, source: "ia-strong", succeeded: true, fields: {},
    });

    const out = await runCascade(input(), "doc-1");
    expect(adapterSlots.pdfParse).toHaveBeenCalledTimes(1);
    expect(adapterSlots.iaExtractor).not.toHaveBeenCalled();
    expect(out.steps).toHaveLength(1);
    expect(out.totalCostCents).toBe(0);
    expect(out.usedAI).toBe(false);
    expect(out.fields.title).toBe("X");
  });
});

// Caso B — passo 3 resolve com DOI (caminho crossref): custo 0, IA não chamada.
describe("cascade.ts — passo 3 resolve", () => {
  it("passos 4-6 nunca chamados, custo 0, 3 steps registrados", async () => {
    adapterSlots.pdfParse.mockResolvedValue({ step: 1, source: "pdf-parse", succeeded: false });
    adapterSlots.qrReader.mockResolvedValue({ step: 2, source: "jsqr", succeeded: false });
    adapterSlots.idResolver.mockResolvedValue({
      step: 3, source: "crossref", succeeded: true,
      confidence: 0.95, fields: { doi: "10.123/abc" }, costCents: 0,
    });
    adapterSlots.templateMatch.mockResolvedValue({ step: 4, source: "template", succeeded: true });
    adapterSlots.ocrLocal.mockResolvedValue({ step: 5, source: "ocr-tesseract", succeeded: true });
    adapterSlots.iaExtractor.mockResolvedValue({ step: 6, source: "ia-strong", succeeded: true });

    const out = await runCascade(input(), "doc-2");
    expect(adapterSlots.pdfParse).toHaveBeenCalledTimes(1);
    expect(adapterSlots.qrReader).toHaveBeenCalledTimes(1);
    expect(adapterSlots.idResolver).toHaveBeenCalledTimes(1);
    expect(adapterSlots.templateMatch).not.toHaveBeenCalled();
    expect(adapterSlots.ocrLocal).not.toHaveBeenCalled();
    expect(adapterSlots.iaExtractor).not.toHaveBeenCalled();
    expect(out.steps).toHaveLength(3);
    expect(out.totalCostCents).toBe(0);
    expect(out.usedAI).toBe(false);
    expect(out.fields.doi).toBe("10.123/abc");
  });
});

// Caso C — passos 1–5 falham: IA é chamada, 6 steps, custo > 0.
describe("cascade.ts — passo 6 chamado após todos falharem", () => {
  it("IA chamada uma vez, custo registrado, 6 steps no total", async () => {
    adapterSlots.pdfParse.mockResolvedValue({ step: 1, source: "pdf-parse", succeeded: false });
    adapterSlots.qrReader.mockResolvedValue({ step: 2, source: "jsqr", succeeded: false });
    adapterSlots.idResolver.mockResolvedValue({ step: 3, source: "crossref", succeeded: false });
    adapterSlots.templateMatch.mockResolvedValue({ step: 4, source: "template", succeeded: false });
    adapterSlots.ocrLocal.mockResolvedValue({ step: 5, source: "ocr-tesseract", succeeded: false });
    adapterSlots.iaExtractor.mockResolvedValue({
      step: 6, source: "ia-strong", succeeded: true,
      confidence: 0.7, fields: { title: "Y" }, costCents: 12,
    });

    const out = await runCascade(input(), "doc-3");
    expect(out.steps).toHaveLength(6);
    expect(out.usedAI).toBe(true);
    expect(out.totalCostCents).toBe(12);
    expect(adapterSlots.iaExtractor).toHaveBeenCalledTimes(1);
  });
});
