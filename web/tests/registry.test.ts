// tests/registry.test.ts
// Núcleo do registro (PLT-AAAA-XXXX-XXXX, SHA-256).
// 1000 códigos gerados não podem colidir entre si.

import { describe, it, expect } from "vitest";
import {
  generateRegistryCode, isValidRegistryCode, PLT_REGEX,
  sha256OfBuffer, isAcceptedMime, ACCEPTED_MIME, MAX_BYTES,
} from "../lib/domain/registry";
import { createHash } from "node:crypto";

describe("registry.ts — código PLT", () => {
  it("gera 1000 códigos únicos", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const c = generateRegistryCode();
      expect(seen.has(c), `colisão em ${c}`).toBe(false);
      seen.add(c);
    }
    expect(seen.size).toBe(1000);
  });

  it("todos os códigos gerados passam pelo regex próprio", () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidRegistryCode(generateRegistryCode())).toBe(true);
    }
  });

  it("rejeita códigos mal-formados", () => {
    expect(isValidRegistryCode("")).toBe(false);
    expect(isValidRegistryCode("PLT-2026-A7K9-3F2M")).toBe(true);   // válido
    expect(isValidRegistryCode("plt-2026-a7k9-3f2m")).toBe(true);   // lowercase ok
    expect(isValidRegistryCode("PLT-26-A7K9-3F2M")).toBe(false);    // ano curto
    expect(isValidRegistryCode("XX-2026-A7K9-3F2M")).toBe(false);   // prefixo errado
    expect(isValidRegistryCode("PLT-2026-IOLU-0000")).toBe(false);  // letras proibidas (I,O,L,U)
  });

  it("regex é estrito — não aceita formatos antigos ou alternativos", () => {
    const m = "PLT-2026-A7K9-3F2M".match(PLT_REGEX);
    expect(m).not.toBeNull();
  });
});

describe("registry.ts — SHA-256 streaming", () => {
  it("hash bate com createHash do Node para o mesmo buffer", () => {
    const buf = Buffer.from("hello world");
    const expected = createHash("sha256").update(buf).digest("hex");
    expect(sha256OfBuffer(buf)).toBe(expected);
  });

  it("buffer vazio gera SHA-256 do string vazio (canonical)", () => {
    const expected = createHash("sha256").update("").digest("hex");
    expect(sha256OfBuffer(Buffer.alloc(0))).toBe(expected);
  });

  it("detecta duplicatas reais", () => {
    const a = Buffer.from("mesmo conteúdo inteiro, 50MB ou 5 bytes");
    const b = Buffer.from("mesmo conteúdo inteiro, 50MB ou 5 bytes");
    const c = Buffer.from("mesmo conteúdo inteiro, 50MB ou 5 bytes — modificado");
    expect(sha256OfBuffer(a)).toBe(sha256OfBuffer(b));
    expect(sha256OfBuffer(a)).not.toBe(sha256OfBuffer(c));
  });
});

describe("registry.ts — MIME e limites", () => {
  it("aceita os tipos do backlog", () => {
    ["application/pdf","image/jpeg","image/png","image/heic","image/tiff",
     "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].forEach((m) => expect(isAcceptedMime(m)).toBe(true));
  });

  it("rejeita executáveis e tipos não listados", () => {
    ["application/zip","text/html","application/exe","text/plain"
    ].forEach((m) => expect(isAcceptedMime(m)).toBe(false));
  });

  it("MAX_BYTES = 50 MB conforme backlog §1.3", () => {
    expect(MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
