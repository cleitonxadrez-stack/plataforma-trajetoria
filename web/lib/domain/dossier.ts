// lib/domain/dossier.ts
// BLOCO 4.3 / 4.4 / 4.5 — Motor de pontuação, montagem do dossiê e breakdown.
//
// Regras (01-arquitetura.md §6.5 · 05-fluxos.md Fluxo 5 · backlog 4.3/4.4/4.5):
//   1. Só itens COMPROVADOS entram na pontuação.
//   2. Janela: NULL → vida inteira (métrica de trajetória); N → últimos N anos.
//   3. matchRule: casar por (itemType + qualisStratum exato); fallback itemType + stratum=null.
//   4. Coautoria: pts *= factor SE authorCount > threshold.
//   5. Tetos: SÓ se applyCaps=true.
//        • capPerYear: limita contagem por (itemType, qualis, year)
//        • capPerCategory: limita soma da categoria
//        • capTotal: limite global do método
//   6. breakdown por categoria + excluídos com motivo (rastreabilidade).
//   7. Ordenação: orderIndex da regra (asc) → year DESC → id ASC.
//   8. Numeração de páginas: cumulativa na ordem das categorias e itens.
//   9. Funções puras, sem I/O, sem IA, sem DB. 100% testáveis.

export type EvStatus = "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL" | "COMPROVADO";

export interface ItemCategory {
  label: string;
  rules: RankingRule[];
}

export interface RankedItem {
  itemId: string;
  categoryLabel: string;
  rule: RankingRule;
  points: number;
  item: { title?: string; year?: number | null };
  excluded: boolean;
  excludedReason: string | null;
  reason?: string;
}

export interface AcademicItemLite {
  id: string;
  itemType: string;
  title: string;
  year: number | null;
  qualis: string | null;
  authorCount: number;
  evidenceStatus: EvStatus;
  isFirstAuthor?: boolean;
}

export interface RankingRule {
  id?: string | null;
  methodId?: string | null;
  /** Rótulo legível da regra (ex.: "Artigo Qualis A1"). */
  label?: string;
  categoryLabel: string;
  itemType: string;
  qualisStratum: string | null;
  points: number;
  capPerYear: number | null;
  capPerCategory: number | null;
  capTotal: number | null;
  orderIndex: number;
  conditions: Record<string, unknown> | null;
}

export type EditalSource = {
  sourceDocumentId?: string | null;
  name?: string | null;
};

export type MethodScope = "PLATAFORMA" | "AREA" | "INSTITUICAO" | "EDITAL";

export interface RankingMethod {
  id?: string | null;
  userId?: string | null;
  name: string;
  version: number;
  scope: MethodScope;
  sourceDocumentId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  windowYears: number | null;
  applyCaps: boolean;
  coauthorRule: { threshold: number; factor: number } | null;
  stratificationEnabled: boolean;
  isPublic: boolean;
  verifiedByUser: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface DossierItemOut {
  itemId: string;
  categoryLabel: string;
  ruleId: string | null;
  orderIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  pointsAwarded: number;
  capped: boolean;
  excluded: boolean;
  excludedReason: string | null;
  documentIds: string[];
}

export interface CategoryBreakdown {
  categoryLabel: string;
  total: number;
  capped: boolean;
  items: DossierItemOut[];
}

export interface PontuarResult {
  total: number;
  items: DossierItemOut[];
  breakdown: CategoryBreakdown[];
  excluded: { itemId: string; reason: string }[];
}

// ── 1. Filtragem COMPROVADOS ──────────────────────────────────────
export function filterComprovados(items: AcademicItemLite[]): AcademicItemLite[] {
  return items.filter((i) => i.evidenceStatus === "COMPROVADO");
}

// ── 2. Janela ─────────────────────────────────────────────────────
export function dentroDaJanela(item: AcademicItemLite, windowYears: number | null, now: Date): boolean {
  if (!windowYears) return true;
  if (item.year === null) return false;
  return item.year >= now.getUTCFullYear() - windowYears + 1;
}

// ── 3. matchRule ──────────────────────────────────────────────────
export function matchRule(item: AcademicItemLite, rules: RankingRule[]): RankingRule | null {
  const exact = rules.find(
    (r) => r.itemType === item.itemType && r.qualisStratum === (item.qualis ?? null),
  );
  if (exact) return exact;
  const anyStratum = rules.find(
    (r) => r.itemType === item.itemType && r.qualisStratum === null,
  );
  return anyStratum ?? null;
}

// ── 4. Coautoria / Condições ──────────────────────────────────────
export function aplicarCoautoria(
  pontos: number,
  item: AcademicItemLite,
  coauthorRule: RankingMethod["coauthorRule"],
  ruleConditions: RankingRule["conditions"],
): number {
  let pts = pontos;
  if (coauthorRule && item.authorCount > coauthorRule.threshold) {
    pts *= coauthorRule.factor;
  }
  if (ruleConditions?.require_first_author === true && item.authorCount > 1 && !item.isFirstAuthor) {
    pts = 0;
  }
  return pts;
}

// ── 5. Tetos ──────────────────────────────────────────────────────
interface ScoredRow {
  item: AcademicItemLite;
  rule: RankingRule;
  pts: number;
  reason?: string;
}

export function aplicarTetos(
  scored: ScoredRow[],
  _rules: RankingRule[],
): { kept: ScoredRow[]; capped: ScoredRow[] } {
  void _rules;
  const kept: ScoredRow[] = [];
  const capped: ScoredRow[] = [];
  const yearCount = new Map<string, number>();
  const catTotal = new Map<string, number>();
  let globalTotal = 0;

  // Mantém os mais fortes quando cap é restritivo.
  const ordered = [...scored].sort((a, b) => b.pts - a.pts || (a.item.year ?? 0) - (b.item.year ?? 0));

  for (const s of ordered) {
    let allowed = true;
    let reason = "excluído";

    if (s.rule.capPerYear && s.item.year !== null) {
      const k = `${s.rule.itemType}:${s.rule.qualisStratum ?? "*"}:${s.item.year}`;
      if ((yearCount.get(k) ?? 0) >= s.rule.capPerYear) { allowed = false; reason = `teto de ${s.rule.capPerYear}/ano`; }
    }
    if (allowed && s.rule.capPerCategory) {
      const k = s.rule.categoryLabel;
      if ((catTotal.get(k) ?? 0) + s.pts > s.rule.capPerCategory) {
        allowed = false;
        reason = `teto da categoria (${s.rule.capPerCategory})`;
      }
    }
    if (allowed && s.rule.capTotal && globalTotal + s.pts > s.rule.capTotal) {
      allowed = false;
      reason = `teto global do método (${s.rule.capTotal})`;
    }
    if (allowed) {
      if (s.rule.capPerYear && s.item.year !== null) {
        const k = `${s.rule.itemType}:${s.rule.qualisStratum ?? "*"}:${s.item.year}`;
        yearCount.set(k, (yearCount.get(k) ?? 0) + 1);
      }
      if (s.rule.capPerCategory) {
        catTotal.set(s.rule.categoryLabel, (catTotal.get(s.rule.categoryLabel) ?? 0) + s.pts);
      }
      globalTotal += s.pts;
      kept.push(s);
    } else {
      capped.push({ ...s, pts: 0, reason });
    }
  }
  return { kept, capped };
}

// ── Motor principal ────────────────────────────────────────────────
export function pontuar(
  items: AcademicItemLite[],
  method: RankingMethod,
  rules: RankingRule[],
  now: Date = new Date(),
): PontuarResult {
  // Mapa lookup dos itens por id — declaração ANTES do uso (fix bug do scoreYear).
  const allItemsById = new Map(items.map((i) => [i.id, i]));

  // Fluxo 5 passo 1: só comprovados
  const comprovados = filterComprovados(items);

  // Fluxo 5 passo 2: janela
  const janela = comprovados.filter((i) => dentroDaJanela(i, method.windowYears, now));
  const excluded: { itemId: string; reason: string }[] = [];
  for (const i of comprovados) {
    if (!janela.includes(i)) excluded.push({ itemId: i.id, reason: "fora da janela do edital" });
  }

  // Fluxo 5 passos 3–4: casar e aplicar coautoria
  const rawScored: ScoredRow[] = [];
  for (const item of janela) {
    const rule = matchRule(item, rules);
    if (!rule) {
      excluded.push({ itemId: item.id, reason: "sem regra correspondente" });
      continue;
    }
    const pts = aplicarCoautoria(rule.points, item, method.coauthorRule, rule.conditions);
    rawScored.push({ item, rule, pts });
  }

  // Fluxo 5 passo 5: tetos SOMENTE se applyCaps (false na métrica de Trajetória)
  let finalScored = rawScored;
  if (method.applyCaps) {
    const { kept, capped } = aplicarTetos(rawScored, rules);
    for (const c of capped) {
      excluded.push({ itemId: c.item.id, reason: c.reason ?? "excluído por teto" });
    }
    finalScored = kept;
  }

  // Breakdown por categoria
  const byCat = new Map<string, DossierItemOut[]>();
  for (const s of finalScored) {
    const arr = byCat.get(s.rule.categoryLabel) ?? [];
    arr.push({
      itemId: s.item.id,
      categoryLabel: s.rule.categoryLabel,
      ruleId: s.rule.id ?? null,
      orderIndex: 0,
      pageStart: null,
      pageEnd: null,
      pointsAwarded: s.pts,
      capped: false,
      excluded: false,
      excludedReason: null,
      documentIds: [],
    });
    byCat.set(s.rule.categoryLabel, arr);
  }

  // Ordenação das categorias (menor orderIndex ganha; desempate pelo nome)
  const breakdownMeta = new Map<string, { orderIndex: number }>();
  for (const r of rules) {
    if (!breakdownMeta.has(r.categoryLabel)) {
      breakdownMeta.set(r.categoryLabel, { orderIndex: r.orderIndex });
    }
  }
  const orderedCats = [...byCat.keys()].sort((a, b) =>
    (breakdownMeta.get(a)?.orderIndex ?? 99) - (breakdownMeta.get(b)?.orderIndex ?? 99)
    || a.localeCompare(b),
  );

  // Numeração de páginas (cumulativa) e ordenação intra-categoria: year DESC → id ASC
  const breakdown: CategoryBreakdown[] = [];
  let pageCursor = 1;
  for (const cat of orderedCats) {
    const items = byCat.get(cat)!;
    items.sort((a, b) => {
      const yearA = allItemsById.get(a.itemId)?.year ?? Number.NEGATIVE_INFINITY;
      const yearB = allItemsById.get(b.itemId)?.year ?? Number.NEGATIVE_INFINITY;
      if (yearA !== yearB) return yearB - yearA;
      return a.itemId.localeCompare(b.itemId);
    });
    let idx = 1;
    let catTotal = 0;
    for (const it of items) {
      it.orderIndex = idx++;
      it.pageStart = pageCursor;
      it.pageEnd = pageCursor;
      pageCursor++;
      catTotal += it.pointsAwarded;
    }
    breakdown.push({ categoryLabel: cat, total: round2(catTotal), capped: false, items });
  }

  const total = round2(breakdown.reduce((acc, c) => acc + c.total, 0));
  const flat = breakdown.flatMap((b) => b.items);
  return { total, breakdown, items: flat, excluded };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

// ── 6. Ranqueador categoria-aware para o construtor do PDF ─────────
// Cluster B — `pdf-dossier.ts` e `pdf-worker.ts` consomem este
// agrupamento (por categoria + ordem da regra + item); é função PURA,
// compatível com `EditalParseResult` ou um `RankingMethod + RankingRule[]`.
export interface RankedBuckets {
  /** Itens ordenados por `categoryLabel`, `rule.orderIndex` ASC, year DESC. */
  ranked: RankedItem[];
  /** Categorias com regras resolvidas, prontas para o PDF. */
  categories: ItemCategory[];
}

export function rankItemsAgainstMethod(
  items: AcademicItemLite[],
  source:
    | { method: RankingMethod; rules: RankingRule[]; categories?: ItemCategory[] }
    | { rules: RankingRule[]; methodName?: string; methodVersion?: number; categories: ItemCategory[] },
  now: Date = new Date(),
): RankedBuckets {
  const method = "method" in source
    ? source.method
    : {
        name: source.methodName ?? "Método",
        version: source.methodVersion ?? 1,
        scope: "PLATAFORMA" as const,
        sourceDocumentId: null,
        validFrom: null,
        validUntil: null,
        windowYears: null,
        applyCaps: false,
        coauthorRule: null,
        stratificationEnabled: false,
        isPublic: true,
        verifiedByUser: true,
      };
  const rules = source.rules;
  const precookedCategories = "categories" in source && source.categories
    ? source.categories
    : groupRulesIntoCategories(rules);

  const pontuarResult = pontuar(items, method, rules, now);

  const itensCatalogados = new Map<string, ItemCategory>();
  for (const cat of precookedCategories) itensCatalogados.set(cat.label, cat);

  const ruleByKey = new Map<string, RankingRule>();
  for (const r of rules) {
    ruleByKey.set(`${r.categoryLabel}|${r.itemType}|${r.qualisStratum ?? ""}|${r.orderIndex}`, r);
  }

  const ranked: RankedItem[] = [];
  for (const out of pontuarResult.items) {
    const categoria = itensCatalogados.get(out.categoryLabel)
      ?? groupRulesIntoCategory(out.categoryLabel, rules);
    const ruleCandidates = categoria.rules.filter(
      (r) => pontuarResult.items.some((it) => it.ruleId === r.id) || r.categoryLabel === out.categoryLabel,
    );
    const exemplarRule = ruleCandidates.sort((a, b) => a.orderIndex - b.orderIndex)[0]
      ?? categoria.rules[0]
      ?? ruleByKey.values().next().value!;
    const itemOriginal = items.find((it) => it.id === out.itemId);
    ranked.push({
      itemId: out.itemId,
      categoryLabel: out.categoryLabel,
      rule: exemplarRule,
      points: out.pointsAwarded,
      item: { title: itemOriginal?.title, year: itemOriginal?.year ?? null },
      excluded: out.excluded,
      excludedReason: out.excludedReason,
      reason: out.excludedReason ?? undefined,
    });
  }

  for (const ex of pontuarResult.excluded) {
    const categoria = itensCatalogados.get(ex.itemId) ?? precookedCategories[0];
    const itemOriginal = items.find((it) => it.id === ex.itemId);
    ranked.push({
      itemId: ex.itemId,
      categoryLabel: categoria?.label ?? "Sem categoria",
      rule: categoria?.rules[0] ?? rules[0]!,
      points: 0,
      item: { title: itemOriginal?.title, year: itemOriginal?.year ?? null },
      excluded: true,
      excludedReason: ex.reason,
      reason: ex.reason,
    });
  }

  return { ranked, categories: precookedCategories };
}

function groupRulesIntoCategory(label: string, rules: RankingRule[]): ItemCategory {
  return {
    label,
    rules: rules.filter((r) => r.categoryLabel === label).map((r) => ({ ...r, label: r.label ?? r.categoryLabel })),
  };
}

function groupRulesIntoCategories(rules: RankingRule[]): ItemCategory[] {
  const out: ItemCategory[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.categoryLabel)) continue;
    seen.add(r.categoryLabel);
    out.push(groupRulesIntoCategory(r.categoryLabel, rules));
  }
  return out.sort((a, b) => {
    const oa = a.rules[0]?.orderIndex ?? 99;
    const ob = b.rules[0]?.orderIndex ?? 99;
    return oa - ob;
  });
}

// ── Texto auditável (backlog 4.5) ─────────────────────────────────
export function renderBalancete(result: PontuarResult, method: RankingMethod): string {
  const lines: string[] = [];
  lines.push(`Total: ${result.total} pts`);
  for (const cat of result.breakdown) {
    lines.push(`  ${cat.categoryLabel}: ${cat.total} pts (${cat.items.length} itens)`);
  }
  if (result.excluded.length > 0) {
    lines.push(`  Excluídos: ${result.excluded.length}`);
    const sample = result.excluded.slice(0, 10);
    for (const ex of sample) lines.push(`    · ${ex.itemId} — ${ex.reason}`);
  }
  const janelaTxt = method.windowYears === null ? "vida inteira" : `${method.windowYears} anos`;
  lines.push(`  Janela: ${janelaTxt} · tetos: ${method.applyCaps ? "aplicados" : "não"}`);
  return lines.join("\n");
}
