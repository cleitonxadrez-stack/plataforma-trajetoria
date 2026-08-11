// lib/domain/recovery-build.ts
// BLOCO 6 — Composição determinística de rows de recovery_requests a partir
// de academic_items + institutions.
//
// Função PURA: dado items + institutions + dados do user, retorna array
// de rows prontas para INSERT em recovery_requests, com letter texts já
// gerados. Idempotência por fingerprint = sha256(sorted(itemIds))[:40].
//
// Não toca DB; testável sem chain React/Supabase.
//
// REGRAS (CLAUDE.md §Sem mentira):
//   1. Itens COMPROVADO nunca viram carta — filtrados ANTES de chamar este módulo.
//   2. CANAL preferido é decidido por `pickPreferredChannel` dentro de
//      `groupByInstitution`; este módulo apenas propaga o resultado.
//   3. Letter body é determinística (mesmo input → mesma string), versionada
//      por consentTextVersion. Mudou o termo? Nova versão, novas rows.
//
// Política (Backlog item 18 §6.5 + Fluxos.md §Fluxo 7): "12 itens da UNIPAR →
// 1 carta, não 12 e-mails" — agrupamento por instituição é o coração da regra.

import { createHash } from "node:crypto";
import {
  groupByInstitution,
  generateLetter,
  type GroupInput,
  type RecoveryItemInput,
  type RecoveryInstitutionInput,
  CONSENT_VERSION,
} from "./recovery";

export interface RecoveryBuildInput {
  userId: string;
  userFullName: string;
  userLattesId?: string | null;
  userORCID?: string | null;
  items: ReadonlyArray<RecoveryItemInput>;
  institutions: ReadonlyArray<RecoveryInstitutionInput>;
  /** Default = CURRENT_CONSENT_VERSION (v1.0). */
  consentTextVersion?: string;
  /** ISO timestamp — injetado em testes. */
  now?: string;
}

export interface RecoveryBuildRow {
  userId: string;
  institutionId: string;
  institutionName: string;
  itemIds: string[];
  /** SHA-256 hex (40 chars) dos itemIds sorted — chave idempotente. */
  fingerprint: string;
  /** "secretariaAcademica" | "biblioteca" | "proReitoriaExtensao" | "outro" */
  channelUsed: string;
  preferredAddress: string | null;
  /** Texto integral da carta — gerado por generateLetter(). */
  letterBody: string;
  /** 0..1 — fração de itens com evidência parcial. */
  partialCoverageRatio: number;
  consentTextVersion: string;
  generatedAt: string;
}

export interface RecoveryBuildOutcome {
  rows: RecoveryBuildRow[];
  totals: {
    institutions: number;
    items: number;
    pendingItems: number;
  };
}

/** SHA-256 hex truncado (40 chars) — chave idempotente estável. */
export function fingerprintFromIds(ids: ReadonlyArray<string>): string {
  return createHash("sha256")
    .update(ids.slice().sort().join("|"))
    .digest("hex")
    .slice(0, 40);
}

/**
 * Composição pura — segue o mesmo padrão das outras funções PURAS do Bloco 6:
 * devolve lista de rows determinística para o caller persistir.
 */
export function buildRecoveryRequests(input: RecoveryBuildInput): RecoveryBuildOutcome {
  const consent = input.consentTextVersion ?? CONSENT_VERSION;

  const groupInput: GroupInput = {
    items: input.items,
    institutions: input.institutions,
    consentTextVersion: consent,
    now: input.now,
  };
  const plan = groupByInstitution(groupInput);

  const rows: RecoveryBuildRow[] = plan.groups.map((g) => {
    // Hidrata items do grupo — generateLetter precisa de {id,title,year,itemType}.
    const itemsForGroup = input.items.filter((it) => g.itemIds.includes(it.id));
    const draft = generateLetter({
      userFullName: input.userFullName,
      userLattesId: input.userLattesId ?? null,
      userORCID: input.userORCID ?? null,
      group: g,
      items: itemsForGroup,
      consentTextVersion: consent,
      now: input.now,
    });
    return {
      userId: input.userId,
      institutionId: g.institutionId,
      institutionName: g.institutionName,
      itemIds: g.itemIds,
      fingerprint: fingerprintFromIds(g.itemIds),
      channelUsed: g.preferredChannel,
      preferredAddress: g.channelAddress,
      letterBody: draft.body,
      partialCoverageRatio: g.partialCoverageRatio,
      consentTextVersion: consent,
      generatedAt: draft.generatedAt,
    };
  });

  return {
    rows,
    totals: plan.totals,
  };
}
