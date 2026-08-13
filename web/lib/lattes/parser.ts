// lib/lattes/parser.ts
// Parser do XML REAL do Currículo Lattes (CNPq, "LATTES_OFFLINE").
//
// O XML do Lattes é ISO-8859-1 e cada tipo de produção/formação tem seu
// elemento e atributos próprios (TITULO-DO-ARTIGO, TITULO-DO-CAPITULO-DO-LIVRO,
// NOME-CURSO, ...), muitas vezes num elemento DADOS-BASICOS-* aninhado. Este
// parser cobre os principais tipos por regex sobre os atributos.
//
// PRIVACIDADE (CLAUDE.md): dados sensíveis do <DADOS-GERAIS> (CPF, RG, data de
// nascimento, filiação) são FILTRADOS antes do parse e só viram um contador.

export interface LattesItemDraft {
  lattesId: string;
  itemType: string; // natureza bruta (chave do XSD_MAP em lattes-import.ts)
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
  lattesId: string | null;
  resumo: string | null; // "Texto informado pelo autor" (RESUMO-CV)
  items: LattesItemDraft[];
  sensitiveIgnored: number;
}

// Atributos sensíveis do DADOS-GERAIS — removidos antes do parse.
const SENSITIVE_PATTERNS = [
  /\bCPF="[^"]*"/gi,
  /\bNUMERO-DO-PASSAPORTE="[^"]*"/gi,
  /\bDATA-NASCIMENTO="[^"]*"/gi,
  /\bNUMERO-IDENTIDADE="[^"]*"/gi,
  /\bNOME-DO-PAI="[^"]*"/gi,
  /\bNOME-DA-MAE="[^"]*"/gi,
  /\b(?:RG|ENDERECO|TELEFONE)\b\s*[:=]\s*"[^"]*"/gi,
];

export function redactSensitive(xml: string): { clean: string; ignored: number } {
  let ignored = 0;
  let clean = xml;
  for (const re of SENSITIVE_PATTERNS) {
    clean = clean.replace(re, () => { ignored += 1; return ""; });
  }
  return { clean, ignored };
}

/** Lê um atributo de um bloco de atributos (string dentro de uma tag). */
function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp("\\b" + name + '="([^"]*)"'));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

// Extratores: elemento a casar → de onde tirar título/ano/doi/isbn + natureza.
interface Extractor {
  el: string;
  title: string;
  years: string[];   // tenta na ordem; usa o primeiro preenchido
  doi?: string;
  isbn?: string;
  nature: string;    // vira itemType (mapeado por mapXsdToItemType)
}

const EXTRACTORS: Extractor[] = [
  { el: "DADOS-BASICOS-DO-ARTIGO", title: "TITULO-DO-ARTIGO", years: ["ANO-DO-ARTIGO"], doi: "DOI", nature: "ARTIGO-PUBLICADO" },
  { el: "DADOS-BASICOS-DO-CAPITULO", title: "TITULO-DO-CAPITULO-DO-LIVRO", years: ["ANO"], nature: "CAPITULO-LIVRO" },
  { el: "DADOS-BASICOS-DO-LIVRO", title: "TITULO-DO-LIVRO", years: ["ANO"], doi: "DOI", nature: "LIVRO" },
  { el: "DADOS-BASICOS-DO-TRABALHO", title: "TITULO-DO-TRABALHO", years: ["ANO-DO-TRABALHO"], doi: "DOI", nature: "TRABALHO-COMPLETO" },
  { el: "DADOS-BASICOS-DA-APRESENTACAO-DE-TRABALHO", title: "TITULO", years: ["ANO"], nature: "CURSO" },
  { el: "GRADUACAO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "GRADUACAO" },
  { el: "ESPECIALIZACAO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "ESPECIALIZACAO" },
  { el: "MESTRADO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "MESTRADO" },
  { el: "DOUTORADO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "DOUTORADO" },
];

/** Também aceita o formato de teste antigo: `TITULO-DO-TRABALHO=` em qualquer tag. */
const LEGACY_TITLE = "TITULO-DO-TRABALHO";

export function parseLattesXml(xml: string): ParsedLattes {
  const { clean, ignored } = redactSensitive(xml);

  const fullName = clean.match(/<DADOS-GERAIS\b[^>]*\bNOME-COMPLETO="([^"]+)"/i)?.[1] ?? null;
  const lattesId = clean.match(/<CURRICULO-VITAE\b[^>]*\bNUMERO-IDENTIFICADOR="([^"]+)"/i)?.[1] ?? null;
  const resumo = clean.match(/<RESUMO-CV\b[^>]*\bTEXTO-RESUMO-CV-RH="([^"]*)"/i)?.[1]?.trim() || null;

  const seen = new Set<string>();
  const items: LattesItemDraft[] = [];

  const push = (nature: string, title: string, year: number, doi: string | null, isbn: string | null, flag: boolean) => {
    const dedupe = `${nature}|${title.toLowerCase()}|${year}|${doi ?? ""}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    items.push({
      lattesId: `${nature}-${seen.size}`,
      itemType: nature,
      title, year, doi, issn: null, isbn,
      authors: [],
      flaggedInnovation: flag,
      flaggedLattes: true,
    });
  };

  for (const ex of EXTRACTORS) {
    const re = new RegExp("<" + ex.el + "\\b([^>]*)>", "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      const attrs = m[1]!;
      const title = attr(attrs, ex.title);
      if (!title) continue;
      let year = 0;
      for (const y of ex.years) { const v = attr(attrs, y); if (v && /^\d{4}$/.test(v)) { year = Number(v); break; } }
      const doi = ex.doi ? (attr(attrs, ex.doi) || null) : null;
      const isbn = ex.isbn ? (attr(attrs, ex.isbn) || null) : null;
      const flag = /\bFLAG-RELEVANCIA="SIM"/i.test(attrs) || /\bFLAG-POTENCIAL-INOVACAO="SIM"/i.test(attrs);
      push(ex.nature, title, year, doi, isbn, flag);
    }
  }

  // Compat: formato de teste simplificado (TITULO-DO-TRABALHO em qualquer tag).
  const legacyRe = new RegExp("<([A-Z][A-Z0-9-]+)\\b([^>]*)>", "g");
  let lm: RegExpExecArray | null;
  while ((lm = legacyRe.exec(clean)) !== null) {
    const tag = lm[1]!;
    const attrs = lm[2]!;
    if (tag.startsWith("DADOS-BASICOS") || tag === "GRADUACAO" || tag === "MESTRADO" || tag === "DOUTORADO" || tag === "ESPECIALIZACAO") continue;
    const title = attr(attrs, LEGACY_TITLE);
    const yearStr = attr(attrs, "ANO-DO-TRABALHO");
    if (!title || !yearStr || !/^\d{4}$/.test(yearStr)) continue;
    const doi = attr(attrs, "DOI");
    const isbn = attr(attrs, "ISBN");
    const flag = /\bFLAG-POTENCIAL-INOVACAO="SIM"/i.test(attrs);
    push(tag, title, Number(yearStr), doi && /^10\./.test(doi) ? doi : null, isbn, flag);
  }

  return { fullName, lattesId, resumo, items, sensitiveIgnored: ignored };
}
