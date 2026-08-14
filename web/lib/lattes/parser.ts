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
  natureza: string; // rótulo canônico legível (vira academic_items.natureza)
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
  natureza: string;  // rótulo legível (academic_items.natureza + roteia seção do CV)
  statusAttr?: string; // se presente, anexa "(em andamento)"/"(concluído)" à natureza
}

const EXTRACTORS: Extractor[] = [
  // Produção bibliográfica
  { el: "DADOS-BASICOS-DO-ARTIGO", title: "TITULO-DO-ARTIGO", years: ["ANO-DO-ARTIGO"], doi: "DOI", nature: "ARTIGO-PERIODICO", natureza: "Artigo completo em periódico" },
  { el: "DADOS-BASICOS-DO-CAPITULO", title: "TITULO-DO-CAPITULO-DO-LIVRO", years: ["ANO"], nature: "CAPITULO-LIVRO", natureza: "Capítulo de livro publicado" },
  { el: "DADOS-BASICOS-DO-LIVRO", title: "TITULO-DO-LIVRO", years: ["ANO"], nature: "LIVRO", natureza: "Livro publicado" },
  { el: "DADOS-BASICOS-DO-TRABALHO", title: "TITULO-DO-TRABALHO", years: ["ANO-DO-TRABALHO"], nature: "TRABALHO-EVENTO", natureza: "Trabalho publicado em anais de evento" },
  // Formação
  { el: "GRADUACAO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "GRADUACAO", natureza: "Graduação", statusAttr: "STATUS-DO-CURSO" },
  { el: "ESPECIALIZACAO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "ESPECIALIZACAO", natureza: "Especialização (Lato Sensu)", statusAttr: "STATUS-DO-CURSO" },
  { el: "MESTRADO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "MESTRADO", natureza: "Mestrado", statusAttr: "STATUS-DO-CURSO" },
  { el: "DOUTORADO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "DOUTORADO", natureza: "Doutorado", statusAttr: "STATUS-DO-CURSO" },
  { el: "FORMACAO-COMPLEMENTAR-CURSO-DE-CURTA-DURACAO", title: "NOME-CURSO", years: ["ANO-DE-CONCLUSAO", "ANO-DE-INICIO"], nature: "FORMACAO-COMPLEMENTAR", natureza: "Formação complementar (curso)" },
  // Orientações e bancas
  { el: "DADOS-BASICOS-DE-OUTRAS-ORIENTACOES-CONCLUIDAS", title: "TITULO", years: ["ANO"], nature: "ORIENTACAO-CONCLUIDA", natureza: "Orientação de trabalho concluída" },
  { el: "DADOS-BASICOS-DA-PARTICIPACAO-EM-BANCA-DE-GRADUACAO", title: "TITULO", years: ["ANO"], nature: "BANCA-GRADUACAO", natureza: "Participação em banca de TCC (graduação)" },
  // Produção técnica / prêmios / projetos / eventos
  { el: "DADOS-BASICOS-DE-CURSOS-CURTA-DURACAO-MINISTRADO", title: "TITULO", years: ["ANO"], nature: "CURSO-MINISTRADO", natureza: "Curso de curta duração ministrado (produção técnica)" },
  { el: "PREMIO-TITULO", title: "NOME-DO-PREMIO-OU-TITULO", years: ["ANO-DA-PREMIACAO"], nature: "PREMIO", natureza: "Prêmio ou título" },
  { el: "PROJETO-DE-PESQUISA", title: "NOME-DO-PROJETO", years: ["ANO-INICIO"], nature: "PROJETO", natureza: "Projeto de pesquisa" },
  { el: "DADOS-BASICOS-DA-ORGANIZACAO-DE-EVENTO", title: "TITULO", years: ["ANO"], nature: "ORGANIZACAO-EVENTO", natureza: "Organização de evento (produção técnica)" },
  // Linhas de pesquisa e áreas de atuação (sem ano).
  { el: "LINHA-DE-PESQUISA", title: "TITULO-DA-LINHA-DE-PESQUISA", years: [], nature: "LINHA-PESQUISA", natureza: "Linha de pesquisa" },
  { el: "AREA-DO-CONHECIMENTO-1", title: "NOME-DA-AREA-DO-CONHECIMENTO", years: [], nature: "AREA-ATUACAO", natureza: "Área de atuação" },
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

  const push = (nature: string, natureza: string, title: string, year: number, doi: string | null, isbn: string | null, flag: boolean) => {
    const dedupe = `${nature}|${title.toLowerCase()}|${year}|${doi ?? ""}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    items.push({
      lattesId: `${nature}-${seen.size}`,
      itemType: nature,
      natureza,
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
      let natureza = ex.natureza;
      if (ex.statusAttr) {
        const st = (attr(attrs, ex.statusAttr) ?? "").toUpperCase();
        if (st === "EM_ANDAMENTO") natureza += " (em andamento)";
        else if (st === "CONCLUIDO") natureza += " (concluído)";
      }
      push(ex.nature, natureza, title, year, doi, isbn, flag);
    }
  }

  // Atuação profissional — bloco aninhado: uma instituição com 1+ vínculos.
  const atRe = /<ATUACAO-PROFISSIONAL\b([^>]*)>([\s\S]*?)<\/ATUACAO-PROFISSIONAL>/g;
  let am: RegExpExecArray | null;
  while ((am = atRe.exec(clean)) !== null) {
    const inst = attr(am[1]!, "NOME-INSTITUICAO");
    if (!inst) continue;
    const block = am[2]!;
    const vRe = /<VINCULOS\b([^>]*)>/g;
    let vm: RegExpExecArray | null;
    let any = false;
    while ((vm = vRe.exec(block)) !== null) {
      const va = vm[1]!;
      const enq = attr(va, "OUTRO-ENQUADRAMENTO-FUNCIONAL-INFORMADO")
        || attr(va, "ENQUADRAMENTO-FUNCIONAL")
        || attr(va, "TIPO-DE-VINCULO") || "";
      const yi = attr(va, "ANO-INICIO");
      const yf = attr(va, "ANO-FIM");
      const year = yi && /^\d{4}$/.test(yi) ? Number(yi) : 0;
      const period = yi ? `${yi}–${yf || "atual"}` : "";
      const title = enq ? `${inst} — ${enq}` : inst;
      const natureza = period ? `Atuação profissional (${period})` : "Atuação profissional";
      push("ATUACAO", natureza, title, year, null, null, false);
      any = true;
    }
    if (!any) push("ATUACAO", "Atuação profissional", inst, 0, null, null, false);
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
    push(tag, "Trabalho publicado em anais de evento", title, Number(yearStr), doi && /^10\./.test(doi) ? doi : null, isbn, flag);
  }

  return { fullName, lattesId, resumo, items, sensitiveIgnored: ignored };
}
