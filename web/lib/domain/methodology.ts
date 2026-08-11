// lib/domain/methodology.ts
// BLOCO 4.1/4.2 — Metodologias: seed Trajetória v1 e parser determinístico de edital.
//
// Regras (01-arquitetura.md §6.5 + backlog 4.1/4.2 + 05-fluxos.md Fluxo 4):
//   * IA é o ÚLTIMO recurso no parser — só chamada se as 5 extrações determinísticas falharem
//   * windowYears = NULL → vida inteira (regra do §6.6 do 01-arquitetura)
//   * applyCaps = false na métrica de Trajetória; true em editais reais
//   * coauthor_rule.factor: SOMENTE se authorCount > coauthor_rule.threshold
//
// O parser é determinístico. A IA fica guardada para o caso INSUFICIENTE.

import type { RankingMethod, RankingRule, EditalSource } from "./dossier";

export type EditalParserStatus =
  | "OK"          // ≥ 1 regra extraída com pontos > 0
  | "PARCIAL"     // ≥ 1 categoria detectada, mas sem pontos
  | "INSUFICIENTE"; // texto sem padrões reconhecidos → IA no próximo passo

export interface EditalParseResult {
  status: EditalParserStatus;
  /** Atalho para o `name` do método — usado pela UI e pelo renderer PDF. */
  name?: string;
  version?: number;
  /** Categorias agrupadas — alinhadas ao shape `ItemCategory` */
  categories?: import("./dossier").ItemCategory[];
  method: Omit<RankingMethod, "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt">;
  rules: Omit<RankingRule, "id" | "methodId" | "userId" | "createdAt" | "updatedAt" | "deletedAt">[];
  diagnostics: string[];
}

// ── SEED: Trajetória v1 ─────────────────────────────────────────────
const TRAJETORIA_V1_RULES: Omit<RankingRule, "id" | "methodId" | "userId" | "createdAt" | "updatedAt" | "deletedAt">[] = [
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A1", points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 1,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A2", points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 2,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A3", points: 20, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 3,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "A4", points: 15, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 4,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "B1", points: 12, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 5,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "B2", points: 10, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 6,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "B3", points:  8, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 7,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "B4", points:  5, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 8,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: "C",  points:  3, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 9,  conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "ARTIGO", qualisStratum: null, points:  0, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 10, conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "LIVRO",   qualisStratum: null, points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 11, conditions: null },
    { categoryLabel: "Produção Bibliográfica", itemType: "CAPITULO", qualisStratum: null, points: 8,  capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 12, conditions: null },
    { categoryLabel: "Produção Técnica",        itemType: "PATENTE",   qualisStratum: null, points: 25, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 13, conditions: null },
    { categoryLabel: "Produção Técnica",        itemType: "SOFTWARE",  qualisStratum: null, points: 15, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 14, conditions: null },
    { categoryLabel: "Formação",                itemType: "MESTRADO",  qualisStratum: null, points: 30, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 15, conditions: null },
    { categoryLabel: "Formação",                itemType: "DOUTORADO", qualisStratum: null, points: 50, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 16, conditions: null },
    { categoryLabel: "Formação",                itemType: "POS_DOUTORADO", qualisStratum: null, points: 20, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 17, conditions: null },
    { categoryLabel: "Ensino",                  itemType: "ORIENTACAO_MESTRADO",  qualisStratum: null, points:  8, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 18, conditions: null },
    { categoryLabel: "Ensino",                  itemType: "ORIENTACAO_DOUTORADO", qualisStratum: null, points: 12, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 19, conditions: null },
    { categoryLabel: "Ensino",                  itemType: "BANCA_EXAMINADORA",    qualisStratum: null, points:  3, capPerYear: null, capPerCategory: null, capTotal: null, orderIndex: 20, conditions: null },
];

function deriveCategories(rules: Omit<RankingRule, "id" | "methodId" | "userId" | "createdAt" | "updatedAt" | "deletedAt">[]): { label: string; rules: RankingRule[] }[] {
  const map = new Map<string, RankingRule[]>();
  for (const r of rules) {
    const arr = map.get(r.categoryLabel) ?? [];
    arr.push({
      id: null,
      methodId: null,
      label: `${r.itemType}${r.qualisStratum ? ` ${r.qualisStratum}` : ""}`,
      categoryLabel: r.categoryLabel,
      itemType: r.itemType,
      qualisStratum: r.qualisStratum,
      points: r.points,
      capPerYear: r.capPerYear,
      capPerCategory: r.capPerCategory,
      capTotal: r.capTotal,
      orderIndex: r.orderIndex,
      conditions: r.conditions,
    });
    map.set(r.categoryLabel, arr);
  }
  return [...map.entries()]
    .sort((a, b) => (a[1][0]?.orderIndex ?? 99) - (b[1][0]?.orderIndex ?? 99))
    .map(([label, rules]) => ({ label, rules }));
}

export const TRAJETORIA_V1: EditalParseResult = {
  status: "OK",
  diagnostics: ["seed metodo padrão (vida inteira, sem teto, sem janela)"],
  name: "Trajetória v1",
  version: 1,
  method: {
    name: "Trajetória v1",
    version: 1,
    scope: "PLATAFORMA",
    sourceDocumentId: null,
    validFrom: null,
    validUntil: null,
    windowYears: null,
    applyCaps: false,
    coauthorRule: null,
    stratificationEnabled: false,
    isPublic: true,
    verifiedByUser: true,
  },
  rules: TRAJETORIA_V1_RULES.map((r) => ({ ...r, label: undefined })),
  categories: deriveCategories(TRAJETORIA_V1_RULES),
};
// ── PARSER DETERMINÍSTICO DE EDITAL ─────────────────────────────────
const CATEGORY_RE = /(?:^|\n)\s*(?:categoria|grupo|se[cç][aã]o)\s*[:#\-—]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{2,80})/gi;
const WINDOW_RE   = /(?:janela|per[íi]odo)\s*[:\-—]?\s*(\d+)\s*anos?/i;
const APPLY_CAPS_RE = /(?:aplic(?:ar|a)\s*teto|teto\s*obrigat[óo]rio|limit(?:e|ar))/i;
const COAUTHOR_RE = /coautoria\s*[:\-—]?\s*(?:acima\s*de|mais\s*de|>)\s*(\d+)\s*autores?\s*[,;:]?\s*(?:fator|fat)\s*[:\-=]?\s*([0-9]+(?:[.,][0-9]+)?)/i;

const KNOWN_TYPES = [
  "ARTIGO", "LIVRO", "CAPITULO", "PATENTE", "SOFTWARE",
  "MESTRADO", "DOUTORADO", "POS_DOUTORADO", "ESPECIALIZACAO", "GRADUACAO",
  "ORIENTACAO_MESTRADO", "ORIENTACAO_DOUTORADO", "ORIENTACAO_INICIACAO_CIENTIFICA",
  "BANCA_EXAMINADORA", "BANCA", "CURSO", "CONGRESSO_RESUMO", "CONGRESSO_TRABALHO",
  "PROJETO_PESQUISA", "COORDENACAO_PROJETO", "PREMIACAO",
] as const;

const QUALIS = ["A1","A2","A3","A4","B1","B2","B3","B4","C","SQ","NP"] as const;

// Captura uma linha de regra: <TIPO> [QUALIS X] pontos: N [teto: M [<sep>] (<kind>)]
// Onde <sep> pode ser "/" opcional, ou " por ", e <kind> ∈ {ano, anual, categoria, cat., total}
const RULE_LINE_RE = new RegExp(
  String.raw`(?:^|\n)\s*(` + KNOWN_TYPES.join("|") + String.raw`)` +
  String.raw`(?:\s+\[?\s*(?:qualis\s*[:=]?\s*)?(A1|A2|A3|A4|B1|B2|B3|B4|C|SQ|NP)\s*\]?)?` +
  String.raw`[^:\n]*?` +
  String.raw`(?:\bpontos?|\bpts|\bpeso)\s*[:=]?\s*(\d+(?:[.,]\d+)?)` +
  String.raw`(?:[^:\n]*?\bteto\s*[:=]?\s*(\d+)(?:\s*\/\s*|\s+por\s+|\s+|\s*\/\s*)(ano|anual|categoria|cat\.?|total))?`,
  "gi",
);

export function parseEdital(text: string, source: EditalSource): EditalParseResult {
  const diagnostics: string[] = [];

  // 0. Snapshot da quantidade INICIAL de categorias SEED (sem ter feito nada no documento).
  const seedCats = new Set<string>(TRAJETORIA_V1.rules.map((r) => r.categoryLabel));

  // 1. Janela
  let windowYears: number | null = null;
  const winMatch = text.match(WINDOW_RE);
  if (winMatch?.[1]) {
    const n = Number(winMatch[1]);
    if (Number.isFinite(n) && n > 0) {
      windowYears = n;
      diagnostics.push(`janela=${n} anos`);
    }
  } else {
    diagnostics.push("janela não detectada — usando NULL (vida inteira)");
  }

  // 2. Cap
  const applyCaps = APPLY_CAPS_RE.test(text);
  diagnostics.push(applyCaps ? "tetos aplicáveis" : "tetos desativados (métrica de trajetória)");

  // 3. Coautoria
  let coauthorRule: { threshold: number; factor: number } | null = null;
  const coMatch = text.match(COAUTHOR_RE);
  if (coMatch) {
    const threshold = Number(coMatch[1]);
    const factor = Number(coMatch[2].replace(",", "."));
    if (Number.isFinite(threshold) && Number.isFinite(factor)) {
      coauthorRule = { threshold, factor };
      diagnostics.push(`coautoria: > ${threshold} autores, fator ${factor}`);
    }
  }

  // 4. Categorias (Δ vs seed)
  const categorySet = new Set<string>(seedCats);
  let newCategoryCount = 0;
  CATEGORY_RE.lastIndex = 0;
  let cat: RegExpExecArray | null;
  while ((cat = CATEGORY_RE.exec(text)) !== null) {
    const name = cat[1].trim().replace(/[\s:.—\-\n]+$/, "").trim();
    if (name.length >= 3 && name.length < 80) {
      if (!categorySet.has(name)) {
        categorySet.add(name);
        newCategoryCount++;
        diagnostics.push(`categoria encontrada: "${name}"`);
      }
    }
  }

  // 5. Regras por linha
  const extracted: EditalParseResult["rules"] = [];
  RULE_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let orderIdx = 100;
  while ((m = RULE_LINE_RE.exec(text)) !== null) {
    const itemType = m[1].toUpperCase();
    const qualis = (m[2] || null)?.toUpperCase() ?? null;
    const pts = Number(m[3].replace(",", "."));
    if (!Number.isFinite(pts) || pts < 0) continue;
    const cap = m[4] ? Number(m[4]) : null;
    const capKind = (m[5] || "").toLowerCase();
    extracted.push({
      categoryLabel: "Do edital",
      itemType,
      qualisStratum: qualis,
      points: pts,
      capPerYear:     capKind.startsWith("an")         ? cap : null,
      capPerCategory: capKind.startsWith("cat")        ? cap : null,
      capTotal:       capKind.startsWith("tot")        ? cap : null,
      orderIndex: orderIdx++,
      conditions: null,
    });
  }
  diagnostics.push(`regras extraídas do texto: ${extracted.length}`);

  // 6. Categoria de cada regra: inferida pelo tipo (catálogo do XSD 2022)
  for (const r of extracted) {
    r.categoryLabel = inferCategoryFromType(r.itemType);
  }

  // 7. Status: OUROÁ: sem regras E nenhuma categoria nova → IA é a próxima etapa.
  let status: EditalParserStatus;
  if (extracted.length === 0 && newCategoryCount === 0) {
    status = "INSUFICIENTE";
    diagnostics.push("⚠️ texto do edital sem padrões — IA poderá propor no próximo passo (regra dos 3 pontos)");
  } else if (extracted.length === 0) {
    status = "PARCIAL";
  } else {
    status = "OK";
  }

  void seedCats; // silencia lint

  return {
    status,
    diagnostics,
    method: {
      name: source.name ?? "Metodologia importada de edital",
      version: 1,
      scope: "EDITAL",
      sourceDocumentId: source.sourceDocumentId ?? null,
      validFrom: null,
      validUntil: null,
      windowYears,
      applyCaps,
      coauthorRule,
      stratificationEnabled: false,
      isPublic: false,
      verifiedByUser: false,
    },
    rules: extracted,
  };
}

function inferCategoryFromType(t: string): "Produção Bibliográfica" | "Produção Técnica" | "Formação" | "Ensino" | "Atividade" {
  if (["ARTIGO","LIVRO","CAPITULO"].includes(t)) return "Produção Bibliográfica";
  if (["PATENTE","SOFTWARE"].includes(t))         return "Produção Técnica";
  if (["MESTRADO","DOUTORADO","POS_DOUTORADO","ESPECIALIZACAO","GRADUACAO"].includes(t)) return "Formação";
  if (["ORIENTACAO_MESTRADO","ORIENTACAO_DOUTORADO","ORIENTACAO_INICIACAO_CIENTIFICA","BANCA_EXAMINADORA","BANCA","CURSO"].includes(t)) return "Ensino";
  return "Atividade";
}

export function isQualis(s: string | null | undefined): s is typeof QUALIS[number] {
  return !!s && (QUALIS as readonly string[]).includes(s);
}
