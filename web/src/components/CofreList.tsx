"use client";

// src/components/CofreList.tsx
// Lista de documentos do Cofre com barra de filtros (busca, situação,
// confiança, ordenação) e cards premium. Filtros 100% client-side sobre
// os dados reais recebidos do servidor.

import { useMemo, useState } from "react";
import Link from "next/link";

export interface CofreDoc {
  id: string;
  registryCode: string;
  filename: string;
  state: "PENDENTE" | "EM_REVISAO" | "CONFIRMADO";
  confidence: number;
  sourceLabel: string;
  historyCount: number;
}

const STATE_META: Record<CofreDoc["state"], { label: string; cls: string }> = {
  PENDENTE: { label: "Pendente", cls: "pend" },
  EM_REVISAO: { label: "Em revisão", cls: "rev" },
  CONFIRMADO: { label: "Confirmado", cls: "ok" },
};
const ORDER: CofreDoc["state"][] = ["EM_REVISAO", "PENDENTE", "CONFIRMADO"];

function confTone(c: number) { return c >= 0.9 ? "high" : c >= 0.75 ? "mid" : "low"; }

export function CofreList({ docs }: { docs: CofreDoc[] }) {
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("");
  const [conf, setConf] = useState("");
  const [sort, setSort] = useState("recent");

  const nq = q.trim().toLowerCase();
  const view = useMemo(() => {
    let r = docs.filter((d) => {
      if (sit && d.state !== sit) return false;
      if (conf && confTone(d.confidence) !== conf) return false;
      if (nq && !(`${d.registryCode} ${d.filename}`.toLowerCase().includes(nq))) return false;
      return true;
    });
    if (sort === "conf") r = [...r].sort((a, b) => b.confidence - a.confidence);
    return r;
  }, [docs, sit, conf, nq, sort]);

  const groups = ORDER
    .map((st) => ({ st, items: view.filter((d) => d.state === st) }))
    .filter((g) => g.items.length);

  return (
    <div className="cofre-list">
      <div className="cofre-filters">
        <label className="cofre-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar documentos…" />
        </label>
        <select className="tl-select" value={sit} onChange={(e) => setSit(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Situação</option>
          <option value="PENDENTE">Pendente</option>
          <option value="EM_REVISAO">Em revisão</option>
          <option value="CONFIRMADO">Confirmado</option>
        </select>
        <select className="tl-select" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Filtrar por confiança">
          <option value="">Confiança</option>
          <option value="high">Alta (≥ 90%)</option>
          <option value="mid">Média (75–90%)</option>
          <option value="low">Baixa (&lt; 75%)</option>
        </select>
        <select className="tl-select cofre-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
          <option value="recent">Mais recentes</option>
          <option value="conf">Maior confiança</option>
        </select>
      </div>

      {groups.length === 0 && <p className="tl-empty">Nenhum documento encontrado com os filtros atuais.</p>}

      {groups.map((g) => (
        <section key={g.st} className="cofre-group">
          <header className="cofre-group-head">
            <h2 className="serif">{STATE_META[g.st].label === "Confirmado" ? "Confirmados" : STATE_META[g.st].label}</h2>
            <span className="cofre-group-n">{g.items.length}</span>
          </header>
          {g.items.map((d) => {
            const pct = Math.round(d.confidence * 100);
            const tone = confTone(d.confidence);
            const meta = STATE_META[d.state];
            return (
              <article key={d.id} className="cofre-doc">
                <span className="cofre-doc-file" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#B4413C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /><text x="12" y="18" fontSize="5" fill="#B4413C" stroke="none" textAnchor="middle">PDF</text></svg>
                </span>
                <div className="cofre-doc-main">
                  <p className="cofre-doc-code">{d.registryCode}</p>
                  <p className="cofre-doc-name">{d.filename}</p>
                  <p className="cofre-doc-src">{d.sourceLabel} · {d.historyCount} {d.historyCount === 1 ? "evento" : "eventos"} no histórico</p>
                </div>
                <div className="cofre-doc-conf">
                  <span className={`cofre-doc-badge cofre-doc-badge-${meta.cls}`}>{meta.label}</span>
                  <p className="cofre-doc-conf-t">{pct}% de confiança</p>
                  <div className={`cofre-conf-bar cofre-conf-${tone}`}><span style={{ width: `${pct}%` }} /></div>
                </div>
                <a className="cofre-doc-open" href={`/api/documentos/${d.id}`} target="_blank" rel="noopener noreferrer">Abrir</a>
                <Link className="cofre-doc-kebab" href={`/documentos/${d.id}`} aria-label="Mais ações">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                </Link>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
