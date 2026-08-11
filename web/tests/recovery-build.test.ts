// tests/recovery-build.test.ts
// Cobre o módulo puro buildRecoveryRequests — composição entre groupByInstitution
// e generateLetter, com fingerprint idempotente.
//
// Sem DB. Sem chain React/Supabase. Determinístico.

import { describe, it, expect } from "vitest";
import {
  buildRecoveryRequests,
  fingerprintFromIds,
} from "../lib/domain/recovery-build";
import {
  type RecoveryItemInput,
  type RecoveryInstitutionInput,
} from "../lib/domain/recovery";

const UNIPAR: RecoveryInstitutionInput = {
  id: "inst-unipar",
  name: "Universidade Paranaense — UNIPAR",
  contactChannels: {
    secretariaAcademica: "secretaria@unipar.br",
    biblioteca: "bib@unipar.br",
  },
};
const INST_OUTRO: RecoveryInstitutionInput = {
  id: "inst-x",
  name: "Universidade Sem Canal",
  contactChannels: {},
};

function item(p: Partial<RecoveryItemInput>): RecoveryItemInput {
  return {
    id: p.id ?? crypto.randomUUID(),
    title: p.title ?? "Sem título",
    year: p.year ?? 2023,
    itemType: p.itemType ?? "CERTIFICADO",
    institutionName: p.institutionName ?? "Universidade Paranaense — UNIPAR",
    evidenceStatus: p.evidenceStatus ?? "SEM_COMPROVANTE",
  };
}

describe("recovery-build — fingerprint idempotente", () => {
  it("ids em qualquer ordem produzem o mesmo fingerprint", () => {
    const a = fingerprintFromIds(["a", "b", "c"]);
    const b = fingerprintFromIds(["c", "a", "b"]);
    const c = fingerprintFromIds(["b", "c", "a"]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/^[a-f0-9]{40}$/);
  });
  it("ids diferentes → fingerprint diferente", () => {
    const a = fingerprintFromIds(["a", "b"]);
    const c = fingerprintFromIds(["a", "c"]);
    expect(a).not.toBe(c);
  });
});

describe("buildRecoveryRequests", () => {
  it("exclui itens COMPROVADO antes de agrupar (regra do Bloco 6)", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano de Tal",
      items: [
        item({ id: "i-1", evidenceStatus: "COMPROVADO" }),
        item({ id: "i-2", evidenceStatus: "SEM_COMPROVANTE" }),
      ],
      institutions: [UNIPAR],
    });
    expect(out.totals.pendingItems).toBe(1);
    expect(out.totals.items).toBe(1);
    expect(out.rows[0]?.itemIds).toEqual(["i-2"]);
  });

  it("12 itens da UNIPAR → 1 row (não 12)", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ id: `unipar-${i}`, institutionName: "Universidade Paranaense — UNIPAR" }),
    );
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items,
      institutions: [UNIPAR],
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.itemIds).toHaveLength(12);
    expect(out.rows[0]?.channelUsed).toBe("secretariaAcademica");
    expect(out.rows[0]?.preferredAddress).toBe("secretaria@unipar.br");
  });

  it("consentTextVersion propaga para todas as rows", () => {
    const items = [item({ id: "a" }), item({ id: "b", institutionName: "Universidade Sem Canal" })];
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items,
      institutions: [UNIPAR, INST_OUTRO],
      consentTextVersion: "v2.0",
    });
    expect(out.rows.length).toBeGreaterThan(0);
    for (const r of out.rows) {
      expect(r.consentTextVersion).toBe("v2.0");
    }
  });

  it("letterBody contém o institutionName + número de itens correto", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Maria Silva",
      items: [
        item({ id: "x1", title: "Curso A" }),
        item({ id: "x2", title: "Curso B" }),
      ],
      institutions: [UNIPAR],
      now: "2026-01-15T10:00:00.000Z",
    });
    expect(out.rows).toHaveLength(1);
    const body = out.rows[0]?.letterBody ?? "";
    expect(body).toContain("Universidade Paranaense — UNIPAR");
    expect(body).toContain("Maria Silva");
    expect(body).toContain("Itens (2)");
    expect(body).toContain("Curso A");
    expect(body).toContain("Curso B");
  });

  it("fingerprint é estável entre invocações (idempotência)", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items: [item({ id: "z1" }), item({ id: "z2" }), item({ id: "z3" })],
      institutions: [UNIPAR],
    });
    const fp1 = out.rows[0]?.fingerprint;
    expect(fp1).toBeDefined();

    const out2 = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items: [
        item({ id: "z3" }),
        item({ id: "z1" }),
        item({ id: "z2" }),
      ],
      institutions: [UNIPAR],
    });
    expect(out2.rows[0]?.fingerprint).toBe(fp1);
  });

  it("userLattesId/userORCID vazios → carta não quebra (sem idLine)", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      userLattesId: null,
      userORCID: null,
      items: [item({ id: "q1" })],
      institutions: [UNIPAR],
    });
    expect(out.rows[0]?.letterBody).not.toContain("Lattes:");
    expect(out.rows[0]?.letterBody).not.toContain("ORCID:");
  });

  it("partialCoverageRatio refletido nas rows oriundas de groupByInstitution", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items: [
        item({ id: "p1", evidenceStatus: "COM_COMPROVANTE_PARCIAL" }),
        item({ id: "p2", evidenceStatus: "SEM_COMPROVANTE" }),
      ],
      institutions: [UNIPAR],
    });
    expect(out.rows[0]?.partialCoverageRatio).toBeCloseTo(0.5, 5);
  });

  it("0 institutions → 0 rows mas totals.items ainda conta", () => {
    const out = buildRecoveryRequests({
      userId: "u-1",
      userFullName: "Fulano",
      items: [item({ id: "n1", institutionName: "Universidade X" })],
      institutions: [],
    });
    expect(out.rows).toHaveLength(0);
    expect(out.totals.items).toBe(0);
    expect(out.totals.pendingItems).toBe(1);
  });
});
