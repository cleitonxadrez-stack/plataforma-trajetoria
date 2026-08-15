"use client";

// src/components/TrajetoriaTimeline.tsx
// Linha do tempo por ANO, colapsável: clica no ano → abre os itens.
// Economiza espaço em trajetórias grandes.

import { useState } from "react";

export interface TlItem {
  id: string; title: string; kind: string; natureza: string | null;
  sealLabel: string; sealTone: string; docId: string | null; lattes: boolean;
}
export interface TlYear { year: number; items: TlItem[] }
export interface TlStats { autodeclarado: number; confirmado: number; documentado: number; validado: number }

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`tl-chevron ${open ? "open" : ""}`} viewBox="0 0 24 24" width="18" height="18"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function TrajetoriaTimeline({ stats, years }: { stats: TlStats; years: TlYear[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set(years.slice(0, 2).map((y) => y.year)));
  const [q, setQ] = useState("");

  const [fYear, setFYear] = useState("");
  const [fKind, setFKind] = useState("");
  const [fSit, setFSit] = useState("");
  const nq = q.trim().toLowerCase();
  const anyFilter = !!(nq || fYear || fKind || fSit);
  const allKinds = [...new Set(years.flatMap((y) => y.items.map((i) => i.kind)))].sort();
  const view = years
    .filter((y) => !fYear || String(y.year) === fYear)
    .map((y) => ({ ...y, items: y.items.filter((i) => {
      if (fKind && i.kind !== fKind) return false;
      const isDoc = i.sealTone === "comprovado" || i.sealTone === "validado";
      if (fSit === "com" && !isDoc) return false;
      if (fSit === "sem" && isDoc) return false;
      if (nq && !(i.title + " " + (i.natureza ?? "")).toLowerCase().includes(nq)) return false;
      return true;
    }) }))
    .filter((y) => y.items.length);
  const allOpen = view.length > 0 && view.every((y) => open.has(y.year));
  function clearFilters() { setQ(""); setFYear(""); setFKind(""); setFSit(""); }

  function toggle(y: number) { setOpen((p) => { const n = new Set(p); n.has(y) ? n.delete(y) : n.add(y); return n; }); }
  function toggleAll() { setOpen(allOpen ? new Set() : new Set(view.map((y) => y.year))); }

  const STATS = [
    { k: "autodeclarado", label: "Autodeclarado", v: stats.autodeclarado, cls: "" },
    { k: "confirmado", label: "Confirmado", v: stats.confirmado, cls: "" },
    { k: "documentado", label: "Documentado", v: stats.documentado, cls: "tl-green" },
    { k: "validado", label: "Validado", v: stats.validado, cls: "tl-blue" },
  ];

  return (
    <div className="tl">
      <section className="tl-stats">
        {STATS.map((s) => (
          <div key={s.k} className="tl-stat">
            <span className={`tl-stat-n ${s.cls}`}>{s.v}</span>
            <span className="tl-stat-l">{s.label}</span>
          </div>
        ))}
      </section>

      <div className="tl-toolbar">
        <div className="tl-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar na trajetória…" />
        </div>
        <select className="tl-select" value={fYear} onChange={(e) => setFYear(e.target.value)} aria-label="Filtrar por ano">
          <option value="">Ano</option>
          {years.map((y) => <option key={y.year} value={String(y.year)}>{y.year}</option>)}
        </select>
        <select className="tl-select" value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo</option>
          {allKinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className="tl-select" value={fSit} onChange={(e) => setFSit(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Situação</option>
          <option value="com">Comprovado</option>
          <option value="sem">Sem comprovante</option>
        </select>
        {anyFilter && <button className="tl-link" onClick={clearFilters}>Limpar filtros</button>}
        <button className="tl-btn" onClick={toggleAll}>{allOpen ? "Recolher tudo" : "Expandir tudo"}</button>
      </div>

      <div className="tl-years">
        {view.length === 0 && <p className="tl-empty">Nenhum item encontrado com os filtros atuais.</p>}
        {view.map((y) => {
          const isOpen = open.has(y.year) || anyFilter;
          const docs = y.items.filter((i) => i.sealTone === "comprovado" || i.sealTone === "validado").length;
          return (
            <section key={y.year} className={`tl-year ${isOpen ? "open" : ""}`}>
              <button className="tl-year-head" onClick={() => toggle(y.year)} aria-expanded={isOpen}>
                <Chevron open={isOpen} />
                <span className="tl-year-num">{y.year}</span>
                <span className="tl-year-count">{y.items.length} {y.items.length === 1 ? "item" : "itens"}</span>
                {docs > 0 && <span className="tl-year-docs">{docs} com doc.</span>}
              </button>
              {isOpen && (
                <ul className="tl-list">
                  {y.items.map((it) => (
                    <li key={it.id} className="tl-item">
                      <div className="tl-item-body">
                        <p className="tl-item-title">{it.title}</p>
                        <p className="tl-item-meta">
                          <span className="tl-kind">{it.kind}</span>
                          {it.natureza && <span className="tl-nat"> · {it.natureza}</span>}
                          {it.lattes && <span className="tl-lattes">Lattes</span>}
                        </p>
                      </div>
                      <div className="tl-item-tags">
                        <span className={`cv2-seal cv2-seal-${it.sealTone}`}>{it.sealLabel}</span>
                        {it.docId && <a className="cv2-doclink" href={`/api/documentos/${it.docId}`} target="_blank" rel="noopener noreferrer">Comprovante</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
