// lib/domain/recovery.ts
// BLOCO 6 — Recuperação assistida (docs/05-fluxos.md §Fluxo 7).
//
// PRINCÍPIOS:
//   1. AGRUPAR por instituição — 12 itens da UNIPAR viram UMA carta só,
//      não 12 e-mails. Menos ruído institucional, mais chance de resposta.
//   2. CANAL por tipo — secretaria / biblioteca / pró-reitoria, na
//      preferência do usuário. Configurado em institutions.contactChannels.
//   3. TERMO DE CONSENTIMENTO — a versão fica registrada na request.
//      Mudou o termo? Incrementamos a versão e cartas antigas
//      precisam de re-aceite.
//   4. FOLLOW-UP 30 DIAS — disparado por job diário (Bloco 7 schedule).
//      Aqui só expomos a regra; quem dispara é a fila.
//
// Esta camada é PURA: nada toca DB, fila, e-mail. O texto da carta é
// gerado deterministicamente a partir do input. Testável sem cadeia React/Supabase.

import type { EvidenceStatus } from "./items";

// ─── INPUT ───────────────────────────────────────────────────

export type RecoveryChannel =
  | "secretariaAcademica"
  | "biblioteca"
  | "proReitoriaExtensao"
  | "outro";

export interface RecoveryItemInput {
  id: string;
  title: string;
  year: number;
  itemType: string;
  institutionName: string;
  evidenceStatus: EvidenceStatus;
}

export interface RecoveryInstitutionInput {
  id: string;
  name: string;
  contactChannels: Partial<Record<RecoveryChannel, string>>;
}

export interface GroupInput {
  items: ReadonlyArray<RecoveryItemInput>;
  institutions: ReadonlyArray<RecoveryInstitutionInput>;
  /** Versão do termo de consentimento aceita pelo usuário. */
  consentTextVersion: string;
  /** ISO timestamp — injetado em testes. */
  now?: string;
}

export interface RecoveryGroup {
  institutionId: string;
  institutionName: string;
  preferredChannel: RecoveryChannel;
  channelAddress: string | null;
  itemIds: string[];
  /** 0..1 — fração de itens com evidência parcial. */
  partialCoverageRatio: number;
}

export interface RecoveryPlanOutcome {
  groups: RecoveryGroup[];
  totals: {
    institutions: number;
    items: number;
    pendingItems: number;
  };
}

// ─── CANAL PREFERENCIAL ───────────────────────────────────────
// Ordem: secretaria → biblioteca → pró-reitoria → outro.
// Justificativa: secretaria acadêmica é a porta padrão para segunda-via
// de declarações; biblioteca cobre comprovantes de publicação; pró-reitoria
// cobre extensão/bolsas; outro (informado manualmente pelo usuário).

const PREFERRED_ORDER: RecoveryChannel[] = [
  "secretariaAcademica",
  "biblioteca",
  "proReitoriaExtensao",
  "outro",
];

export function pickPreferredChannel(
  channels: Partial<Record<RecoveryChannel, string>>,
): { channel: RecoveryChannel; address: string | null } {
  for (const c of PREFERRED_ORDER) {
    if (channels[c]?.trim()) return { channel: c, address: channels[c]!.trim() };
  }
  return { channel: "outro", address: null };
}

// ─── AGRUPAMENTO ─────────────────────────────────────────────

/** Exclui do escopo itens já comprovados — estes NÃO precisam de carta. */
const NEEDS_LETTER: ReadonlySet<EvidenceStatus> = new Set<EvidenceStatus>([
  "SEM_COMPROVANTE",
  "COM_COMPROVANTE_PARCIAL",
]);

/**
 * Agrupa os itens que precisam de carta em grupos por instituição.
 * Retorna grupos ordenados por # de itens DESC (cartas com mais itens primeiro).
 */
export function groupByInstitution(input: GroupInput): RecoveryPlanOutcome {
  const instMap = new Map<string, RecoveryInstitutionInput>();
  for (const inst of input.institutions) instMap.set(inst.id, inst);

  const pendingItems = input.items.filter((it) => NEEDS_LETTER.has(it.evidenceStatus));

  const buckets = new Map<string, RecoveryItemInput[]>();
  for (const it of pendingItems) {
    // Mapeamento pelo NOME — o parser Lattes traz a string "Universidade X"
    // e matching exato é frágil. Aqui casamos normalizado.
    const norm = normalizeName(it.institutionName);
    const inst = nearest(norm, instMap);
    if (!inst) continue;
    const arr = buckets.get(inst.id) ?? [];
    arr.push(it);
    buckets.set(inst.id, arr);
  }

  const groups: RecoveryGroup[] = Array.from(buckets.entries())
    .map(([institutionId, items]): RecoveryGroup => {
      const inst = instMap.get(institutionId)!;
      const partial = items.filter((i) => i.evidenceStatus === "COM_COMPROVANTE_PARCIAL").length;
      const ch = pickPreferredChannel(inst.contactChannels ?? {});
      return {
        institutionId,
        institutionName: inst.name,
        preferredChannel: ch.channel,
        channelAddress: ch.address,
        itemIds: items.map((i) => i.id),
        partialCoverageRatio: items.length === 0 ? 0 : partial / items.length,
      };
    })
    .sort((a, b) => b.itemIds.length - a.itemIds.length);

  return {
    groups,
    totals: {
      institutions: groups.length,
      items: groups.reduce((s, g) => s + g.itemIds.length, 0),
      pendingItems: pendingItems.length,
    },
  };
}

function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\bUniversidade Federal\b/gi, "UF")
    .replace(/\bUniversidade\b/gi, "U")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nearest(normName: string, instMap: Map<string, RecoveryInstitutionInput>): RecoveryInstitutionInput | null {
  // 1. match exato normalizado
  for (const inst of instMap.values()) {
    const nn = normalizeName(inst.name);
    if (nn === normName) return inst;
  }
  // 2. match por substring (tolera UNIPAR → "Universidade Paranaense")
  for (const inst of instMap.values()) {
    const nn = normalizeName(inst.name);
    if (nn.includes(normName) || normName.includes(nn)) return inst;
  }
  return null;
}

// ─── MODELO DE CARTA ─────────────────────────────────────────

const CURRENT_CONSENT_VERSION = "v1.0";
export const CONSENT_VERSION = CURRENT_CONSENT_VERSION;

export interface LetterDraft {
  /** Texto integral da carta, pronto para cópia para e-mail. */
  body: string;
  institutionName: string;
  preferredChannel: RecoveryChannel;
  channelAddress: string | null;
  itemCount: number;
  consentTextVersion: string;
  generatedAt: string;
}

/** Termo legal inclusivo no rodapé da carta (Backlog §6.4 — disclosure). */
export const CONSENT_TEXT_PT = `Autorizo o uso destes dados exclusivamente para fins de
comprovação junto à minha Plataforma Acadêmica de Trajetória, vedada a
divulgação pública sem nova autorização. (Consentimento ${CURRENT_CONSENT_VERSION})`;

/**
 * Gera o texto da carta em pt-BR. Determinístico para o mesmo input
 * (modulo timestamps). Formato: bloco único de texto, fácil de colar
 * em e-mail institucional.
 */
export function generateLetter(input: {
  userFullName: string;
  userLattesId?: string | null;
  userORCID?: string | null;
  group: RecoveryGroup;
  items: ReadonlyArray<Pick<RecoveryItemInput, "id" | "title" | "year" | "itemType">>;
  consentTextVersion?: string;
  now?: string;
}): LetterDraft {
  const now = input.now ?? new Date().toISOString();
  const consent = input.consentTextVersion ?? CURRENT_CONSENT_VERSION;

  const itemLines = input.group.itemIds
    .map((id, i) => {
      const it = input.items.find((x) => x.id === id);
      if (!it) return `${i + 1}. (item id: ${id}) — informação não encontrada`;
      return `${i + 1}. ${it.itemType ?? "Item"} — Título: "${it.title}" (ano: ${it.year ?? "-"})`;
    })
    .join("\n");

  const channelLabel: Record<RecoveryChannel, string> = {
    secretariaAcademica: "Secretaria Acadêmica",
    biblioteca: "Biblioteca",
    proReitoriaExtensao: "Pró-Reitoria de Extensão",
    outro: "Setor responsável (a definir com a instituição)",
  };

  const contactLine = input.group.channelAddress
    ? `Canal sugerido para retorno: ${channelLabel[input.group.preferredChannel]} — ${input.group.channelAddress}`
    : `Canal sugerido para retorno: ${channelLabel[input.group.preferredChannel]} — a confirmar nos contatos institucionais.`;

  const idLine = [
    input.userLattesId ? `Lattes: ${input.userLattesId}` : null,
    input.userORCID ? `ORCID: ${input.userORCID}` : null,
  ].filter(Boolean).join(" · ");

  const body = [
    `À ${input.group.institutionName},`,
    "",
    `Prezada/o,`,
    "",
    `Solicito a emissão de documentos comprobatórios relativos aos itens abaixo,`,
    `relacionados à minha trajetória acadêmica. Caso algum documento já tenha sido`,
    `emitido e não conste em meus arquivos, agradeço a reemissão.`,
    "",
    `Dados do solicitante:`,
    `Nome: ${input.userFullName}` + (idLine ? `\n${idLine}` : ""),
    "",
    `Itens (${input.group.itemIds.length}):`,
    itemLines,
    "",
    contactLine,
    "",
    `Fico à disposição para esclarecimentos e agradeço a atenção.`,
    "",
    `Atenciosamente,`,
    input.userFullName,
    "",
    `────`,
    CONSENT_TEXT_PT,
  ].join("\n");

  return {
    body,
    institutionName: input.group.institutionName,
    preferredChannel: input.group.preferredChannel,
    channelAddress: input.group.channelAddress,
    itemCount: input.group.itemIds.length,
    consentTextVersion: consent,
    generatedAt: now,
  };
}

// ─── FOLLOW-UP ───────────────────────────────────────────────

/** Retorna true se a request precisa de ping (≥ 30 dias sem resposta). */
export function needsFollowUp(
  request: { sentAt: string | null; respondedAt: string | null; lastFollowUpAt: string | null },
  now: Date,
  intervalDays = 30,
): boolean {
  if (!request.sentAt) return false;          // nunca foi enviada
  if (request.respondedAt) return false;     // já respondido
  const ref = request.lastFollowUpAt ?? request.sentAt;
  const days = (now.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
  return days >= intervalDays;
}

/** Próxima data recomendada para follow-up (30 dias a partir do ref). */
export function nextFollowUp(
  request: { sentAt: string | null; lastFollowUpAt: string | null },
  intervalDays = 30,
): string | null {
  const ref = request.lastFollowUpAt ?? request.sentAt;
  if (!ref) return null;
  const d = new Date(ref);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d.toISOString();
}
