// src/app/admin/page.tsx
// Painel administrativo (só para e-mails em ADMIN_EMAILS): usuários, uso e
// custos efetivos, com barras de capacidade e alerta aos 70%.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin/access";
import { getAdminStats } from "@/lib/admin/stats";

export const metadata = { title: "Admin — Trajetória360" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WARN = 0.7; // alerta aos 70%
const BRL = 5.2;  // câmbio aproximado p/ referência

function fmtGB(gb: number) { return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(gb * 1024).toFixed(0)} MB`; }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

function Bar({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const warn = pct >= WARN;
  return (
    <div className={`adm-cap ${warn ? "warn" : ""}`}>
      <div className="adm-cap-head">
        <span className="adm-cap-label">{label}</span>
        <span className="adm-cap-val">{used.toFixed(unit === "GB" ? 2 : 0)} / {limit} {unit} · {(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="adm-cap-track"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>
    </div>
  );
}

export default async function AdminPage() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/entrar?redirect=/admin");
  if (!isAdminEmail(data.user.email)) redirect("/painel");

  const stats = await getAdminStats();

  const DB_LIMIT_GB = Number(process.env.ADMIN_DB_LIMIT_GB ?? 8);
  const R2_LIMIT_GB = Number(process.env.ADMIN_R2_LIMIT_GB ?? 10);
  const dbGb = stats.dbBytes / 1073741824;
  const r2Gb = stats.totalMb / 1024;
  const dbPct = DB_LIMIT_GB > 0 ? dbGb / DB_LIMIT_GB : 0;
  const r2Pct = R2_LIMIT_GB > 0 ? r2Gb / R2_LIMIT_GB : 0;
  const anyWarn = dbPct >= WARN || r2Pct >= WARN;

  const aiUsd = stats.aiCostCents / 100;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Administração</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-1">Controle de contas e custos</h1>
      <p className="text-stone-600 mb-6">Uso efetivo da plataforma. Alerta automático quando qualquer recurso passa de {Math.round(WARN * 100)}%.</p>

      {anyWarn && (
        <div className="adm-alert">
          <strong>Atenção:</strong> um recurso passou de {Math.round(WARN * 100)}% da capacidade contratada.
          Considere contratar um pacote maior antes de esgotar.
        </div>
      )}

      <section className="cofre-tiles" aria-label="Resumo">
        <div className="cofre-tile"><span className="cofre-tile-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" /></svg></span><div><p className="cofre-tile-count">{stats.totalUsers}</p><p className="cofre-tile-label">Usuários</p></div></div>
        <div className="cofre-tile"><span className="cofre-tile-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg></span><div><p className="cofre-tile-count">{stats.totalDocs}</p><p className="cofre-tile-label">Documentos</p></div></div>
        <div className="cofre-tile cofre-tile-green"><span className="cofre-tile-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 15a4 4 0 0 0 4 4h9a5 5 0 0 0 1-9.9A6 6 0 0 0 5 9a4 4 0 0 0-2 6Z" /></svg></span><div><p className="cofre-tile-count">{fmtGB(r2Gb)}</p><p className="cofre-tile-label">Arquivos (R2)</p></div></div>
        <div className="cofre-tile cofre-tile-amber"><span className="cofre-tile-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></span><div><p className="cofre-tile-count">US$ {aiUsd.toFixed(2)}</p><p className="cofre-tile-label">Custo de IA (total)</p></div></div>
      </section>

      <section className="adm-caps">
        <h2 className="serif text-xl text-[#0B2341] mb-3">Capacidade</h2>
        <Bar label="Banco (Supabase)" used={dbGb} limit={DB_LIMIT_GB} unit="GB" />
        <Bar label="Arquivos (Cloudflare R2)" used={r2Gb} limit={R2_LIMIT_GB} unit="GB" />
        <p className="adm-caps-note">
          Limites ajustáveis por env: <code>ADMIN_DB_LIMIT_GB</code> ({DB_LIMIT_GB}) e <code>ADMIN_R2_LIMIT_GB</code> ({R2_LIMIT_GB}).
          Custo de IA acumulado: US$ {aiUsd.toFixed(4)} (~R$ {(aiUsd * BRL).toFixed(2)}).
        </p>
      </section>

      <section className="adm-users">
        <h2 className="serif text-xl text-[#0B2341] mb-3">Contas ({stats.users.length})</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>E-mail</th><th className="num">Docs</th><th className="num">Arquivos</th><th className="num">Itens</th><th className="num">Último acesso</th></tr>
            </thead>
            <tbody>
              {stats.users.map((u) => (
                <tr key={u.userId}>
                  <td>{u.email}</td>
                  <td className="num">{u.docs}</td>
                  <td className="num">{u.mb >= 1 ? `${u.mb.toFixed(1)} MB` : `${(u.mb * 1024).toFixed(0)} KB`}</td>
                  <td className="num">{u.items}</td>
                  <td className="num">{fmtDate(u.lastActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
