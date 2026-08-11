// tests/items.test.ts
// Máquina de estados + reconcile + agregadores do Bloco 3.

import { describe, it, expect } from "vitest";
import {
  nextState, confirmTransition, withPrimaryEvidence, reconcile,
  groupByYear, countByState,
  type ItemView,
} from "../lib/domain/items";

function fixtureItem(p: Partial<ItemView> = {}): ItemView {
  return {
    id: "id", title: "T", titleEn: null, itemType: "ARTIGO",
    year: 2024, doi: null, nature: "TRABALHO_COMPLETO",
    state: "AUTODECLARADO", evidenceStatus: "SEM_COMPROVANTE",
    evidenceCount: 0, citationCount: 0,
    flaggedInnovation: false, flaggedLattes: false,
    needsReview: false, visibility: "PRIVADO",
    ...p,
  };
}

describe("items.ts — state machine", () => {
  it("nextState progride linearmente", () => {
    expect(nextState("AUTODECLARADO")).toBe("CONFIRMADO");
    expect(nextState("CONFIRMADO")).toBe("DOCUMENTADO");
    expect(nextState("DOCUMENTADO")).toBe("VALIDADO");
    expect(nextState("VALIDADO")).toBeNull();
  });

  it("confirmTransition é idempotente no topo", () => {
    expect(confirmTransition("VALIDADO")).toBe("VALIDADO");
    expect(confirmTransition("AUTODECLARADO")).toBe("CONFIRMADO");
    expect(confirmTransition("CONFIRMADO")).toBe("DOCUMENTADO");
    expect(confirmTransition("DOCUMENTADO")).toBe("VALIDADO");
  });

  it("withPrimaryEvidence pula um nível em CONFIRMADO → DOCUMENTADO", () => {
    expect(withPrimaryEvidence("CONFIRMADO")).toBe("DOCUMENTADO");
    expect(withPrimaryEvidence("DOCUMENTADO")).toBe("VALIDADO");
  });

  it("reconcile zera DOCUMENTADO sem evidência → volta a CONFIRMADO", () => {
    const r = reconcile({ state: "DOCUMENTADO", evidenceCount: 0 });
    expect(r.state).toBe("CONFIRMADO");
    expect(r.evidenceStatus).toBe("SEM_COMPROVANTE");
    expect(r.needsReview).toBe(true);
  });

  it("reconcile com evidência única → parcial + needs_review dependendo do estado", () => {
    const r = reconcile({ state: "CONFIRMADO", evidenceCount: 1 });
    expect(r.evidenceStatus).toBe("COM_COMPROVANTE_PARCIAL");
    expect(r.state).toBe("CONFIRMADO");
  });

  it("reconcile com 2+ evidências → COMPROVADO", () => {
    const r = reconcile({ state: "DOCUMENTADO", evidenceCount: 2 });
    expect(r.evidenceStatus).toBe("COMPROVADO");
  });
});

describe("items.ts — agregadores", () => {
  it("groupByYear ordena ano desc e separa grupos", () => {
    const groups = groupByYear([
      fixtureItem({ id: "1", year: 2022 }),
      fixtureItem({ id: "2", year: 2024 }),
      fixtureItem({ id: "3", year: 2024 }),
      fixtureItem({ id: "4", year: 2023 }),
    ]);
    expect(groups.map(g => g.year)).toEqual([2024, 2023, 2022]);
    expect(groups[0].items.length).toBe(2);
  });

  it("countByState cobre os 4 estados canônicos", () => {
    const c = countByState([
      fixtureItem({ state: "AUTODECLARADO" }),
      fixtureItem({ state: "CONFIRMADO" }),
      fixtureItem({ state: "DOCUMENTADO" }),
      fixtureItem({ state: "VALIDADO" }),
    ]);
    expect(c).toEqual({ AUTODECLARADO: 1, CONFIRMADO: 1, DOCUMENTADO: 1, VALIDADO: 1 });
  });
});
