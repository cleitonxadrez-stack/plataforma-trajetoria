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
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="cofre-head">
        <div>
          <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Dossiê</p>
          <h1 className="serif text-4xl text-[#0B2341] mb-1">Dossiês por edital</h1>
          <p className="text-stone-600 max-w-2xl mt-2">
            Selecione itens da sua trajetória e monte um dossiê pontuado conforme os critérios de cada edital.
          </p>
        </div>
        <div className="cofre-actions">
          <Link href="/dossies/novo" className="btn-primary">+ Novo dossiê</Link>
        </div>
      </div>

      {list.length === 0 ? (
        <section className="dos-empty">
          <svg className="dos-empty-art" viewBox="0 0 200 150" fill="none" aria-hidden="true">
            <rect x="52" y="24" width="96" height="104" rx="10" fill="#fff" stroke="#C9D8EF" strokeWidth="2" />
            <path d="M70 48h60M70 62h44M70 76h60M70 90h36" stroke="#C9D8EF" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="150" cy="112" r="20" fill="#EAF2FF" stroke="#1F5EFF" strokeWidth="2" />
            <path d="M143 112l5 5 9-10" stroke="#1F5EFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="serif text-2xl text-[#0B2341] mb-1">Nenhum dossiê ainda</h2>
          <p className="text-stone-600 max-w-md mx-auto mb-6">
            Use a metodologia padrão <strong>&ldquo;Trajetória v1&rdquo;</strong> ou importe um edital em PDF —
            organizamos seus itens já pontuados.
          </p>
          <ol className="dos-steps">
            <li><span className="dos-step-n">1</span><span>Escolha o edital ou metodologia</span></li>
            <li><span className="dos-step-n">2</span><span>Selecione os itens que contam</span></li>
            <li><span className="dos-step-n">3</span><span>Gere o PDF com barema e pontuação</span></li>
          </ol>
          <Link href="/dossies/novo" className="btn-primary">Criar primeiro dossiê</Link>
        </section>
      ) : (
        <ul className="dos-list">
          {list.map((d) => (
            <li key={d.id}>
              <Link href={`/dossies/${d.id}`} className="dos-card">
                <header className="dos-card-head">
                  <h2 className="serif text-xl text-[#0B2341]">{d.title}</h2>
                  <StatusBadge status={d.status} />
                </header>
                {d.purpose && <p className="dos-card-purpose">{d.purpose}</p>}
                <div className="dos-card-stats">
                  <span><strong>{d.items_count ?? 0}</strong> itens contados</span>
                  <span className="dos-excl"><strong>{d.excluded_count ?? 0}</strong> excluídos</span>
                  <span className="dos-pts"><strong>{d.total_points ?? 0}</strong> pts</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="dos-note">
        <span className="dos-note-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8v5M12 16h.01" /></svg>
        </span>
        <p>O dossiê é uma simulação de apoio — <strong>nunca substitui</strong> a conferência oficial com a comissão do edital.</p>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PRONTO") return <span className="dos-badge dos-badge-ok">Pronto</span>;
  if (status === "GERADO_PDF") return <span className="dos-badge dos-badge-ok">PDF gerado</span>;
  return <span className="dos-badge dos-badge-draft">Rascunho</span>;
}
