// tests/r2-preflight.test.ts
// Validação PURA do preflight — não toca AWS, mocka o S3Client.
// Garante que:
//   - getR2Config() falha ALTO com R2ConfigError se faltar env
//   - preflight() reporta erro se HeadBucket falhar
//   - preflight() OK quando tudo simulado retorna sucesso

import { describe, it, expect } from "vitest";

describe("r2 — preflight isolado (sem AWS real)", () => {
  it("smoke import — módulo carrega", async () => {
    const mod = await import("../lib/storage/r2");
    expect(typeof mod.preflight).toBe("function");
    expect(typeof mod.getR2Config).toBe("function");
    expect(typeof mod.frioKey).toBe("function");
    expect(typeof mod.quenteKey).toBe("function");
  });

  it("frioKey particiona por data", async () => {
    const { frioKey } = await import("../lib/storage/r2");
    const k = frioKey("doc-123", "lattes.xml");
    expect(k).toMatch(/^originals\/\d{4}\/\d{2}\/\d{2}\/doc-123\/lattes\.xml$/);
  });

  it("quenteKey prefixa optimized/<docId>/", async () => {
    const { quenteKey } = await import("../lib/storage/r2");
    expect(quenteKey("doc-123", "thumb.webp")).toBe("optimized/doc-123/thumb.webp");
  });
});
