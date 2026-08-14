// lib/domain/lattes-import.ts
// Transformação PURA de `ParsedLattes` (lib/lattes/parser.ts) em linhas
// prontas para INSERT em `academic_items` e `career_interruptions`.
//
// REGRAS (docs/03-referencia-lattes.md §"Mapeamento XSD → academic_items"):
//   1. ItemType bruto do XML é mapeado para o union restrito de
//      `lib/domain/items.ts`. Qualquer categoria fora do mapeamento cai
//      em "OUTROS" (regra de produto: nunca perder dado).
//   2. Cada item ganha hash de dedupe (lattesId+title+year+type) para
//      reinserção idempotente — o caller usa ON CONFLICT (lattes_dedupe_key) DO NOTHING.
//   3. sensitiveIgnored é preservado como diagnóstico, exposto na resposta.

import { parseLattesXml, redactSensitive, type LattesItemDraft, type ParsedLattes } from "../lattes/parser";
import type { ItemType } from "./items";

/** Categorização XSD Lattes → ItemType interno (Bloco 3 / Backlog 3.x). */
const XSD_MAP: Record<string, ItemType> = {
  // Produção bibliográfica
  "ARTIGO-PUBLICADO": "ARTIGO",
  "ARTIGO-PERIODICO": "ARTIGO",
  "ARTIGO-ACEITO": "ARTIGO",
  "ARTIGO": "ARTIGO",
  "CAPITULO-LIVRO": "CAPITULO",
  "LIVRO": "CAPITULO",
  "TRABALHO-RESUMO": "OUTROS",
  "TRABALHO-COMPLETO": "OUTROS",
  "TRABALHO-EVENTO": "OUTROS",
  // Educação / formação
  "ESPECIALIZACAO": "DIPLOMA",
  "FORMACAO": "DIPLOMA",
  "MESTRADO": "DIPLOMA",
  "DOUTORADO": "DIPLOMA",
  "POS-DOUTORADO": "DIPLOMA",
  "GRADUACAO": "DIPLOMA",
  "FORMACAO-COMPLEMENTAR": "OUTROS",
  // Orientações, bancas, produção técnica, prêmios, projetos, eventos
  "ORIENTACAO-CONCLUIDA": "OUTROS",
  "ORIENTACAO-MESTRADO": "OUTROS",
  "ORIENTACAO-DOUTORADO": "OUTROS",
  "ORIENTACAO-INICIACAO-CIENTIFICA": "OUTROS",
  "BANCA-GRADUACAO": "OUTROS",
  "PARTICIPACAO-BANCA": "OUTROS",
  "CURSO-MINISTRADO": "OUTROS",
  "CURSO": "OUTROS",
  "EXTENSAO": "OUTROS",
  "PREMIO": "OUTROS",
  "PROJETO": "OUTROS",
  "ORGANIZACAO-EVENTO": "OUTROS",
};

export function mapXsdToItemType(xsd: string): ItemType {
  const key = (xsd ?? "").toUpperCase().trim();
  return XSD_MAP[key] ?? "OUTROS";
}

/** Hash determinístico para dedupe (não-criptográfico). */
export function lattesDedupeKey(item: { lattesId: string; title: string; year: number; itemType: string }): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${item.lattesId}|${norm(item.title)}|${item.year}|${item.itemType.toLowerCase()}`;
}

export interface AcademicItemRow {
  /** Chave de dedupe pré-computada — o caller usa ON CONFLICT DO NOTHING. */
  lattes_dedupe_key: string;
  user_id: string;
  item_type: ItemType;
  natureza: string | null;
  title: string;
  title_en: string | null;
  year: number;
  doi: string | null;
  issn: string | null;
  isbn: string | null;
  flagged_innovation: boolean;
  flagged_lattes: boolean;
  state: "AUTODECLARADO";      // import do Lattes começa como autodeclarado
  evidence_status: "SEM_COMPROVANTE";
  visibility: "PRIVADO";
  raw_lattes_nature: string;
  raw_lattes_id: string;
  raw_authors: string[];
}

export interface ParsedLattesImport {
  fullName: string | null;
  lattesId: string | null;
  rows: AcademicItemRow[];
  sensitiveIgnored: number;
  categoryFallbackCount: number;
}

/** Converte um item bruto do parser em linha para INSERT. */
export function toAcademicItemRow(opts: {
  draft: LattesItemDraft;
  userId: string;
}): AcademicItemRow {
  const { draft, userId } = opts;
  const itemType = mapXsdToItemType(draft.itemType);
  return {
    lattes_dedupe_key: lattesDedupeKey({
      lattesId: draft.lattesId,
      title: draft.title,
      year: draft.year,
      itemType: draft.itemType,
    }),
    user_id: userId,
    item_type: itemType,
    natureza: draft.natureza ?? null,
    title: draft.title,
    title_en: null,
    year: draft.year,
    doi: draft.doi,
    issn: draft.issn,
    isbn: draft.isbn,
    flagged_innovation: draft.flaggedInnovation,
    flagged_lattes: true,
    state: "AUTODECLARADO",
    evidence_status: "SEM_COMPROVANTE",
    visibility: "PRIVADO",
    raw_lattes_nature: draft.itemType,
    raw_lattes_id: draft.lattesId,
    raw_authors: draft.authors,
  };
}

/** Orquestra: parse + sanitize + mapeamento + dedupe. */
export function planLattesImport(xml: string, userId: string): ParsedLattesImport {
  const redacted = redactSensitive(xml);
  let parsed: ParsedLattes;
  try {
    parsed = parseLattesXml(redacted.clean);
  } catch {
    // Sem categoria inválida — retorna console vazio mas mantém ignored.
    parsed = { fullName: null, lattesId: null, resumo: null, items: [], sensitiveIgnored: redacted.ignored };
  }

  const rows = parsed.items.map((d) => toAcademicItemRow({ draft: d, userId }));

  // Dedup in-memory (defesa contra o parser retornar duplicatas).
  const seen = new Set<string>();
  let categoryFallbackCount = 0;
  const unique: AcademicItemRow[] = [];
  for (const r of rows) {
    if (seen.has(r.lattes_dedupe_key)) continue;
    if (r.item_type === "OUTROS") categoryFallbackCount += 1;
    seen.add(r.lattes_dedupe_key);
    unique.push(r);
  }

  return {
    fullName: parsed.fullName,
    lattesId: parsed.lattesId,
    rows: unique,
    sensitiveIgnored: parsed.sensitiveIgnored,
    categoryFallbackCount,
  };
}

/** Validação rápida de MIME vindo do cliente (defesa em profundidade). */
export const LATTES_ACCEPTED_MIME = new Set([
  "application/xml",
  "text/xml",
]);

export const LATTES_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — XML de Lattes não passa disso

export function isLattesAcceptedMime(mime: string): boolean {
  return LATTES_ACCEPTED_MIME.has(mime.toLowerCase());
}

/** Heurística barata para detectar se um XML é de fato um Lattes. */
export function isProbablyLattesXml(xml: string): boolean {
  // Apenas verifica marcadores estruturais — barato e estável.
  // Aceita tag auto-fechada (`<CURRICULO-VITAE/>`) além de `\s` e `>`.
  return /<CURRICULO-VITAE[\s/>]/i.test(xml) ||
         /<LATTES[\s/>]/i.test(xml) ||
         /<?xml[^>]*?\bn[:s]?="[^"]*lattes/i.test(xml);
}
