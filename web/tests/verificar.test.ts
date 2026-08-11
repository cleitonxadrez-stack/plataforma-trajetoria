// tests/verificar.test.ts
// Verifica regras do helper de exibição pública de /verificar/[codigo].
// Pure-function tests — sem DB, sem fetch.

import { describe, it, expect } from "vitest";
import {
  buildVerificationView,
  mimeToCategory,
  formatDateBR,
  shortFingerprint,
  AUTHENTICITY_DISCLAIMER,
  NOT_FOUND_DISCLAIMER,
} from "../lib/domain/verificar";
import { isValidRegistryCode } from "../lib/domain/registry";

describe("verificar — helpers", () => {
  it("mimeToCategory classifica PDF/Imagem/Word sem expor MIME cru", () => {
    expect(mimeToCategory("application/pdf")).toBe("Documento PDF");
    expect(mimeToCategory("image/png")).toBe("Imagem");
    expect(mimeToCategory("image/jpeg")).toBe("Imagem");
    expect(mimeToCategory("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
      .toBe("Documento de texto");
    expect(mimeToCategory(null)).toBe("Arquivo digital");
  });

  it("formatDateBR é determinístico e usa UTC", () => {
    expect(formatDateBR("2026-08-10T01:23:45.000Z")).toBe("10/08/2026");
    expect(formatDateBR("2024-01-01T00:00:00Z")).toBe("01/01/2024");
    expect(formatDateBR(null)).toBeNull();
    expect(formatDateBR("")).toBeNull();
    expect(formatDateBR("não é data")).toBeNull();
  });

  it("shortFingerprint expõe só os primeiros 8 chars", () => {
    const sha = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    expect(shortFingerprint(sha)).toBe("ABCDEF01");
    expect(shortFingerprint(null)).toBeNull();
    expect(shortFingerprint("1234567")).toBeNull(); // curto demais
  });

  it("PLT regex aceita canônico e rejeita variações", () => {
    expect(isValidRegistryCode("PLT-2026-ABCD-EFGH")).toBe(true);
    expect(isValidRegistryCode("plt-2026-abcd-efgh")).toBe(true); // case-insensitive no caller
    expect(isValidRegistryCode("PLT-26-ABCD-EFGH")).toBe(false);   // ano curto
    expect(isValidRegistryCode("PLT-2026-ILOU-EFGH")).toBe(false);// letras ambíguas (I,L,O,U)
    expect(isValidRegistryCode("qualquer")).toBe(false);
  });

  it("disclaimers são fixos e incluem palavras-chave necessárias", () => {
    expect(AUTHENTICITY_DISCLAIMER).toContain("NÃO confirma autoria");
    expect(AUTHENTICITY_DISCLAIMER).toContain("existência do arquivo");
    expect(NOT_FOUND_DISCLAIMER).toContain("PLT-AAAA-XXXX-XXXX");
  });
});

describe("verificar — buildVerificationView", () => {
  const fixture = {
    registryCode: "PLT-2026-ABCD-EFGH",
    visibility: "PUBLICO" as const,
    originalFilename: "diploma-mestrado.pdf",
    mimeType: "application/pdf",
    registeredAt: "2026-08-10T12:00:00.000Z",
    sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  };

  it("PUBLICO: expõe filename, categoria, data BR, fingerprint prefixo", () => {
    const v = buildVerificationView(fixture);
    expect(v.ok).toBe(true);
    expect(v.filename).toBe("diploma-mestrado.pdf");
    expect(v.category).toBe("Documento PDF");
    expect(v.registeredAtBR).toBe("10/08/2026");
    expect(v.fingerprint).toBe("ABCDEF01");
    expect(v.authenticityStatement).toBe(AUTHENTICITY_DISCLAIMER);
  });

  it("PRIVADO: oculta filename, categoria, data e fingerprint", () => {
    const v = buildVerificationView({ ...fixture, visibility: "PRIVADO" });
    expect(v.ok).toBe(true);
    expect(v.filename).toBeNull();
    expect(v.category).toBeNull();
    expect(v.registeredAtBR).toBeNull();
    expect(v.fingerprint).toBeNull();
    expect(v.authenticityStatement).toBe(AUTHENTICITY_DISCLAIMER);
  });

  it("código fora do padrão → erro 'FORMATO_INVALIDO' (defesa)", () => {
    const v = buildVerificationView({ ...fixture, registryCode: "lixo" });
    expect(v.ok).toBe(false);
    expect(v.error).toBe("Formato de código inválido.");
  });

  it("PUBLICO mas MIME ausente → category 'Arquivo digital' (sem vazar MIME cru)", () => {
    const v = buildVerificationView({ ...fixture, mimeType: null });
    expect(v.category).toBe("Arquivo digital");
  });
});
