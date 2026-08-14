// src/app/trajetoria/[id]/page.tsx
// Detalhe de um item — Bloco 3, rota preparada para Bloco 4 (dossiê).
//
// Server Component. SELECT em academic_items filtrado por RLS (auth.uid()).
// 404 se item não pertence ao usuário autenticado (RLS bloqueia já).

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { SeloComprovacao } from "@/components/SeloComprovacao";
import { reconcile } from "@/lib/domain/items";

export const metadata = { title: "Item — Trajetória" };
export const dynamic = "force-dynamic";

interface RawItemRow {
  id: string;
  item_type: string;
  title: string;
  title_en: string | null;
  year: number | null;
  doi: string | null;
  visibility: string;
  verification_level: string;
  evidence_status: string;
  flagged_innovation: boolean | null;
  flagged_lattes: boolean | null;
}

export default async function ItemDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) redirect(`/entrar?redirect=/trajetoria/${id}`);

  const { data: row } = await supabase
    .from("academic_items")
    .select("id,item_type,title,title_en,year,doi,visibility,verification_level,evidence_status,flagged_innovation,flagged_lattes")
    .eq("id", id)
    .eq("user_id", sess.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!row) {
    notFound();   // RLS já bloqueia — 404 oficial
  }
  const r_row = row as RawItemRow;

  // Count de evidências vinculadas.
  const { count: evCount } = await supabase
    .from("evidences")
    .select("id", { count: "exact", head: true })
    .eq("academic_item_id", id)
    .is("deleted_at", null);

  const evidenceCount = evCount ?? 0;
  const r = reconcile({ state: r_row.verification_level as "AUTODECLARADO" | "CONFIRMADO" | "DOCUMENTADO" | "VALIDADO", evidenceCount });

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">
        <Link href="/trajetoria" className="hover:underline">← Trajetória</Link>
      </p>
      <h1 className="serif text-3xl text-[#102A43] leading-tight mb-2">{r_row.title}</h1>
      {r_row.title_en && <p className="italic text-stone-600 mb-4">{r_row.title_en}</p>}

      <div className="flex flex-wrap gap-3 mb-6">
        <SeloComprovacao status={r.evidenceStatus} />
        <span className="text-xs text-stone-500">{r_row.item_type} · {r_row.year}</span>
        {r_row.doi && <span className="font-mono text-xs text-[#2563EB]">DOI: {r_row.doi}</span>}
        {r_row.flagged_lattes && (
          <span className="text-xs text-[#2563EB] bg-[#e1ecf5] rounded px-2 py-1">Lattes</span>
        )}
        {r_row.flagged_innovation && (
          <span className="text-xs text-[#15803D] bg-[#e3efe9] rounded px-2 py-1">Inovação</span>
        )}
      </div>

      <section className="card">
        <p className="text-sm text-stone-700">
          <strong>Estado:</strong> {r_row.verification_level} ·
          <strong className="ml-2">Evidências:</strong> {evidenceCount}
        </p>
        <p className="text-xs text-stone-500 mt-3">
          Vida do item: AUTODECLARADO → CONFIRMADO → DOCUMENTADO → VALIDADO.
          O próximo passo só dispara após ação humana (CLAUDE.md §"Confirme ou edite").
        </p>
      </section>

      <p className="text-xs text-stone-500 mt-6">
        Quando o Bloco 4 (dossiê) estiver pronto, esta página mostrará os editais
        nos quais este item já contribuiu para pontuação.
      </p>
    </main>
  );
}
