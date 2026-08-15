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
        <>
          <section className="dos-empty">
            <svg className="dos-empty-art" viewBox="0 0 300 180" fill="none" aria-hidden="true">
              {/* laurel */}
              <path d="M70 60c-14 6-20 20-18 40M70 78c-10 2-14 9-13 19M70 96c-8 2-10 7-9 14" stroke="#C8A45A" strokeWidth="2.4" strokeLinecap="round" />
              {/* documentos ao fundo */}
              <g stroke="#C9D8EF" strokeWidth="2" fill="#fff">
                <rect x="120" y="26" width="52" height="66" rx="6" />
                <rect x="150" y="18" width="52" height="66" rx="6" />
              </g>
              <g stroke="#C9D8EF" strokeWidth="2" strokeLinecap="round">
                <path d="M132 44h28M132 56h20" />
                <path d="M162 36h28M162 48h20" />
              </g>
              {/* pasta navy */}
              <path d="M96 92h44l10 12h64a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H96a8 8 0 0 1-8-8v-52a8 8 0 0 1 8-8Z" fill="#0B2341" />
              <path d="M96 104h172" stroke="#1c3d5e" strokeWidth="2" />
              {/* medalha */}
              <circle cx="228" cy="118" r="18" fill="#E7F7EF" stroke="#168553" strokeWidth="2" />
              <path d="M220 118l5 5 10-10" stroke="#168553" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M222 134l-4 12 10-6 10 6-4-12" stroke="#1F5EFF" strokeWidth="2" fill="none" strokeLinejoin="round" />
            </svg>
            <h2 className="serif text-3xl text-[#0B2341] mb-2">Você ainda não criou nenhum dossiê</h2>
            <p className="text-stone-600 max-w-md mx-auto mb-6">
              Crie seu primeiro dossiê a partir da sua trajetória ou importe um edital em PDF.
            </p>
            <div className="dos-empty-actions">
              <Link href="/dossies/novo" className="btn-primary">Criar primeiro dossiê</Link>
              <Link href="/dossies/novo" className="btn-secondary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" /></svg>
                Importar edital em PDF
              </Link>
            </div>
            <Link href="/sobre" className="dos-how">Entenda como funciona ›</Link>

            <div className="dos-steps-h">
              <div className="dos-step">
                <span className="dos-step-n">1</span>
                <svg className="dos-step-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
                <span className="dos-step-tx">Selecione ou importe um edital</span>
              </div>
              <span className="dos-step-conn" />
              <div className="dos-step">
                <span className="dos-step-n">2</span>
                <svg className="dos-step-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l2 2 4-4M4 5h16v14H4zM8 3v4M16 3v4" /></svg>
                <span className="dos-step-tx">Escolha produções e comprovantes</span>
              </div>
              <span className="dos-step-conn" />
              <div className="dos-step">
                <span className="dos-step-n">3</span>
                <svg className="dos-step-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h5l2 2h9v10H4zM4 7V5h4l2 2" /></svg>
                <span className="dos-step-tx">Gere o dossiê organizado</span>
              </div>
            </div>
          </section>

          <section className="dos-bottom">
            <div className="card dos-create">
              <h3 className="serif text-xl text-[#0B2341] mb-4">O que você pode criar</h3>
              <div className="dos-create-grid">
                <div className="dos-create-item">
                  <span className="dos-create-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h4" /></svg></span>
                  <p className="dos-create-t">Dossiê para edital</p>
                  <p className="dos-create-d">Organize suas produções conforme os critérios do edital.</p>
                </div>
                <div className="dos-create-item">
                  <span className="dos-create-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 8l10 5 10-5-10-5ZM6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" /></svg></span>
                  <p className="dos-create-t">Seleção acadêmica</p>
                  <p className="dos-create-d">Monte dossiês para processos seletivos e bolsas.</p>
                </div>
                <div className="dos-create-item">
                  <span className="dos-create-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V9l7-4 7 4v12M9 21v-6h6v6" /></svg></span>
                  <p className="dos-create-t">Prestação de informações</p>
                  <p className="dos-create-d">Reúna comprovantes para relatórios e auditorias.</p>
                </div>
              </div>
            </div>
            <div className="dos-warn">
              <span className="dos-warn-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20L12 3ZM12 9v5M12 17h.01" /></svg>
              </span>
              <p>A simulação auxilia na organização, mas <strong>não substitui</strong> a conferência da comissão do edital.</p>
            </div>
          </section>
        </>
      ) : (
        <>
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
          <div className="dos-note">
            <span className="dos-note-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8v5M12 16h.01" /></svg>
            </span>
            <p>O dossiê é uma simulação de apoio — <strong>nunca substitui</strong> a conferência oficial com a comissão do edital.</p>
          </div>
        </>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PRONTO") return <span className="dos-badge dos-badge-ok">Pronto</span>;
  if (status === "GERADO_PDF") return <span className="dos-badge dos-badge-ok">PDF gerado</span>;
  return <span className="dos-badge dos-badge-draft">Rascunho</span>;
}
