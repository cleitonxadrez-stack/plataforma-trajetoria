// lib/domain/items.ts
// MÁQUINA DE ESTADOS de um item acadêmico (Bloco 3 / Backlog §3).
//
// Estados canônicos:
//   AUTODECLARADO  → CONFIRMADO  → DOCUMENTADO  → VALIDADO
//                                                    ↑
//                                              (confirmação humana)
//
// proofLevel / evidenceStatus evoluem em paralelo:
//   SEM_COMPROVANTE → COM_COMPROVANTE_PARCIAL → COMPROVADO
//
// REGRAS:
//  - Não há caminho de volta a AUTODECLARADO.
//  - DOCUMENTADO → VALIDADO exige vínculo a um documento (evidence role=PRIMARY).
//  - Tudo é OPERAÇÃO PURA (sem I/O) — testável sem banco.

export type ItemState =
  | "AUTODECLARADO" | "CONFIRMADO" | "DOCUMENTADO" | "VALIDADO";

export type EvidenceStatus =
  | "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL" | "COMPROVADO";

export type ItemType =
  | "ARTIGO" | "CAPITULO" | "CERTIFICADO" | "DIPLOMA" | "CAPA_FICHA" | "OUTROS";

export type ItemNature =
  | "TRABALHO_COMPLETO" | "APRESENTACAO" | "FORMACAO"
  | "CAPITULO"  | "ATIVIDADE_ENSINO" | "OUTROS";

export interface ItemView {
  id: string;
  title: string;
  titleEn: string | null;
  itemType: ItemType;
  year: number;
  doi: string | null;
  nature: ItemNature;
  state: ItemState;
  evidenceStatus: EvidenceStatus;
  evidenceCount: number;
  citationCount: number;
  /** Flag latente: apareceu como FLAG-POTENCIAL-INOVACAO no Lattes. */
  flaggedInnovation: boolean;
  /** Flag latente: veio do XML Lattes (re-importação). */
  flaggedLattes: boolean;
  needsReview: boolean;
  visibility: "PRIVADO" | "PUBLICO";
}

const STATE_ORDER: readonly ItemState[] =
  ["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"];

const EVIDENCE_ORDER: readonly EvidenceStatus[] =
  ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"];

/** Retorna o próximo estado. null = terminal. */
export function nextState(s: ItemState): ItemState | null {
  const i = STATE_ORDER.indexOf(s);
  return i < 0 || i === STATE_ORDER.length - 1 ? null : STATE_ORDER[i + 1];
}

/** Confirma ação manual do usuário: avança o estado SE válido. */
export function confirmTransition(s: ItemState): ItemState {
  return nextState(s) ?? s;  // idempotente no topo
}

/** Vínculo a um documento PRIMARY, se sim, salta um nível. */
export function withPrimaryEvidence(s: ItemState): ItemState {
  return s === "CONFIRMADO" ? "DOCUMENTADO" : confirmTransition(s);
}

/** Coerência entre state e evidenceStatus. */
export function reconcile(item: Pick<ItemView, "state" | "evidenceCount">): {
  state: ItemState;
  evidenceStatus: EvidenceStatus;
  needsReview: boolean;
} {
  const idxByState = STATE_ORDER.indexOf(item.state);
  let evidence: EvidenceStatus = "SEM_COMPROVANTE";
  if (item.evidenceCount > 1) evidence = "COMPROVADO";
  else if (item.evidenceCount === 1) {
    // item com 1 evidência ainda precisa de revisão humana
    evidence = idxByState >= STATE_ORDER.indexOf("DOCUMENTADO") ? "COM_COMPROVANTE_PARCIAL" : "COM_COMPROVANTE_PARCIAL";
  }

  // REGRA REGRA_DOURADA: DOCUMENTADO só com ≥1 evidência.
  const effectiveState: ItemState =
    item.state === "DOCUMENTADO" && item.evidenceCount === 0 ? "CONFIRMADO" : item.state;

  const needsReview = !evidence || evidence === "SEM_COMPROVANTE" || effectiveState !== item.state;

  // Retorno seguro quanto a ordem.
  const evidenceIdx = EVIDENCE_ORDER.indexOf(evidence);
  const result: EvidenceStatus = evidenceIdx >= 0 ? evidence : "SEM_COMPROVANTE";

  return { state: effectiveState, evidenceStatus: result, needsReview };
}

/** Agrupa itens por ano descendente. */
export function groupByYear(items: readonly ItemView[]): { year: number; items: ItemView[] }[] {
  const map = new Map<number, ItemView[]>();
  for (const it of items) {
    const arr = map.get(it.year) ?? [];
    arr.push(it);
    map.set(it.year, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({ year, items }));
}

/** Conta itens por estado — combustível do painel de indicadores. */
export function countByState(items: readonly ItemView[]): Record<ItemState, number> {
  const out: Record<ItemState, number> = {
    AUTODECLARADO: 0, CONFIRMADO: 0, DOCUMENTADO: 0, VALIDADO: 0,
  };
  for (const it of items) out[it.state] += 1;
  return out;
}
