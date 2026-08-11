// tests/upload-validation.test.ts
// Validação pura de upload — backstop antes da action tocar Supabase/R2.

import { describe, it, expect } from "vitest";
import {
  validateUpload, sanitizeFilename,
} from "../lib/domain/validation/upload";
import { MAX_BYTES } from "../lib/domain/registry";

const BASE: { filename: string; sizeBytes: number; mimeType: string } = { filename: "doc.pdf", sizeBytes: 1024, mimeType: "application/pdf" };

describe("validation/upload — happy path", () => {
  it("PDF dentro do tamanho → ok", () => {
    const r = validateUpload({ ...BASE, mimeType: "application/pdf" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filename).toBe("doc.pdf");
      expect(r.sizeBytes).toBe(1024);
      expect(r.mimeType).toBe("application/pdf");
    }
  });

  it.each([
    ["application/pdf"],
    ["image/jpeg"], ["image/png"], ["image/heic"], ["image/tiff"],
    ["application/msword"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("aceita mime %s", (mimeType) => {
    const r = validateUpload({ ...BASE, mimeType });
    expect(r.ok).toBe(true);
  });
});

describe("validation/upload — rejeições", () => {
  it("rejeita executáveis e tipos não listados", () => {
    const r = validateUpload({ ...BASE, mimeType: "application/zip" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("MIME_NOT_ACCEPTED");
  });

  it("rejeita arquivo acima de 50 MB", () => {
    const r = validateUpload({ ...BASE, sizeBytes: MAX_BYTES + 1, mimeType: "application/pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FILE_TOO_LARGE");
  });

  it("rejeita arquivo vazio", () => {
    const r = validateUpload({ ...BASE, sizeBytes: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["EMPTY_FILE", "MIME_NOT_ACCEPTED"]).toContain(r.error);
  });

  it("rejeita dedupe por SHA-256 se hash já conhecido", () => {
    const r = validateUpload({
      ...BASE, mimeType: "application/pdf",
      sha256: "deadbeef", knownHashes: ["deadbeef", "cafebabe"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DUPLICATE");
  });

  it("não recusa hash novo mesmo com knownHashes populado", () => {
    const r = validateUpload({
      ...BASE, mimeType: "application/pdf",
      sha256: "novohash", knownHashes: ["outro1", "outro2"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("substitui separadores e caracteres de controle", () => {
    expect(sanitizeFilename("a/b\\c.pdf")).toBe("a_b_c.pdf");
    expect(sanitizeFilename("a\nb.pdf")).toBe("a_b.pdf");
  });
  it("renomeia nomes reservados (Windows)", () => {
    expect(sanitizeFilename("CON.pdf").startsWith("_")).toBe(true);
    expect(sanitizeFilename("COM1").startsWith("_")).toBe(true);
  });
  it("truncar a 220 caracteres de filename", () => {
    const long = "x".repeat(300) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(220);
  });
  it("retorna 'arquivo' para string vazia", () => {
    expect(sanitizeFilename("")).toBe("arquivo");
  });
});
