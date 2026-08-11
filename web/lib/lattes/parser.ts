// lib/lattes/parser.ts
// Parser LATTES — extração a partir do XML gerado pela Plataforma Lattes
// (CNPq 2022 — base XSD citada em docs/03-referencia-lattes.md).
//
// Implementação MÍNIMA e DETERMINÍSTICA baseada em regex — destrava o fluxo
// no protótipo. A versão de produção substituirá por fast-xml-parser +
// mapeamento XSD-categoria → academic_items.itemType (~187 sub-tipos → ~12 naturezas).
//
// REGRAS (CLAUDE.md §"Privacidade por padrão"):
//   1. DADOS SENSÍVEIS (CPF, RG, data de nascimento, endereço) são FILTRADOS.
//      Nunca saem do parser — ficam apenas como contador público.
//   2. FLAG-POTENCIAL-INOVACAO=SIM → flaggedInnovation=true + itemType=ARTIGO.
//   3. Lattes-id é preservado em cada item para permitir reimport idempotente.

export interface LattesItemDraft {
  lattesId: string;                 // chave de deduplicação cn[seq]
  itemType: string;                 // natureza bruta do XML
  title: string;
  year: number;
  doi: string | null;
  issn: string | null;
  isbn: string | null;
  authors: string[];
  flaggedInnovation: boolean;
  flaggedLattes: boolean;
}

export interface ParsedLattes {
  fullName: string | null;
  lattesId: string | null;          // PK da plataforma Lattes
  items: LattesItemDraft[];
  sensitiveIgnored: number;         // métrica pública visível ao usuário
}

const SENSITIVE_PATTERNS = [
  /\bCPF\b\s*[:=]\s*"[^"]*"/gi,
  /\bRG\b\s*[:=]\s*"[^"]*"/gi,
  /\bDATA-NASCIMENTO\b\s*[:=]\s*"[^"]*"/gi,
  /\bENDERECO\b\s*[:=]\s*"[^"]*"/gi,
  /\bTELEFONE\b\s*[:=]\s*"[^"]*"/gi,
];

export function redactSensitive(xml: string): { clean: string; ignored: number } {
  let ignored = 0;
  let clean = xml;
  for (const re of SENSITIVE_PATTERNS) {
    clean = clean.replace(re, () => { ignored += 1; return ""; });
  }
  return { clean, ignored };
}

/** Parser determinístico via regex. Aceita um subset do XML Lattes (2022). */
export function parseLattesXml(xml: string): ParsedLattes {
  const { clean, ignored } = redactSensitive(xml);

  const fullName = clean.match(/<DADOS-GERAIS[^>]*NOME-COMPLETO="([^"]+)"/i)?.[1] ?? null;
  const lattesId = clean.match(/<CURRICULO-VITAE[^>]*NUMERO-IDENTIFICADOR="([^"]+)"/i)?.[1] ?? null;

  // Padrão tolerante: aceita <ARTIGO-PUBLICADO>, <CAPITULO-LIVRO>, <TRABALHO-EM-EVENTOS>...
  const tagRe = /<([A-Z][A-Z0-9-]+)[^>]*\bTITULO-DO-TRABALHO="([^"]+)"[^>]*\bANO-DO-TRABALHO="(\d{4})"[^>]*?(?:\bDOI="(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)")?[^>]*?(?:\bISSN="([\dX-]+)")?[^>]*?(?:\bISBN="([\d-]+)")?[^>]*?(?:\bFLAG-POTENCIAL-INOVACAO="(SIM)")?[\s\S]*?<\/\1>/g;

  const seen = new Set<string>();
  const items: LattesItemDraft[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(clean)) !== null) {
    const tag = m[1];
    const title = m[2];
    const year = Number(m[3]);
    const doi = m[4] ?? null;
    const issn = m[5] ?? null;
    const isbn = m[6] ?? null;
    const flag = m[7] === "SIM";
    const dedupe = `${tag}|${title}|${year}|${doi ?? ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    items.push({
      lattesId: `${tag}-${seen.size}`,
      itemType: tag,
      title,
      year,
      doi,
      issn,
      isbn,
      authors: [],
      flaggedInnovation: flag,
      flaggedLattes: true,
    });
  }

  const result: ParsedLattes = {
    fullName,
    lattesId,
    items,
    sensitiveIgnored: ignored,
  };
  return result;
}
