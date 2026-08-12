// lib/domain/pdf-dossier.ts
// Construtor PURO do PDF de um dossiê — pega dados do banco + mapeamento
// de regras e monta o documento final, sem I/O.
//
// Não invoca @react-pdf/renderer aqui; expõe `buildPdfDocument()` que
// retorna um `PdfTree` (estrutura tipada), pronta para o renderer real.
// O renderer é montado em `renderDossier()` (lazy import de @react-pdf/renderer
// — se faltar, devolve JSON estruturado que o caller pode servir como HTML
// ou salvar como recibo de "geração pendente").
//
// REGRAS (docs/05-fluxos.md §"Fluxo 5 — Geração do dossiê"):
//   1. Cabeçalho SEMPRE traz: código do dossiê, código de cada regra,
//      nome do método (versionado) e texto "SIMULAÇÃO — confira com a comissão".
//   2. Cada item: nome do item + categoria + pontos (se válido) + flag de
//      exclusão (se excluído) + motivo curto (se aplicável).
//   3. Rodapé: soma total de pontos + contagens + timestamp UTC.

import type { ItemCategory, RankedItem } from "./dossier";

export interface DossierPdfMeta {
  id: string;
  title: string;
  purpose: string | null;
  methodName: string;
  methodVersion: number;
  generatedAt: string;       // ISO UTC
}

export interface DossierPdfTree {
  meta: DossierPdfMeta;
  categories: Array<{
    label: string;
    rules: Array<{ id: string; label: string; itemType: string; qualisStratum: string | null; points: number }>;
    items: Array<{ id: string; title: string; year: number | null; points: number; excluded: boolean; excludedReason: string | null }>;
  }>;
  totals: { itemsCount: number; excludedCount: number; totalPoints: number };
  signature: { simulationNotice: string; generatedAt: string };
}

/** Erro discriminável: dados do dossiê suficientes? */
export function buildPdfDocument(opts: {
  meta: DossierPdfMeta;
  categories: ItemCategory[];
  ranked: RankedItem[];
}): DossierPdfTree {
  const { meta, categories, ranked } = opts;

  const itemsByCat = new Map<string, Array<{ id: string; title: string; year: number | null; points: number; excluded: boolean; excludedReason: string | null }>>();
  for (const r of ranked) {
    const arr = itemsByCat.get(r.categoryLabel) ?? [];
    const titleOnly = (r.item as { title?: string }).title ?? "(sem título)";
    const yearVal = (r.item as { year?: number | null }).year ?? null;
    arr.push({
      id: r.itemId,
      title: titleOnly,
      year: yearVal,
      points: r.points,
      excluded: r.excluded,
      excludedReason: r.excluded ? r.reason ?? "rule-excluded" : null,
    });
    itemsByCat.set(r.categoryLabel, arr);
  }

  const trees: DossierPdfTree["categories"] = categories.map((c, catIdx) => ({
    label: c.label,
    rules: c.rules.map((r, idx) => ({
      id: r.id ?? `${catIdx}-${idx}`,
      label: r.label ?? `${r.itemType}${r.qualisStratum ? ` ${r.qualisStratum}` : ""}`,
      itemType: r.itemType,
      qualisStratum: r.qualisStratum ?? null,
      points: r.points,
    })),
    items: itemsByCat.get(c.label) ?? [],
  }));

  const itemsCount = ranked.filter((r) => !r.excluded).length;
  const excludedCount = ranked.filter((r) => r.excluded).length;
  const totalPoints = ranked.reduce((s, r) => s + r.points, 0);

  return {
    meta,
    categories: trees,
    totals: { itemsCount, excludedCount, totalPoints },
    signature: {
      simulationNotice: "SIMULAÇÃO — confira regras com a comissão do edital.",
      generatedAt: meta.generatedAt,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Renderer: lazy import de @react-pdf/renderer.
// Se faltar a dep, devolve um Buffer com o texto JSON serializado — não
// falha o build nem a produção sem `@react-pdf/renderer` instalado.
// ─────────────────────────────────────────────────────────────────────────
export interface RenderOptions {
  /** Se true, e renderer faltar, devolve placeholder JSON (default). */
  fallbackToJson?: boolean;
}

export interface RenderOutput {
  ok: true;
  bytes: Buffer;
  mimeType: string;
  engine: "@react-pdf/renderer" | "json-placeholder";
  warning?: string;
}

export async function renderDossier(
  tree: DossierPdfTree,
  opts: RenderOptions = {},
): Promise<RenderOutput> {
  try {
    // @react-pdf expõe os componentes (Document/Page/Text/View) e renderToBuffer
    // como NAMED exports — NÃO em `default`. E os elementos são criados com o
    // `createElement` do REACT (o @react-pdf não exporta createElement).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const R: any = await import("@react-pdf/renderer" as string).catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const react: any = await import("react" as string).catch(() => null);
    if (!R?.Document || typeof R?.renderToBuffer !== "function" || typeof react?.createElement !== "function") {
      return renderPlaceholder(tree, opts);
    }
    const createElement = react.createElement;
    const styles = R.StyleSheet.create({
      page: { padding: 30, fontSize: 10, fontFamily: "Helvetica" },
      h1: { fontSize: 18, marginBottom: 8 },
      h2: { fontSize: 13, marginTop: 14, marginBottom: 4 },
      meta: { fontSize: 9, color: "#4a5266", marginBottom: 12 },
      row: { flexDirection: "row", marginBottom: 2 },
      excluded: { color: "#8a2a1f", textDecoration: "line-through" },
      notice: { marginTop: 14, padding: 8, backgroundColor: "#f3e3cd", color: "#a15a13", fontSize: 9 },
      footer: { marginTop: 18, fontSize: 9, color: "#4a5266" },
    });
    // Constrói a árvore via createElement para manter o arquivo como .ts puro
    // (sem necessidade de tsx). Mantém ordem/keys idênticas à versão JSX original.
    const doc = createElement(
      R.Document,
      null,
      createElement(
        R.Page,
        { size: "A4", style: styles.page },
        createElement(R.Text, { style: styles.h1 }, tree.meta.title),
        createElement(
          R.Text,
          { style: styles.meta },
          `método: ${tree.meta.methodName} (v${tree.meta.methodVersion}) · gerado em ${tree.meta.generatedAt}`,
        ),
        tree.meta.purpose
          ? createElement(
              R.Text,
              { style: styles.meta },
              `finalidade: ${tree.meta.purpose}`,
            )
          : null,
        ...tree.categories.flatMap((cat) => [
          createElement(
            R.View,
            { key: cat.label },
            createElement(R.Text, { style: styles.h2 }, cat.label),
            ...cat.items.map((it) =>
              createElement(
                R.View,
                { key: it.id, style: styles.row },
                createElement(
                  R.Text,
                  { style: it.excluded ? styles.excluded : {} },
                  `${it.title}${it.year ? ` (${it.year})` : ""} — ${it.points} pts` +
                    (it.excluded && it.excludedReason
                      ? `  [excluído: ${it.excludedReason}]`
                      : ""),
                ),
              ),
            ),
          ),
        ]),
        createElement(
          R.Text,
          { style: styles.footer },
          `total: ${tree.totals.totalPoints} pts · itens: ${tree.totals.itemsCount} · excluídos: ${tree.totals.excludedCount}`,
        ),
        createElement(
          R.Text,
          { style: styles.notice },
          tree.signature.simulationNotice,
        ),
      ),
    );
    const bytes = await R.renderToBuffer(doc);
    return { ok: true, bytes: Buffer.from(bytes), mimeType: "application/pdf", engine: "@react-pdf/renderer" };
  } catch (e) {
    if (opts.fallbackToJson !== false) {
      return renderPlaceholder(tree, { ...opts, warning: (e as Error).message.slice(0, 120) });
    }
    throw e;
  }
}

async function renderPlaceholder(tree: DossierPdfTree, opts: RenderOptions & { warning?: string }): Promise<RenderOutput> {
  const txt = `# Dossiê (placeholder)\n# @react-pdf/renderer não disponível — JSON estruturado.\n${JSON.stringify(tree, null, 2)}`;
  return {
    ok: true,
    bytes: Buffer.from(txt, "utf8"),
    mimeType: "application/x-dossier-tree+json",
    engine: "json-placeholder",
    warning: opts.warning ?? "@react-pdf/renderer não instalada; entregue JSON como placeholder",
  };
}
