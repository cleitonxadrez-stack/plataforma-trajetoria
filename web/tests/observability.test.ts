// tests/observability.test.ts
// BLOCO 7 — Logger estruturado + métricas.
//
// Asserções:
//   1. Logger nunca vaza PII (userId, cpf, email, full_name).
//   2. red() remove tudo recursivo.
//   3. metrics.snapshot() retorna contadores + histograma com p50/p90/p99.
//   4. measured() mede duração sem false-positive.

import { describe, it, expect } from "vitest";
import { log, redact } from "../lib/observability/log";
import { metrics, Schemas, measured } from "../lib/observability/metrics";

describe("logger — privacy (CLAUDE.md §PII)", () => {
  it("redact remove userId e email do data", () => {
    const entry = log({
      level: "info",
      scope: "registry",
      event: "document.registered",
      msg: "ok",
      data: { userId: "u-1", email: "x@y.br", count: 3 },
    });
    expect(JSON.stringify(entry)).not.toContain("u-1");
    expect(JSON.stringify(entry)).not.toContain("x@y.br");
    expect(entry.data?.count).toBe(3);
  });

  it("redact recursivo em objetos aninhados", () => {
    const entry = log({
      level: "info",
      scope: "cascade",
      event: "step.done",
      data: { stage: { userId: "u-2", sha: "abc" }, list: [{ cpf: "123" }] },
    });
    expect(JSON.stringify(entry)).not.toContain("u-2");
    expect(JSON.stringify(entry)).not.toContain("123");
  });

  it("trunca strings > 240 chars", () => {
    const long = "x".repeat(400);
    const out = redact({
      ts: "n", level: "info", scope: "x", event: "y", data: { body: long },
    });
    expect(String(out.data?.body).length).toBeLessThanOrEqual(245);
  });
});

describe("metrics — contadores e histogramas", () => {
  it("inc() retorna snapshot com type=counter", () => {
    metrics.inc("test.counter", 1, { route: "/x" });
    metrics.inc("test.counter", 2, { route: "/x" });
    const snap = metrics.snapshot() as Record<string, { type: string; value: number }>;
    expect(snap["test.counter{route=/x}"].type).toBe("counter");
    expect(snap["test.counter{route=/x}"].value).toBe(3);
  });

  it("observe() retorna histogram com p50/p90/p99", () => {
    for (let i = 1; i <= 100; i++) metrics.observe("test.h", i);
    const snap = metrics.snapshot() as Record<string, { type: string; count: number; p50: number; p90: number; p99: number }>;
    const h = snap["test.h"];
    expect(h.type).toBe("histogram");
    expect(h.count).toBe(100);
    expect(h.p50).toBeGreaterThanOrEqual(49);
    expect(h.p90).toBeGreaterThanOrEqual(89);
    expect(h.p99).toBeGreaterThanOrEqual(98);
  });

  it("measured() executa a função e mede duração", async () => {
    const out = await measured(Schemas.cascadeStep, { step: "6" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(out).toBe(42);
    const recent = metrics.recent(Schemas.cascadeStep);
    expect(recent.length).toBeGreaterThan(0);
  });
});
