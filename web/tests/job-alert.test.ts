// tests/job-alert.test.ts
// Cobre analyzeFailures (módulo puro, sem I/O, sem Supabase).

import { describe, it, expect } from "vitest";
import {
  analyzeFailures,
  AlertConfigError,
  type FailureEvent,
} from "../lib/queue/job-alert";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const NOW_ISO = "2026-08-10T12:00:00.000Z";

function ev(name: string, minutesAgo: number, msg = "boom"): FailureEvent {
  return { ts: NOW - minutesAgo * 60_000, name, msg };
}

describe("analyzeFailures", () => {
  it("0 eventos → severity=ok, total=0", () => {
    const p = analyzeFailures([], NOW, undefined, NOW_ISO);
    expect(p.severity).toBe("ok");
    expect(p.totalFailures).toBe(0);
    expect(p.ratePerHour).toBe(0);
    expect(p.topFailures).toEqual([]);
    expect(p.evaluatedAt).toBe(NOW_ISO);
  });

  it("1 falha em 60 min → WARNING (1/h) com default", () => {
    const p = analyzeFailures([ev("extract-cascade", 10)], NOW, undefined, NOW_ISO);
    expect(p.severity).toBe("warning");
    expect(p.totalFailures).toBe(1);
    expect(p.ratePerHour).toBe(1);
    expect(p.topFailures).toEqual([{ name: "extract-cascade", count: 1 }]);
  });

  it("5 falhas em 60 min → CRITICAL (5/h ≥ limite padrão 2/h)", () => {
    const events = [
      ev("extract-cascade", 50),
      ev("extract-cascade", 40),
      ev("recovery-build", 30),
      ev("recovery-build", 20),
      ev("recovery-build", 5),
    ];
    const p = analyzeFailures(events, NOW, undefined, NOW_ISO);
    expect(p.severity).toBe("critical");
    expect(p.totalFailures).toBe(5);
    expect(p.ratePerHour).toBe(5);
    expect(p.topFailures).toEqual([
      { name: "recovery-build", count: 3 },
      { name: "extract-cascade", count: 2 },
    ]);
  });

  it("eventos FORA da janela são ignorados", () => {
    const events = [
      ev("extract-cascade", 5),       // dentro
      ev("extract-cascade", 90),      // fora (>60)
      ev("recovery-build", 120),      // fora
    ];
    const p = analyzeFailures(events, NOW, { windowMinutes: 60 }, NOW_ISO);
    expect(p.totalFailures).toBe(1);
    expect(p.topFailures).toEqual([{ name: "extract-cascade", count: 1 }]);
    expect(p.severity).toBe("warning");
  });

  it("threshold customizado: criticalThresholdPerHour=10, 4 falhas em 60 min → warning", () => {
    const events = Array.from({ length: 4 }, (_, i) => ev("pdf-generate", 50 - i));
    const p = analyzeFailures(events, NOW, {
      windowMinutes: 60,
      criticalThresholdPerHour: 10,
      warningThresholdPerHour: 2,
    }, NOW_ISO);
    expect(p.severity).toBe("warning");
    expect(p.ratePerHour).toBe(4);
  });

  it("rejeita windowMinutes inválido (≤0 ou > maxWindow)", () => {
    expect(() => analyzeFailures([], NOW, { windowMinutes: 0 })).toThrow(AlertConfigError);
    expect(() => analyzeFailures([], NOW, { windowMinutes: 721 })).toThrow(/720/);
  });

  it("rejeita warningThreshold > criticalThreshold", () => {
    expect(() =>
      analyzeFailures([], NOW, {
        windowMinutes: 60,
        criticalThresholdPerHour: 1,
        warningThresholdPerHour: 5,
      }),
    ).toThrow(AlertConfigError);
  });

  it("topN limita a lista (topN=2 com 4 jobs diferentes)", () => {
    const events = [
      ev("a", 10),
      ev("a", 9),
      ev("b", 8),
      ev("b", 7),
      ev("c", 6),
      ev("d", 5),
    ];
    const p = analyzeFailures(events, NOW, { windowMinutes: 60, topN: 2 }, NOW_ISO);
    expect(p.topFailures).toEqual([
      { name: "a", count: 2 },
      { name: "b", count: 2 },
    ]);
  });

  it("ratePerHour arredondada para 2 casas", () => {
    const events = Array.from({ length: 3 }, (_, i) => ev("x", 10 - i));
    const p = analyzeFailures(events, NOW, { windowMinutes: 60 }, NOW_ISO);
    expect(p.ratePerHour).toBe(3); // 3/1h exato
  });

  it("eventos com ts fora de [now-window, now] ignorados", () => {
    const events: FailureEvent[] = [
      { ts: NOW - 30 * 60_000, name: "ok1", msg: "" },
      { ts: NOW + 5 * 60_000, name: "futuro-ignorar", msg: "" }, // futuro
      { ts: 0, name: "epoch-zero", msg: "" }, // fora da janela
    ];
    const p = analyzeFailures(events, NOW, { windowMinutes: 60 }, NOW_ISO);
    expect(p.totalFailures).toBe(1);
    expect(p.topFailures).toEqual([{ name: "ok1", count: 1 }]);
  });

  it("reasons inclui texto descritivo conforme severity", () => {
    const warnings = analyzeFailures([ev("a", 5)], NOW, undefined, NOW_ISO);
    expect(warnings.reasons[0]).toMatch(/WARN/);

    const oks = analyzeFailures([], NOW, undefined, NOW_ISO);
    expect(oks.reasons[0]).toMatch(/silêncio saudável/);
  });
});
