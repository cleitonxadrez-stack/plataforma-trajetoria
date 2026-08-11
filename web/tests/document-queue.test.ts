// tests/document-queue.test.ts
// Máquina de estados do COFRE — fila de confirmação.
//
// Asserções (Backlog §2.1, §2.4 — "Confirme ou edite"):
//   • PENDENTE → EM_REVISAO → CONFIRMADO (caminho feliz).
//   • CONFIRMADO é TERMINAL — não há transição adiante.
//   • CONFIRM com edits usa CONFIRM_WITH_EDITS e marca riskFlags.fieldsEditedByUser.
//   • Toda transição registra evento no audit[] com timestamp ISO.
//   • REJEITADO aceita RESTART_FROM_AUDIT (volta a PENDENTE).
//   • CONFIRM sem ação humana é impossível: action válida só com by="USER".

import { describe, it, expect } from "vitest";
import {
  applyAction, bootstrapView, groupByState, needsHumanAction,
  nextValidActions, _STATE_ORDER as STATE_ORDER,
  reconcileWithItem, type DocQueueView, type DocQueueAction,
} from "../lib/domain/document-queue";

const NOW = "2026-08-09T12:00:00.000Z";

function v(documentId: string, usedAI = false): DocQueueView {
  return bootstrapView({ documentId, usedAI, confidence: 0.85, now: NOW });
}

describe("document-queue — bootstrap & invariantes", () => {
  it("estado inicial sempre EM_PENDENTE? na verdade PENDENTE", () => {
    const x = v("d1");
    expect(x.state).toBe("PENDENTE");
    expect(x.audit.length).toBe(1);
    expect(x.audit[0].at).toBe(NOW);
    expect(x.lastHumanAction).toBeNull();
  });

  it("usedAI=true vira riskFlags.usedAI + nota no audit inicial", () => {
    const x = v("d2", true);
    expect(x.riskFlags.usedAI).toBe(true);
    expect(x.audit[0].notes).toContain("IA");
  });

  it("confiança < 0.80 vira confidenceLow=true", () => {
    const x = bootstrapView({ documentId: "d3", usedAI: false, confidence: 0.71, now: NOW });
    expect(x.riskFlags.confidenceLow).toBe(true);
  });
});

describe("document-queue — transições válidas", () => {
  it("PENDENTE → EM_REVISAO via OPEN_REVIEW (USER)", () => {
    const r = applyAction(v("d"), "OPEN_REVIEW", { by: "USER", now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view.state).toBe("EM_REVISAO");
      expect(r.view.audit.length).toBe(2);
      expect(r.view.lastHumanAction).toBe("OPEN_REVIEW");
    }
  });

  it("EM_REVISAO → CONFIRMADO via CONFIRM (USER)", () => {
    const a = applyAction(v("d"), "OPEN_REVIEW", { by: "USER", now: NOW });
    const b = applyAction(a.ok ? a.view : v("d"), "CONFIRM", { by: "USER", now: NOW });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.view.state).toBe("CONFIRMADO");
  });

  it("CONFIRMADO é terminal — qualquer action retorna INVALID_TRANSITION", () => {
    const a = applyAction(v("d"), "OPEN_REVIEW", { by: "USER", now: NOW });
    const b = applyAction(a.ok ? a.view : v("d"), "CONFIRM", { by: "USER", now: NOW });
    if (!b.ok) throw new Error("setup");
    const c = applyAction(b.view, "REJECT", { by: "USER", now: NOW });
    expect(c.ok).toBe(false);
    const d = applyAction(b.view, "CONFIRM", { by: "USER", now: NOW });
    expect(d.ok).toBe(false);
  });

  it("CONFIRM_WITH_EDITS marca fieldsEditedByUser=true", () => {
    const a = applyAction(v("d"), "OPEN_REVIEW", { by: "USER", now: NOW });
    const b = applyAction(a.ok ? a.view : v("d"),
      "CONFIRM_WITH_EDITS", { by: "USER", now: NOW, fieldsEdited: 2 });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.view.state).toBe("CONFIRMADO");
      expect(b.view.riskFlags.fieldsEditedByUser).toBe(true);
      expect(b.view.lastHumanAction).toBe("CONFIRM_WITH_EDITS");
    }
  });

  it("REJEITADO → PENDENTE via RESTART_FROM_AUDIT", () => {
    const a = applyAction(v("d"), "OPEN_REVIEW", { by: "USER", now: NOW });
    const b = applyAction(a.ok ? a.view : v("d"), "REJECT", { by: "USER", now: NOW });
    const c = applyAction(b.ok ? b.view : v("d"), "RESTART_FROM_AUDIT", { by: "SYSTEM", now: NOW });
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.view.state).toBe("PENDENTE");
  });

  it("audit[] preserva ordem cronológica e cresce em cada ação", () => {
    let cur = v("d");
    const actions: DocQueueAction[] = ["OPEN_REVIEW", "CONFIRM"];
    for (const action of actions) {
      const r = applyAction(cur, action, { by: "USER", now: NOW });
      if (r.ok) cur = r.view;
    }
    expect(cur.audit.length).toBe(3);  // 1 bootstrap + 2 actions
    for (let i = 1; i < cur.audit.length; i++) {
      expect(cur.audit[i].at >= cur.audit[i-1].at).toBe(true);
    }
  });
});

describe("document-queue — helpers", () => {
  it("STATE_ORDER mantém a sequência canônica", () => {
    expect(STATE_ORDER).toEqual(["PENDENTE", "EM_REVISAO", "CONFIRMADO"]);
  });

  it("needsHumanAction = (PENDENTE | EM_REVISAO)", () => {
    expect(needsHumanAction({ ...v("d"), state: "PENDENTE" })).toBe(true);
    expect(needsHumanAction({ ...v("d"), state: "EM_REVISAO" })).toBe(true);
    expect(needsHumanAction({ ...v("d"), state: "CONFIRMADO" })).toBe(false);
    expect(needsHumanAction({ ...v("d"), state: "REJEITADO" })).toBe(false);
  });

  it("groupByState particiona corretamente", () => {
    const g = groupByState([
      { ...v("a"), state: "PENDENTE" },
      { ...v("b"), state: "EM_REVISAO" },
      { ...v("c"), state: "CONFIRMADO" },
      { ...v("d"), state: "PENDENTE" },
    ]);
    expect(g.PENDENTE.length).toBe(2);
    expect(g.EM_REVISAO.length).toBe(1);
    expect(g.CONFIRMADO.length).toBe(1);
    expect(g.REJEITADO.length).toBe(0);
  });

  it("nextValidActions([], []) — CONFIRMADO não tem ações", () => {
    expect(nextValidActions("CONFIRMADO")).toEqual([]);
  });
});

describe("document-queue — reconcileWithItem (B2 ↔ B3)", () => {
  it("CONFIRMADO + 1 evidência + DOCUMENTADO → DOCUMENTADO sem needsReview", () => {
    const view: DocQueueView = { ...v("d"), state: "CONFIRMADO" };
    const r = reconcileWithItem(view, { state: "DOCUMENTADO", evidenceCount: 1 });
    expect(r.itemState).toBe("DOCUMENTADO");
    expect(r.needsReview).toBe(false);
  });

  it("CONFIRMADO + 0 evidência → CONFIRMADO, ainda precisa revisar", () => {
    const view: DocQueueView = { ...v("d"), state: "CONFIRMADO" };
    const r = reconcileWithItem(view, { state: "CONFIRMADO", evidenceCount: 0 });
    expect(r.itemState).toBe("CONFIRMADO");
    expect(r.needsReview).toBe(true);
  });

  it("PENDENTE → precisa de revisão independente do item", () => {
    const view: DocQueueView = { ...v("d"), state: "PENDENTE" };
    const r = reconcileWithItem(view, { state: "DOCUMENTADO", evidenceCount: 5 });
    expect(r.state).toBe("PENDENTE");
    expect(r.needsReview).toBe(true);
  });
});
