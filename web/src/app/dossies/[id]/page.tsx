// src/app/dossies/[id]/page.tsx
// BLOCO 4.4/4.5 — Página do dossiê + transparência do cálculo.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { pontuar, renderBalancete, type AcademicItemLite, type RankingMethod, type RankingRule } from "@/lib/domain/dossier";

export const dynamic = "force-dynamic";

export default async function DossierDetail(props: { params: Promise<{ id: string }> }) {
  const sb = await createClient();
  const { id } = await props.params;
  const { data: ures, error: uerr } = await sb.auth.getUser();
  if (uerr || !ures?.user) redirect("/entrar");
  const uid = ures.user.id;

  const { data: dos } = await sb
    .from("dossiers")
    .select("id, title, purpose, status, method_id, total_points, created_at")
    .eq("id", id)
    .eq("user_id", uid)
    .is("deleted_at", null)
    .maybeSingle();

  if (!dos) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="serif text-2xl">Dossiê não encontrado</h1>
        <Link href="/dossies" className="text-sm underline">Voltar à lista</Link>
      </main>
    );
  }
  const d = dos as { id: string; title: string; purpose: string | null; status: string; method_id: string; total_points: number | null; created_at: string };
  const methodId = d.method_id;

  const { data: rm } = await sb
    .from("ranking_methods")
    .select("id, name, version, scope, window_years, apply_caps, coauthor_rule")
    .eq("id", methodId)
    .eq("user_id", uid)
    .is("deleted_at", null)
    .maybeSingle();
  const methodRaw = rm as
    | { id: string; name: string; version: number; scope: string; window_years: number | null; apply_caps: boolean; coauthor_rule: unknown }
    | null;

  const { data: rr } = await sb
    .from("ranking_rules")
    .select("id, category_label, item_type, qualis_stratum, points, cap_per_year, cap_per_category, cap_total, order_index, conditions")
    .eq("method_id", methodId)
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("order_index");
  const rulesArr = (rr ?? []) as Array<{
    id: string; category_label: string; item_type: string; qualis_stratum: string | null;
    points: number; cap_per_year: number | null; cap_per_category: number | null;
    cap_total: number | null; order_index: number; conditions: unknown;
  }>;

  const { data: ai } = await sb
    .from("academic_items")
    .select("id, item_type, title, year, qualis, author_count, evidence_status")
    .eq("user_id", uid)
    .is("deleted_at", null);
  const itemsArr = ((ai ?? []) as unknown) as AcademicItemLite[];

  const method: RankingMethod = {
    name: methodRaw?.name ?? "Método",
    version: methodRaw?.version ?? 1,
    scope: (methodRaw?.scope as RankingMethod["scope"]) ?? "EDITAL",
    sourceDocumentId: null,
    validFrom: null,
    validUntil: null,
    windowYears: methodRaw?.window_years ?? null,
    applyCaps: methodRaw?.apply_caps ?? false,
    coauthorRule: (methodRaw?.coauthor_rule as RankingMethod["coauthorRule"]) ?? null,
    stratificationEnabled: false,
    isPublic: false,
    verifiedByUser: false,
  };
  const rules: RankingRule[] = rulesArr.map((r) => ({
    id: r.id,
    methodId,
    categoryLabel: r.category_label,
    itemType: r.item_type,
    qualisStratum: r.qualis_stratum,
    points: Number(r.points),
    capPerYear: r.cap_per_year,
    capPerCategory: r.cap_per_category,
    capTotal: r.cap_total,
    orderIndex: r.order_index,
    conditions: (r.conditions as RankingRule["conditions"]) ?? null,
  }));

  const result = pontuar(itemsArr, method, rules);
  const audit = renderBalancete(result, method);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10" data-testid="dossier-detail">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#0B2341]/70">Dossiê</p>
          <h1 className="serif text-3xl">{d.title}</h1>
          {d.purpose && <p className="text-sm text-[#0B2341]/70 mt-1">{d.purpose}</p>}
        </div>
        <Link href={`/dossies/${d.id}/pdf`} className="btn-primary">Gerar PDF</Link>
      </header>

      <section className="card mb-6 flex items-baseline gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#0B2341]/70">Total</p>
          <p className="serif text-5xl" data-testid="dossier-total">{result.total}</p>
          <p className="text-xs text-[#0B2341]/70">pontos</p>
        </div>
        <div className="text-sm space-y-1">
          <p>{result.items.length} itens contados</p>
          <p className="text-[#8a2a1f]">{result.excluded.length} itens excluídos</p>
          <p className="text-[#0B2341]/70">
            Janela: {method.windowYears === null ? "vida inteira" : `${method.windowYears} anos`} ·
            Tetos: {method.applyCaps ? "aplicados" : "não"}
          </p>
        </div>
      </section>

      {result.excluded.length > 0 && (
        <section className="card mb-6">
          <h2 className="serif text-xl mb-2">Excluídos</h2>
          <ul className="text-sm space-y-1">
            {result.excluded.slice(0, 30).map((e, i) => (
              <li key={i} className="border-b border-[#0B2341]/10 py-1">
                <span className="font-mono text-xs text-[#0B2341]/60">{e.itemId.slice(0, 8)}</span>
                <span className="ml-2">{e.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-6">
        {result.breakdown.map((cat) => (
          <div className="card" key={cat.categoryLabel} data-testid={`category-${cat.categoryLabel}`}>
            <header className="flex justify-between items-baseline mb-2">
              <h2 className="serif text-xl">{cat.categoryLabel}</h2>
              <p className="text-2xl font-medium">{cat.total} pts</p>
            </header>
            <ol className="text-sm space-y-1">
              {cat.items.map((it) => (
                <li key={it.itemId} className="flex justify-between border-b border-[#0B2341]/10 py-1">
                  <span>
                    <span className="font-mono text-xs text-[#0B2341]/60 mr-2">#{it.orderIndex}</span>
                    {it.itemId.slice(0, 8)}
                  </span>
                  <span className="font-mono">{it.pointsAwarded} pts</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">Balancete auditável</summary>
        <pre className="text-xs font-mono whitespace-pre-wrap bg-[#F1F5F9] p-3 rounded mt-2">{audit}</pre>
      </details>

      <p className="mt-10 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-3">
        Simulação baseada na leitura do edital e nos itens marcados como comprovados.
        Confira com a comissão responsável antes de submeter.
      </p>
    </main>
  );
}
