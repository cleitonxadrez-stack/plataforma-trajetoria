// tests/pdf-regen-picker.test.ts
// Cobertura pura do módulo pickDossiersToRegen. Sem I/O, sem Supabase.

import { describe, it, expect } from "vitest";
import {
  pickDossiersToRegen,
  RegenPickerConfigError,
  type DossierRegenInput,
} from "../lib/domain/pdf-regen-picker";

const NOW_ISO = "2026-08-10T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

function daysAgo(d: number): string {
  return new Date(NOW_MS - d * 86_400_000).toISOString();
}

function d(p: Partial<DossierRegenInput>): DossierRegenInput {
  // Usa `in` (não `??`) nos campos anuláveis: `null ?? default` reintroduzia
  // o default, então os testes de "campo ausente (null)" nunca exercitavam o
  // caminho null na função. Com `in`, o null explícito do teste é preservado.
  return {
    id: p.id ?? "d-1",
    userId: p.userId ?? "u-1",
    status: "status" in p ? p.status : "PRONTO",
    pdfStorageKey: "pdfStorageKey" in p ? p.pdfStorageKey : "quente/d-1/dossie.pdf",
    pdfGeneratedAt: "pdfGeneratedAt" in p ? p.pdfGeneratedAt : daysAgo(10),
    updatedAt: "updatedAt" in p ? p.updatedAt : daysAgo(10),
  };
}

describe("pickDossiersToRegen", () => {
  it("descarta dossiers PRONTO com PDF fresco (dentro do staleAfterDays)", () => {
    const out = pickDossiersToRegen(
      [d({ id: "a", pdfGeneratedAt: daysAgo(10) })],
      { nowIso: NOW_ISO, staleAfterDays: 90 },
    );
    expect(out).toEqual([]);
  });

  it("inclui dossiers PRONTO com PDF stale (> staleAfterDays)", () => {
    const out = pickDossiersToRegen(
      [d({ id: "a", pdfGeneratedAt: daysAgo(100) })],
      { nowIso: NOW_ISO, staleAfterDays: 90 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.reason).toBe("stale_pdf");
    expect(out[0]?.ageDays).toBe(100);
  });

  it("inclui dossiers com status ausente → reason=missing_status", () => {
    const out = pickDossiersToRegen(
      [d({ id: "a", status: null })],
      { nowIso: NOW_ISO },
    );
    expect(out[0]?.reason).toBe("missing_status");
  });

  it("inclui dossiers em status ≠ PRONTO → reason=not_pronto", () => {
    const out = pickDossiersToRegen(
      [
        d({ id: "a", status: "FALHA_PDF", pdfGeneratedAt: daysAgo(1) }),
        d({ id: "b", status: "PRONTO_SEM_PDF" }),
      ],
      { nowIso: NOW_ISO },
    );
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.reason)).toEqual(["not_pronto", "not_pronto"]);
  });

  it("PRONTO sem pdf_storage_key → reason=missing_pdf_key", () => {
    const out = pickDossiersToRegen(
      [d({ status: "PRONTO", pdfStorageKey: null })],
      { nowIso: NOW_ISO },
    );
    expect(out[0]?.reason).toBe("missing_pdf_key");
  });

  it("PRONTO_pdf_storage_key_PRESENTE_sem_pdf_generated_at → reason=missing_pdf_at", () => {
    const out = pickDossiersToRegen(
      [d({ status: "PRONTO", pdfGeneratedAt: null })],
      { nowIso: NOW_ISO },
    );
    expect(out[0]?.reason).toBe("missing_pdf_at");
  });

  it("ordena FIFO — mais velho primeiro, e estável para mesma idade", () => {
    const out = pickDossiersToRegen(
      [
        d({ id: "a", pdfGeneratedAt: daysAgo(100) }),
        d({ id: "b", pdfGeneratedAt: daysAgo(200) }),
        d({ id: "c", pdfGeneratedAt: daysAgo(120) }),
      ],
      { nowIso: NOW_ISO, staleAfterDays: 90 },
    );
    expect(out.map((c) => c.dossierId)).toEqual(["b", "c", "a"]);
  });

  it("estável quando ageDays igual (ordem alfabética por id)", () => {
    const out = pickDossiersToRegen(
      [
        d({ id: "zz", pdfGeneratedAt: daysAgo(100) }),
        d({ id: "aa", pdfGeneratedAt: daysAgo(100) }),
      ],
      { nowIso: NOW_ISO, staleAfterDays: 90 },
    );
    expect(out.map((c) => c.dossierId)).toEqual(["aa", "zz"]);
  });

  it("limita o retorno em `limit` (cap 500)", () => {
    const inputs = Array.from({ length: 600 }, (_, i) =>
      d({ id: `x${i}`, pdfGeneratedAt: daysAgo(200) }),
    );
    const out = pickDossiersToRegen(inputs, { nowIso: NOW_ISO, limit: 123 });
    expect(out).toHaveLength(123);
  });

  it("rejeita limit ≤ 0 (RegenPickerConfigError)", () => {
    expect(() => pickDossiersToRegen([], { nowIso: NOW_ISO, limit: 0 })).toThrow(RegenPickerConfigError);
    expect(() => pickDossiersToRegen([], { nowIso: NOW_ISO, limit: -3 })).toThrow();
  });

  it("rejeita nowIso inválido (RegenPickerConfigError)", () => {
    expect(() => pickDossiersToRegen([], { nowIso: "ontem" })).toThrow(/nowIso/);
  });

  it("0 dossiers → array vazio", () => {
    expect(pickDossiersToRegen([], { nowIso: NOW_ISO })).toEqual([]);
  });

  it("mistura de status: só os 3 candidatos entram", () => {
    const out = pickDossiersToRegen(
      [
        d({ id: "ok-1", status: "PRONTO", pdfStorageKey: "quente/x.pdf", pdfGeneratedAt: daysAgo(10) }),
        d({ id: "stale-1", pdfGeneratedAt: daysAgo(120) }),
        d({ id: "fble-1", status: "FALHA_PDF", pdfGeneratedAt: daysAgo(2) }),
        d({ id: "no-key-1", status: "PRONTO", pdfStorageKey: null }),
      ],
      { nowIso: NOW_ISO },
    );
    expect(out.map((c) => c.dossierId).sort()).toEqual(["fble-1", "no-key-1", "stale-1"]);
  });
});
