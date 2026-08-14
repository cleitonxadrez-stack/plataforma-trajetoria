// lib/domain/cv-sections.ts
// Classifica cada academic_item numa seção estilo Lattes, para exportar
// currículo apenas com o que já foi coletado na plataforma.

import { dedupeItems } from "./dedupe";

export type CvSectionKey =
  | "FORMACAO" | "COMPLEMENTAR" | "ATUACAO" | "LINHAS" | "AREAS"
  | "ARTIGOS" | "LIVROS" | "EVENTOS" | "PROJETOS" | "ORIENTACOES"
  | "BANCAS" | "PREMIOS" | "OUTROS";

export interface CvItem {
  id: string;
  title: string;
  year: number | null;
  itemType: string;
  natureza: string | null;
  origin: string;
  verificationLevel: string;
  evidenceStatus: string;
  evidenceCount: number;
  doi: string | null;
  isbn: string | null;
  issn: string | null;
  /** documento comprobatório principal (para link de download), se houver */
  docId: string | null;
  docName: string | null;
}

export type SealTone = "comprovado" | "parcial" | "validado" | "sem" | "publicacao";
export interface CvSeal { label: string; tone: SealTone }

/** Selo humano de comprovação (substitui o "R"). */
export function cvSeal(it: Pick<CvItem, "verificationLevel" | "evidenceStatus" | "docId" | "isbn">): CvSeal {
  if (it.verificationLevel === "VALIDADO") return { label: "Validado", tone: "validado" };
  if (it.verificationLevel === "DOCUMENTADO" || it.evidenceStatus === "COMPROVADO" || it.docId || it.isbn)
    return { label: "Comprovado", tone: "comprovado" };
  if (it.evidenceStatus === "COM_COMPROVANTE_PARCIAL") return { label: "Comprovante parcial", tone: "parcial" };
  return { label: "Sem comprovante", tone: "sem" };
}

/**
 * Marcadores exibidos ao lado de cada item, no estilo pedido:
 *   R = Registro  → existe comprovante/registro anexado (documento, ISBN…)
 *   P = Publicação → é uma produção publicada (artigo, livro, trabalho em evento, com DOI/ISBN/ISSN)
 */
export function cvMarkers(it: CvItem): { code: "R" | "P"; title: string }[] {
  const out: { code: "R" | "P"; title: string }[] = [];
  const hasRegistro =
    it.evidenceCount > 0 ||
    it.verificationLevel === "DOCUMENTADO" ||
    it.verificationLevel === "VALIDADO" ||
    !!it.isbn;
  if (hasRegistro) {
    out.push({
      code: "R",
      title: it.isbn
        ? `Registro — ISBN ${it.isbn}`
        : "Registro — há documento comprobatório anexado a este item",
    });
  }
  const isPublicacao =
    it.itemType === "ARTIGO" ||
    it.itemType === "CAPITULO" ||
    !!it.doi || !!it.isbn || !!it.issn ||
    classifyCv(it) === "EVENTOS" || classifyCv(it) === "LIVROS";
  if (isPublicacao) {
    out.push({
      code: "P",
      title: it.doi ? `Publicação — DOI ${it.doi}` : "Publicação",
    });
  }
  return out;
}

// Sequência espelhando o currículo Lattes.
export const CV_SECTIONS: { key: CvSectionKey; label: string }[] = [
  { key: "FORMACAO", label: "Formação acadêmica / titulação" },
  { key: "COMPLEMENTAR", label: "Formação complementar" },
  { key: "ATUACAO", label: "Atuação profissional" },
  { key: "LINHAS", label: "Linhas de pesquisa" },
  { key: "AREAS", label: "Áreas de atuação" },
  { key: "ARTIGOS", label: "Artigos completos publicados em periódicos" },
  { key: "LIVROS", label: "Livros e capítulos publicados" },
  { key: "EVENTOS", label: "Trabalhos publicados em anais de eventos" },
  { key: "PROJETOS", label: "Projetos e grupos de pesquisa" },
  { key: "ORIENTACOES", label: "Orientações e supervisões" },
  { key: "BANCAS", label: "Participação em bancas examinadoras" },
  { key: "PREMIOS", label: "Prêmios e títulos" },
  { key: "OUTROS", label: "Outras produções e atividades" },
];

export function classifyCv(it: Pick<CvItem, "title" | "itemType" | "natureza">): CvSectionKey {
  const nat = (it.natureza ?? "").toLowerCase();
  const s = `${nat} ${it.title}`.toLowerCase();
  // Ordem importa: mais específico primeiro.
  if (it.itemType === "DIPLOMA") return "FORMACAO";
  if (/pr[êe]mio|\bt[íi]tulo\b/.test(nat)) return "PREMIOS";
  if (/\bbanca/.test(s)) return "BANCAS";
  if (/orienta[çc]|supervis/.test(s)) return "ORIENTACOES";
  if (/atua[çc][ãa]o profissional|v[íi]nculo funcional|retrato funcional|experi[êe]ncia profissional/.test(s)) return "ATUACAO";
  if (/linha de pesquisa/.test(nat)) return "LINHAS";
  if (/[áa]rea de atua[çc]/.test(nat)) return "AREAS";
  // Produção técnica (curso ministrado, organização de evento) → Outras.
  if (/ministrad|organiza[çc][ãa]o de evento/.test(s)) return "OUTROS";
  if (/forma[çc][ãa]o complementar|profici[êe]ncia|extens[ãa]o universit|capacita[çc][ãa]o de professores/.test(s)) return "COMPLEMENTAR";
  if (/anais|em evento|evento cient|congress|mostra|apresentad|simp[óo]s|semin[áa]rio|\bf[óo]rum|summit|jornada|\bencontro\b/.test(s)) return "EVENTOS";
  if (it.itemType === "CAPITULO" || /\blivro|cap[íi]tulo|isbn/.test(s)) return "LIVROS";
  if (it.itemType === "ARTIGO" || /artigo/.test(nat)) return "ARTIGOS";
  if (/grupo de pesquisa|\bprojeto\b|v[íi]nculo|funcional|professor efetivo/.test(s)) return "PROJETOS";
  return "OUTROS";
}

/** Agrupa itens por seção, na ordem canônica, cada seção ordenada por ano desc.
 *  Aplica a regra geral de deduplicação (lib/domain/dedupe) — a versão com
 *  comprovante (R) sempre vence a autodeclarada. */
export function groupIntoCvSections(items: CvItem[]): { key: CvSectionKey; label: string; items: CvItem[] }[] {
  const deduped = dedupeItems(items, (it) => ({
    title: it.title,
    bucket: classifyCv(it),
    // prioriza: com comprovante (R) > título mais descritivo > empate estável
    score: (cvMarkers(it).some((m) => m.code === "R") ? 1_000_000 : 0) + it.title.length,
  }));
  const byKey = new Map<CvSectionKey, CvItem[]>();
  for (const it of deduped) {
    const k = classifyCv(it);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(it);
  }
  return CV_SECTIONS
    .map(({ key, label }) => ({
      key, label,
      items: (byKey.get(key) ?? []).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    }))
    .filter((s) => s.items.length > 0);
}
