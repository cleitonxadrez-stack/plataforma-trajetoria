// lib/domain/document-queue.ts
// Máquina de estados do COFRE — fila de CONFIRMAÇÃO.
//
// Estados canônicos:
//   PENDENTE       → EM_REVISAO      → CONFIRMADO   ← happy path
//                            │
//                            ├→ REJEITADO      ← usuário descartou
//                            └→ CORRIGIDO      ← enviou correção
//
// REGRA REGRA_DOURADA (CLAUDE.md §"IA nunca decide sozinha"):
//   *Nada entra em CONFIRMADO sem ação humana*. O fluxo pedido é:
//     "Identificamos estas informações. Confirme ou edite."
//   Só após clique o documento avança de PENDENTE → CONFIRMADO.
//
// Cada transição registra um evento em `audit` — fonte de verdade do histórico.
// Toda a função é PURA — não toca em DB. A persistência fica na action.

import { reconcile as reconcileItem } from "./items";

export type DocQueueState =
  | "PENDENTE"        // acabou de entrar via upload; cascata ainda processando
  | "EM_REVISAO"     // cascata terminou e usuário abriu para confirmar
  | "CONFIRMADO"      // usuário confirmou — alimentação da trajetória
  | "CORRIGIDO"       // usuário editou campos e confirmou — virar CONFIRMADO
  | "REJEITADO"       // usuário descartou — soft-delete do doc
  | "FALHOU";         // extração falhou após 3 retentativas do worker

export type DocQueueAction =
  | "OPEN_REVIEW"          // PENDENTE → EM_REVISAO
  | "CONFIRM"              // EM_REVISAO → CONFIRMADO
  | "CONFIRM_WITH_EDITS"   // EM_REVISAO → CORRIGIDO → CONFIRMADO numa só transição
  | "REJECT"               // EM_REVISAO → REJEITADO
  | "RESTART_FROM_AUDIT"   // REJEITADO → PENDENTE (re-extração manual)
  | "MARK_FAILED"          // PENDENTE → FALHOU (worker desistiu)
  | "MARK_FALLBACK";       // PENDENTE/EM_REVISAO → PENDENTE com flag fallback IA

export interface DocQueueEvent {
  state: DocQueueState;
  at: string;                          // ISO timestamp — registrado na transição
  by: "WORKER" | "USER" | "SYSTEM";    // agente que disparou a transição
  action: DocQueueAction;
  fieldsEdited?: number;               // quantos campos foram editados
  notes?: string;
  // IMPORTANTE: nunca armazenar PII aqui. Apenas contagens/hashes.
}

export interface DocQueueView {
  documentId: string;
  state: DocQueueState;
  /** Eventos de auditoria — append-only, fonte de verdade do histórico. */
  audit: DocQueueEvent[];
  /** Última ação humana — se houve. */
  lastHumanAction: DocQueueAction | null;
  /** Flags de risco do ponto de vista do produto. */
  riskFlags: {
    usedAI: boolean;                   // passo 6 foi chamado
    confidenceLow: boolean;            // < 0.80
    fieldsEditedByUser: boolean;
  };
}

const STATE_ORDER: readonly DocQueueState[] = [
  "PENDENTE", "EM_REVISAO", "CONFIRMADO",
];

const VALID: Record<DocQueueState, ReadonlyArray<DocQueueAction>> = {
  PENDENTE:    ["OPEN_REVIEW", "MARK_FAILED", "MARK_FALLBACK"],
  EM_REVISAO:  ["CONFIRM", "CONFIRM_WITH_EDITS", "REJECT"],
  CONFIRMADO:  [],
  CORRIGIDO:   [],
  REJEITADO:   ["RESTART_FROM_AUDIT"],
  FALHOU:      ["RESTART_FROM_AUDIT"],
};

export interface ApplyOptions {
  /** ISO timestamp a registrar (injetável para testes determinísticos). */
  now?: string;
  by: DocQueueEvent["by"];
  notes?: string;
  fieldsEdited?: number;
}

/** Aplica uma ação — pura, retorna a nova VIEW ou erro estrutural. */
export function applyAction(
  view: DocQueueView,
  action: DocQueueAction,
  opts: ApplyOptions,
): { ok: true; view: DocQueueView } | { ok: false; error: "INVALID_TRANSITION" } {
  if (!VALID[view.state].includes(action)) {
    return { ok: false, error: "INVALID_TRANSITION" };
  }

  const now = opts.now ?? new Date().toISOString();
  const event: DocQueueEvent = {
    state: view.state, at: now, by: opts.by, action,
    fieldsEdited: opts.fieldsEdited,
    notes: opts.notes,
  };
  const audit = [...view.audit, event];

  let nextState: DocQueueState = view.state;
  let riskFlags = view.riskFlags;

  switch (action) {
    case "OPEN_REVIEW":         nextState = "EM_REVISAO"; break;
    case "CONFIRM":             nextState = "CONFIRMADO"; break;
    case "REJECT":              nextState = "REJEITADO"; break;
    case "RESTART_FROM_AUDIT":  nextState = "PENDENTE";  break;
    case "MARK_FAILED":         nextState = "FALHOU";    break;
    case "CONFIRM_WITH_EDITS":
      nextState = "CONFIRMADO";
      riskFlags = { ...riskFlags, fieldsEditedByUser: true };
      break;
    case "MARK_FALLBACK":
      // NÃO muda estado — apenas marca que caiu em fallback (IA tentou).
      // O risco usado será avaliado em reconcile() abaixo.
      break;
  }

  return {
    ok: true,
    view: {
      ...view,
      state: nextState,
      audit,
      lastHumanAction: opts.by === "USER" ? action : view.lastHumanAction,
      riskFlags,
    },
  };
}

/** Helper de bootstrap — cria a VIEW inicial a partir do upload. */
export function bootstrapView(p: {
  documentId: string;
  usedAI: boolean;
  confidence?: number;
  now?: string;
}): DocQueueView {
  const base: DocQueueView = {
    documentId: p.documentId,
    state: "PENDENTE",
    audit: [{
      state: "PENDENTE",
      at: p.now ?? new Date().toISOString(),
      by: "WORKER",
      action: "OPEN_REVIEW",  // primeiro evento = entrada na fila
      notes: p.usedAI ? "Cascata usou IA — exige confirmação humana." : "Cascata resolveu sem IA.",
    }],
    lastHumanAction: null,
    riskFlags: {
      usedAI: p.usedAI,
      confidenceLow: (p.confidence ?? 1) < 0.80,
      fieldsEditedByUser: false,
    },
  };
  return base;
}

/** Filtro para o painel do cofre — itens que ainda pedem ação humana. */
export function needsHumanAction(v: DocQueueView): boolean {
  return v.state === "PENDENTE" || v.state === "EM_REVISAO";
}

/** Reconciliação com o item da trajetória — alinha estados B2↔B3. */
export function reconcileWithItem(v: DocQueueView, item: {
  state: "AUTODECLARADO" | "CONFIRMADO" | "DOCUMENTADO" | "VALIDADO";
  evidenceCount: number;
}): { state: DocQueueState; itemState: typeof item.state; needsReview: boolean } {
  // CONFIRMADO no cofre → só avança trajetória se houver pelo menos 1 evidência.
  const itemRec = reconcileItem({ state: item.state, evidenceCount: item.evidenceCount });
  if (v.state === "CONFIRMADO") {
    if (item.evidenceCount >= 1 && itemRec.state === "DOCUMENTADO") {
      return { state: "CONFIRMADO", itemState: "DOCUMENTADO", needsReview: false };
    }
    return { state: "CONFIRMADO", itemState: "CONFIRMADO", needsReview: itemRec.needsReview };
  }
  return { state: v.state, itemState: item.state, needsReview: true };
}

/** Agrupa documentos do cofre por estado — base do dashboard. */
export function groupByState(docs: ReadonlyArray<DocQueueView>): Record<DocQueueState, DocQueueView[]> {
  const out: Record<DocQueueState, DocQueueView[]> = {
    PENDENTE: [], EM_REVISAO: [], CONFIRMADO: [], CORRIGIDO: [], REJEITADO: [], FALHOU: [],
  };
  for (const d of docs) out[d.state].push(d);
  return out;
}

/** Próximo estado admissível — usado para desabilitar botões na UI. */
export function nextValidActions(s: DocQueueState): DocQueueAction[] {
  return [...VALID[s]];
}

export const _STATE_ORDER = STATE_ORDER;  // exportado para testes de ordem
