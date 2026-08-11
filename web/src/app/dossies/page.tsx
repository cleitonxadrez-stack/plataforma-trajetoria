// src/app/dossies/page.tsx
// BLOCO 4 — Listagem de dossiês do usuário.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DossiersListPage() {
  const sb = await createClient();
  const { data: ures, error: uerr } = await sb.auth.getUser();
  if (uerr || !ures?.user) redirect("/entrar?redirect=/dossies");
  const uid = ures.user.id;

  const { data: rows } = await sb
    .from("dossiers")
    .select("id, title, purpose, status, total_points, items_count, excluded_count, created_at")
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as Array<{
    id: string;
    title: string;
    purpose: string | null;
    status: string;
    total_points: number | null;
    items_count: number | null;
    excluded_count: number | null;
    created_at: string;
  }>;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex justify-between items-baseline">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#0f2942]/70">Dossiê</p>
          <h1 className="serif text-3xl">Dossiês</h1>
        </div>
        <Link href="/dossies/novo" className="btn-primary">+ Novo dossiê</Link>
      </header>

      {list.length === 0 ? (
        <section className="card text-center py-12">
          <p className="serif text-xl mb-2">Nenhum dossiê ainda</p>
          <p className="text-sm text-[#0f2942]/70 mb-4">
            Você pode usar a metodologia padrão "Trajetória v1" ou importar um edital em PDF.
          </p>
          <Link href="/dossies/novo" className="btn-primary">Criar primeiro dossiê</Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {list.map((d) => (
            <li key={d.id}>
              <Link href={`/dossies/${d.id}`} className="card block hover:shadow-md transition">
                <header className="flex justify-between items-baseline">
                  <h2 className="serif text-xl">{d.title}</h2>
                  <StatusBadge status={d.status} />
                </header>
                {d.purpose && <p className="text-sm text-[#0f2942]/70 mt-1">{d.purpose}</p>}
                <div className="mt-3 text-xs text-[#0f2942]/60 grid grid-cols-3 gap-2">
                  <span>{d.items_count ?? 0} itens contados</span>
                  <span className="text-[#8a2a1f]">{d.excluded_count ?? 0} excluídos</span>
                  <span className="font-mono">{d.total_points ?? 0} pts</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-3">
        Simulação permanentemente avisada: o dossiê nunca substitui a conferência com a
        comissão do edital.
      </p>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PRONTO") return <span className="text-xs bg-[#e3efe9] text-[#0d6b52] px-2 py-1 rounded">PRONTO</span>;
  if (status === "GERADO_PDF") return <span className="text-xs bg-[#e3efe9] text-[#0d6b52] px-2 py-1 rounded">PDF GERADO</span>;
  return <span className="text-xs bg-[#f3f0eb] text-[#0f2942]/70 px-2 py-1 rounded">RASCUNHO</span>;
}
