// src/app/exportar/page.tsx
// Central de exportação (premium): currículo, PDF de documentos, dados pessoais,
// dossiê. Ícones vetoriais, chips de contagem, cards com badge.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Exportar — Trajetória360" };
export const dynamic = "force-dynamic";

function I({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}
const ICONS = {
  file: "M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h4",
  clip: "M21 11.5 12 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 9",
  idcard: "M3 6h18v12H3zM7 10h4M7 14h6M16 9a2 2 0 1 1-.01 4A2 2 0 0 1 16 9",
  case: "M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
  shield: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4",
  back: "M15 6l-6 6 6 6",
};

export default async function ExportarPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar");

  const [{ count: itens }, { count: docs }] = await Promise.all([
    sb.from("academic_items").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).is("deleted_at", null),
    sb.from("documents").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).is("deleted_at", null),
  ]);

  return (
    <main className="exp">
      <div className="exp-head">
        <div>
          <Link href="/trajetoria" className="back-link"><I d={ICONS.back} /> Voltar para a trajetória</Link>
          <p className="exp-kicker">Exportar</p>
          <h1 className="exp-title serif">Gerar currículo e documentos</h1>
          <p className="exp-sub">Transforme sua trajetória organizada em documentos profissionais, prontos para revisar e compartilhar.</p>
          <div className="exp-chips">
            <span className="exp-chip"><I d={ICONS.file} /> {itens ?? 0} itens</span>
            <span className="exp-chip"><I d={ICONS.clip} /> {docs ?? 0} documentos</span>
          </div>
        </div>
        <svg className="exp-illustration" viewBox="0 0 200 150" fill="none" aria-hidden="true">
          <rect x="70" y="20" width="90" height="110" rx="8" fill="#fff" stroke="#C9D8EF" strokeWidth="2" />
          <circle cx="95" cy="46" r="10" fill="#EAF2FF" stroke="#1F5EFF" strokeWidth="1.5" />
          <path d="M118 40h30M118 50h24M85 74h60M85 86h60M85 98h44" stroke="#C9D8EF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="150" cy="120" r="16" fill="#1F5EFF" />
          <path d="M150 113v10m0 0 4-4m-4 4-4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="exp-section-title">Escolha o que deseja gerar</h2>
      <section className="exp-grid">
        <article className="exp-card exp-card-primary">
          <div className="exp-card-top"><span className="exp-card-icon"><I d={ICONS.idcard} /></span>
            <span className="exp-card-badge">Estilo Lattes</span></div>
          <h3 className="serif">Currículo acadêmico</h3>
          <p>Currículo aberto, por área, com produção organizada e marcadores bibliográficos.</p>
          <div className="exp-card-foot"><span className="exp-card-note">PDF · Editável</span>
            <Link href="/exportar/curriculo" className="exp-btn exp-btn-blue">Gerar currículo</Link></div>
        </article>

        <article className="exp-card">
          <div className="exp-card-top"><span className="exp-card-icon"><I d={ICONS.clip} /></span></div>
          <h3 className="serif">PDF de documentos</h3>
          <p>Escolha entre os {docs ?? 0} comprovantes e gere um único PDF (capa + índice) só com os selecionados.</p>
          <div className="exp-card-foot"><span className="exp-card-note">Seleção · PDF único</span>
            <Link href="/exportar/documentos" className="exp-btn exp-btn-outline">Selecionar e gerar</Link></div>
        </article>

        <article className="exp-card">
          <div className="exp-card-top"><span className="exp-card-icon"><I d={ICONS.idcard} /></span></div>
          <h3 className="serif">Dados pessoais</h3>
          <p>Consulte e exporte seus dados cadastrais para formulários e inscrições.</p>
          <div className="exp-card-foot"><span className="exp-card-note">Dados protegidos</span>
            <Link href="/exportar/dados" className="exp-btn exp-btn-outline">Visualizar dados</Link></div>
        </article>

        <article className="exp-card exp-card-gold">
          <div className="exp-card-top"><span className="exp-card-icon exp-card-icon-gold"><I d={ICONS.case} /></span>
            <span className="exp-card-badge exp-card-badge-gold">Pontuado</span></div>
          <h3 className="serif">Dossiê por edital</h3>
          <p>Selecione itens e monte um dossiê organizado conforme os critérios do edital.</p>
          <div className="exp-card-foot"><span className="exp-card-note">PDF com barema</span>
            <Link href="/dossies" className="exp-btn exp-btn-navy">Montar dossiê</Link></div>
        </article>
      </section>

      <div className="exp-privacy">
        <span className="exp-privacy-icon"><I d={ICONS.shield} /></span>
        <p>Os arquivos são gerados a partir dos seus dados e documentos privados. Revise o conteúdo antes de compartilhar.</p>
      </div>
    </main>
  );
}
