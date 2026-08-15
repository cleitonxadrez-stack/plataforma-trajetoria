// src/app/trajetoria/page.tsx
// Linha do tempo por ANO (colapsável). Lê academic_items via RLS, aplica a
// dedup geral do site e agrupa por ano.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { dedupeItems } from "@/lib/domain/dedupe";
import { cvSeal } from "@/lib/domain/cv-sections";
import { TrajetoriaTimeline, type TlYear, type TlStats } from "@/components/TrajetoriaTimeline";

export const metadata = { title: "Trajetória — Trajetória360" };
export const dynamic = "force-dynamic";

interface Row {
  id: string; item_type: string; title: string; year: number | null; natureza: string | null;
  origin: string; verification_level: string; evidence_status: string; isbn: string | null; flagged_lattes: boolean | null;
}

export default async function TrajetoriaPage() {
  const sb = await createClient();
  const { data: u, error } = await sb.auth.getUser();
  if (error || !u.user) redirect("/entrar?redirect=/trajetoria");

  const { data: rawRows, error: aiErr } = await sb
    .from("academic_items")
    .select("id,item_type,title,year,natureza,origin,verification_level,evidence_status,isbn,flagged_lattes")
    .eq("user_id", u.user.id).is("deleted_at", null).order("year", { ascending: false });
  if (aiErr) return <ErrorTrajetoria message={aiErr.message} />;
  const list = (rawRows ?? []) as Row[];

  if (list.length === 0) return <EmptyTrajetoria />;

  // evidências → documento principal (RLS já limita ao usuário)
  const docByItem = new Map<string, string>();
  const { data: evs } = await sb.from("evidences").select("item_id, document_id").is("deleted_at", null);
  for (const e of (evs ?? []) as { item_id: string; document_id: string }[])
    if (!docByItem.has(e.item_id)) docByItem.set(e.item_id, e.document_id);

  type Item = Row & { docId: string | null };
  const items: Item[] = list.map((r) => ({ ...r, docId: docByItem.get(r.id) ?? null }));

  // dedup geral do site
  const deduped = dedupeItems(items, (it) => ({
    title: it.title, bucket: it.item_type,
    score: (["comprovado", "validado"].includes(cvSeal({ verificationLevel: it.verification_level, evidenceStatus: it.evidence_status, docId: it.docId, isbn: it.isbn }).tone) ? 1_000_000 : 0) + it.title.length,
  }));

  // contagem por estado
  const stats: TlStats = { autodeclarado: 0, confirmado: 0, documentado: 0, validado: 0 };
  for (const it of deduped) {
    const v = it.verification_level;
    if (v === "VALIDADO") stats.validado++;
    else if (v === "DOCUMENTADO") stats.documentado++;
    else if (v === "CONFIRMADO") stats.confirmado++;
    else stats.autodeclarado++;
  }

  // agrupa por ano desc
  const byYear = new Map<number, TlYear["items"]>();
  for (const it of deduped) {
    const y = it.year || 0;
    const seal = cvSeal({ verificationLevel: it.verification_level, evidenceStatus: it.evidence_status, docId: it.docId, isbn: it.isbn });
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push({
      id: it.id, title: it.title, kind: it.item_type, natureza: it.natureza,
      sealLabel: seal.label, sealTone: seal.tone, docId: it.docId, lattes: !!it.flagged_lattes,
    });
  }
  const years: TlYear[] = [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, items]) => ({ year, items }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Trajetória</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-1">Sua linha do tempo intelectual</h1>
      <p className="text-stone-600 max-w-2xl mt-2 mb-6">
        Clique num ano para ver os itens daquele período. Cada item começa <strong>autodeclarado</strong> e vira
        <strong> documentado</strong> quando você anexa um comprovante.
      </p>
      <TrajetoriaTimeline stats={stats} years={years} />
    </main>
  );
}

function EmptyTrajetoria() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Trajetória</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-3">Sua linha do tempo está vazia</h1>
      <p className="text-stone-700 max-w-2xl">Importe seu currículo Lattes e seus itens aparecem aqui, organizados por ano.</p>
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link href="/importar" className="btn-primary">Importar currículo Lattes</Link>
        <Link href="/exportar" className="btn-secondary">Exportar currículo</Link>
      </div>
    </main>
  );
}

function ErrorTrajetoria({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="serif text-3xl text-[#B4413C] mb-3">Não foi possível carregar sua trajetória</h1>
      <p className="text-sm text-stone-700">Erro: {message}</p>
    </main>
  );
}
