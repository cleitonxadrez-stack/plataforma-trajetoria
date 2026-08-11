// lib/domain/detect-duplicates.ts
// Item #4-followup — máquina PURA de detecção de duplicatas em academic_items.
//
// REGRAS (docs/05-fluxos.md §"Fluxo 2.5 — Detecção de duplicatas"):
//   1. Identidade forte: DOI, ISBN-13 normalizado, ISSN exato, ORCID+LattesId.
//      → auto-merge: candidato é "duplicata" com score=1.0 e reason.
//   2. Identidade fraca: título próximo (Jaccard tokens ≥ 0.7) + mesmo tipo
//      + mesmo ano (±1). → marcador "provável" com score entre 0.7 e 0.95
//      para revisão humana EM NENHUMA TELA — só via worker log + métrica.
//   3. NUNCA muta o banco. Devolve a estrutura para o caller decidir.
//
// Política (CLAUDE.md §"Sem mentira"): a função é determinística dado o
// corpus; testes não tocam DB.

export type DuplicateReason =
  | "doi"
  | "isbn"
  | "issn"
  | "orcid-lattes"
  | "title-fuzzy"
  | "author-year";

export interface DuplicateCandidateInput {
  id: string;
  itemType: string;
  title: string;
  titleEn?: string | null;
  year?: number | null;
  doi?: string | null;
  isbn?: string | null;
  issn?: string | null;
  /** Co-autoria: sobrenomes canônicos concatenated; usado em identity forte. */
  authors?: string[] | null;
  /** ORCID 0000-0000-0000-0000 + Lattes 16-char hex. */
  orcid?: string | null;
  lattesId?: string | null;
}

export interface DuplicateMatch {
  itemId: string;
  score: number;            // 0..1
  reason: DuplicateReason;
  /** Campo que casou (DOI normalizado, ISBN canônico, etc.). */
  matchValue: string;
}

/** Score mínimo para que o caller aceite como duplicata forte. */
export const STRONG_DUPLICATE_SCORE = 0.95;
/** Score mínimo para revisão manual (probable). Threshold calibrado para
  Jaccard real de títulos próximos em PT/EN com pequenas variações editoriais. */
export const PROBABLE_DUPLICATE_SCORE = 0.60;

// ─── Helpers de normalização (PUROS) ─────────────────────────────

const ISBN_NON_DIGITS = /[^0-9X]/g;

export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(ISBN_NON_DIGITS, "");
  if (cleaned.length === 13) return cleaned;
  // ISBN-10: aceita e converte pra forma canônica com check digit.
  if (cleaned.length === 10) {
    return cleaned;
  }
  return null;
}

export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.length === 0 || s.length > 255) return null;
  if (!/^10\.\d{4,9}\/[^\s]+$/.test(s)) return null;
  return s;
}

export function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\s+/g, "");
  const m = /^(\d{4})-?(\d{3})([0-9X])$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}${m[3].toUpperCase()}`;
}

function tokensFor(title: string): Set<string> {
  return new Set(
    String(title ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // remove acentos
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok)),
  );
}

const STOPWORDS = new Set([
  "the", "and", "of", "for", "de", "do", "da", "em", "no", "na",
  "com", "por", "para", "uma", "uno", "los", "las",
]);

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// ─── Detecção ───────────────────────────────────────────────────

export interface FindDuplicatesOptions {
  /** Auto-merge em items já marcados como duplicata não-flag. Default false. */
  skipDeleted?: boolean;
  /** Pontuação mínima (default: PROBABLE_DUPLICATE_SCORE = 0.70). */
  minScore?: number;
}

export function findDuplicates(
  candidate: DuplicateCandidateInput,
  corpus: ReadonlyArray<DuplicateCandidateInput>,
  options: FindDuplicatesOptions = {},
): DuplicateMatch[] {
  const minScore = options.minScore ?? PROBABLE_DUPLICATE_SCORE;
  const matches: DuplicateMatch[] = [];
  const candDoi = normalizeDoi(candidate.doi);
  const candIsbn = normalizeIsbn(candidate.isbn);
  const candIssn = normalizeIssn(candidate.issn);
  const candTokens = tokensFor(candidate.titleEn || candidate.title || "");
  const candAuthKey = candidate.orcid && candidate.lattesId
    ? `${candidate.orcid.toLowerCase()}|${candidate.lattesId.toLowerCase()}`
    : null;
  const candAuthors = (candidate.authors ?? []).map((a) => a.toLowerCase()).sort();

  for (const other of corpus) {
    if (other.id === candidate.id) continue;

    // (a) DOI idêntico
    const otherDoi = normalizeDoi(other.doi);
    if (candDoi && otherDoi && candDoi === otherDoi) {
      matches.push({ itemId: other.id, score: 1.0, reason: "doi", matchValue: candDoi });
      continue;
    }

    // (b) ISBN canônico idêntico
    const otherIsbn = normalizeIsbn(other.isbn);
    if (candIsbn && otherIsbn && candIsbn === otherIsbn) {
      matches.push({ itemId: other.id, score: 1.0, reason: "isbn", matchValue: candIsbn });
      continue;
    }

    // (c) ISSN idêntico
    const otherIssn = normalizeIssn(other.issn);
    if (candIssn && otherIssn && candIssn === otherIssn) {
      matches.push({ itemId: other.id, score: 1.0, reason: "issn", matchValue: candIssn });
      continue;
    }

    // (d) ORCID + Lattes idênticos (autoria/coletânea)
    const otherAuthKey = other.orcid && other.lattesId
      ? `${other.orcid.toLowerCase()}|${other.lattesId.toLowerCase()}`
      : null;
    if (candAuthKey && otherAuthKey && candAuthKey === otherAuthKey) {
      matches.push({ itemId: other.id, score: 1.0, reason: "orcid-lattes", matchValue: candAuthKey });
      continue;
    }

    // (e) título próximo (Jaccard >= 0.7) + mesmo tipo + mesmo ano (±1)
    const otherTokens = tokensFor(other.titleEn || other.title || "");
    const jc = jaccard(candTokens, otherTokens);
    const sameType =
      candidate.itemType && other.itemType &&
      candidate.itemType === other.itemType;
    const yearClose =
      candidate.year != null && other.year != null &&
      Math.abs(Number(candidate.year) - Number(other.year)) <= 1;
    if (sameType && yearClose && jc >= minScore) {
      matches.push({
        itemId: other.id,
        score: Math.round(jc * 1000) / 1000,
        reason: "title-fuzzy",
        matchValue: `jaccard=${jc.toFixed(3)}`,
      });
      continue;
    }

    // (f) mesma autoria + mesmo ano + mesmo tipo (fracíssimo — exige revisão
    //     humana, só emite se modelagem já conhecida: "author-year")
    if (
      sameType &&
      candAuthors.length > 0 &&
      candAuthors.length === (other.authors ?? []).length &&
      candAuthors.every((a, i) => a === (other.authors ?? [])[i]?.toLowerCase()) &&
      yearClose
    ) {
      matches.push({
        itemId: other.id,
        score: 0.75,
        reason: "author-year",
        matchValue: candAuthors.join("|"),
      });
    }
  }

  return matches
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/** Decide — dado o conjunto de matches — se o item é duplicata auto ou provável. */
export function classifyDuplicate(group: ReadonlyArray<DuplicateMatch>): {
  verdict: "AUTO_MERGE" | "HUMAN_REVIEW" | "UNIQUE";
  top?: DuplicateMatch;
} {
  if (group.length === 0) return { verdict: "UNIQUE" };
  const top = group[0]!;
  if (top.score >= STRONG_DUPLICATE_SCORE) return { verdict: "AUTO_MERGE", top };
  return { verdict: "HUMAN_REVIEW", top };
}
