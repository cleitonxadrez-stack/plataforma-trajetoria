// tests/download-link.test.ts
// Cobre o módulo puro buildDownloadLink — sem I/O, sem Supabase.

import { describe, it, expect } from "vitest";
import {
  buildDownloadLink,
  clampTtl,
  fingerprintLink,
  normalizeStorageKey,
  DownloadLinkValidationError,
  DEFAULT_TTL_SEC,
  MAX_TTL_SEC,
  MIN_TTL_SEC,
} from "../lib/storage/download-link";

const K = "quente/d-abc-123/dossie.pdf";

describe("clampTtl", () => {
  it("default quando input undefined / NaN", () => {
    expect(clampTtl(undefined)).toBe(DEFAULT_TTL_SEC);
    expect(clampTtl(Number.NaN)).toBe(DEFAULT_TTL_SEC);
  });
  it("floor para MIN_TTL_SEC", () => {
    expect(clampTtl(0)).toBe(MIN_TTL_SEC);
    expect(clampTtl(15)).toBe(MIN_TTL_SEC);
    expect(clampTtl(-99)).toBe(MIN_TTL_SEC);
  });
  it("clamp para MAX_TTL_SEC", () => {
    expect(clampTtl(9999)).toBe(MAX_TTL_SEC);
    expect(clampTtl(MAX_TTL_SEC + 1)).toBe(MAX_TTL_SEC);
  });
  it("passa dentro e trunca para inteiros", () => {
    expect(clampTtl(120)).toBe(120);
    expect(clampTtl(120.99)).toBe(120);
  });
});

describe("normalizeStorageKey", () => {
  it("aceita chave válida e separa bucket/objectKey", () => {
    const n = normalizeStorageKey(K);
    expect(n.bucket).toBe("quente");
    expect(n.objectKey).toBe("d-abc-123/dossie.pdf");
    expect(n.storageKey).toBe(K);
  });
  it("rejeita chave vazia", () => {
    expect(() => normalizeStorageKey("")).toThrow(DownloadLinkValidationError);
    expect(() => normalizeStorageKey("   ")).toThrow(DownloadLinkValidationError);
  });
  it("rejeita bucket diferente", () => {
    expect(() => normalizeStorageKey("frio/x/y.pdf")).toThrow(/apenas bucket "quente"/);
  });
  it("rejeita path traversal", () => {
    expect(() => normalizeStorageKey("quente/../dossie.pdf")).toThrow();
    expect(() => normalizeStorageKey('quente\\dossie.pdf')).toThrow();
  });
  it("rejeita chave sem .pdf", () => {
    expect(() => normalizeStorageKey("quente/dossie.txt")).toThrow(/terminar em .pdf/);
  });
  it("rejeita chave que começa/termina com /", () => {
    expect(() => normalizeStorageKey("/quente/x.pdf")).toThrow();
    expect(() => normalizeStorageKey("quente/x.pdf/")).toThrow();
  });
});

describe("fingerprintLink", () => {
  it("hex de 40 chars", () => {
    const fp = fingerprintLink(K, 60);
    expect(fp).toMatch(/^[a-f0-9]{40}$/);
  });
  it("estável para (key,ttl)", () => {
    expect(fingerprintLink(K, 60)).toBe(fingerprintLink(K, 60));
    expect(fingerprintLink(K, 60)).not.toBe(fingerprintLink(K, 61));
  });
});

describe("buildDownloadLink", () => {
  it("envelope completo em now fixa", () => {
    const env = buildDownloadLink({
      storageKey: K,
      expiresInSec: 60,
      now: "2026-08-10T12:00:00.000Z",
    });
    expect(env.bucket).toBe("quente");
    expect(env.objectKey).toBe("d-abc-123/dossie.pdf");
    expect(env.expiresInSec).toBe(60);
    expect(env.expiresAt).toBe("2026-08-10T12:01:00.000Z");
    expect(env.linkFingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it("TTL fora da faixa é clamped (não rejeitado)", () => {
    const a = buildDownloadLink({ storageKey: K, expiresInSec: 1, now: "2026-01-01T00:00:00.000Z" });
    expect(a.expiresInSec).toBe(MIN_TTL_SEC);
    const b = buildDownloadLink({ storageKey: K, expiresInSec: 99999, now: "2026-01-01T00:00:00.000Z" });
    expect(b.expiresInSec).toBe(MAX_TTL_SEC);
  });

  it("storageKey inválida → throw estruturado com field=storageKey", () => {
    expect(() =>
      buildDownloadLink({ storageKey: "frio/x/y.pdf", now: "2026-01-01T00:00:00.000Z" }),
    ).toThrow(DownloadLinkValidationError);
  });

  it("now inválido → throw validação storageKey", () => {
    expect(() => buildDownloadLink({ storageKey: K, now: "ontem" })).toThrow(/now.*válido/);
  });

  it("idempotente: mesmas entradas → mesmo envelope", () => {
    const a = buildDownloadLink({ storageKey: K, expiresInSec: 60, now: "2026-08-10T00:00:00.000Z" });
    const b = buildDownloadLink({ storageKey: K, expiresInSec: 60, now: "2026-08-10T00:00:00.000Z" });
    expect(a).toEqual(b);
  });
});
