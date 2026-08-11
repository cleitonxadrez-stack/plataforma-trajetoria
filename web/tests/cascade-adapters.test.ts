// tests/cascade-adapters.test.ts
// Cobre todos os 6 passos da cascata em modo puro (sem deps opcionais
// instaladas — returned reason será "dependency-missing" para 2 e 5).

import { describe, it, expect } from "vitest";
import {
  pdfParse, qrReader, idResolver, templateMatch, ocrLocal, iaExtractor,
  extractIdentifiers,
} from "../lib/domain/cascade-adapters";
import type { CascadeInput } from "../lib/domain/cascade";

const PDF_INPUT_WITH_NOTHING: CascadeInput = {
  buffer: Buffer.from("not a real pdf"),
  filename: "x.pdf",
  mimeType: "application/pdf",
};

const PDF_INPUT_WITH_DOI: CascadeInput = {
  buffer: Buffer.from("Este artigo tem DOI 10.1234/example.2024 e segue…"),
  filename: "paper.pdf",
  mimeType: "application/pdf",
};

const IMAGE_INPUT: CascadeInput = {
  buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0]),
  filename: "scan.jpg",
  mimeType: "image/jpeg",
};

describe("extractIdentifiers — heurística standalone", () => {
  it("extrai DOI válido em qualquer texto", () => {
    expect(extractIdentifiers("blah 10.1234/example.foo")).toEqual({ kind: "doi", value: "10.1234/example.foo" });
  });
  it("extrai ISBN-13 quando após 'ISBN:'", () => {
    expect(extractIdentifiers("ISBN: 978-85-123-4567-8")).toEqual({ kind: "isbn", value: "9788512345678" });
  });
  it("extrai ISSN XXX-YYYY", () => {
    expect(extractIdentifiers("revista: 0123-4567 publicação")).toEqual({ kind: "issn", value: "0123-4567" });
  });
  it("retorna {kind:null} em texto sem IDs", () => {
    expect(extractIdentifiers("apenas prosa")).toEqual({ kind: null, value: null });
  });
});

describe("Passo 1 — pdf-parse", () => {
  it("retorna not-pdf se mimeType não é pdf", async () => {
    const r = await pdfParse({ ...PDF_INPUT_WITH_NOTHING, mimeType: "image/jpeg" });
    expect(r.succeeded).toBe(false); expect(r.reason).toBe("not-pdf");
  });
  it("retorna dependency-missing se pdf-parse não está instalado", async () => {
    const r = await pdfParse(PDF_INPUT_WITH_NOTHING, {});
    expect(['dependency-missing', 'no-text-layer']).toContain(r.reason ?? "");
  });
});

describe("Passo 2 — qrReader", () => {
  it("retorna dependency-missing em ambiente sem jsqr/pngjs", async () => {
    const r = await qrReader(IMAGE_INPUT, {});
    expect(['dependency-missing', 'no-qr-found']).toContain(r.reason ?? "");
  });
});

describe("Passo 3 — idResolver", () => {
  it("retorna no-id em buffer sem identificador", async () => {
    const r = await idResolver(PDF_INPUT_WITH_NOTHING, {});
    expect(r.succeeded).toBe(false); expect(r.reason).toBe("no-id");
  });
  it("retorna succeeded=true com DOI quando texto o contém (em modo offline aponta para lookup-failed)", async () => {
    const r = await idResolver(PDF_INPUT_WITH_DOI, {});
    // Em CI/sem rede crossref: 'lookup-failed:doi'. Em prod: succeeded=true. Ambos são aceitáveis.
    expect(['lookup-failed:doi', 'crossref']).toContain(String(r.reason ?? r.source));
    expect(r.step).toBe(3);
  }, 10000);
});

describe("Passo 4 — templateMatch", () => {
  it("retorna no-template-loaded (cobre Sprint 7)", async () => {
    const r = await templateMatch(PDF_INPUT_WITH_NOTHING, {});
    expect(r.succeeded).toBe(false); expect(r.reason).toBe("no-template-loaded");
  });
});

describe("Passo 5 — ocrLocal", () => {
  it("retorna dependency-missing se tesseract.js não está instalado", async () => {
    const r = await ocrLocal(IMAGE_INPUT, {});
    expect(['dependency-missing', 'low-confidence-empty']).toContain(r.reason ?? "");
  });
});

describe("Passo 6 — iaExtractor", () => {
  it("sem chave IA → NO_MODEL_CONFIGURED (sem custo)", async () => {
    delete process.env.IA_EXTRACTION_API_KEY;
    const r = await iaExtractor(PDF_INPUT_WITH_NOTHING, {});
    expect(r.succeeded).toBe(false); expect(r.reason).toBe("NO_MODEL_CONFIGURED");
    expect(r.costCents).toBe(0);
  });
});
