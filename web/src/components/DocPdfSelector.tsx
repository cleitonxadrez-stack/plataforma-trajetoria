"use client";

// src/components/DocPdfSelector.tsx
// Seleção de documentos para gerar o PDF único, AGRUPADOS POR ÁREA (Formação,
// Artigos, Certificados…). Marque só o que quer; "Gerar PDF" abre
// /api/curriculo/documentos?ids=... apenas com os escolhidos.

import { useMemo, useState } from "react";

export interface SelDoc { id: string; code: string; filename: string; date: string | null }
export interface DocGroup { key: string; label: string; docs: SelDoc[] }

export function DocPdfSelector({ groups }: { groups: DocGroup[] }) {
  const allDocs = useMemo(() => groups.flatMap((g) => g.docs), [groups]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(allDocs.map((d) => d.id)));
  const [q, setQ] = useState("");

  const nq = q.trim().toLowerCase();
  const view = useMemo(
    () => groups
      .map((g) => ({ ...g, docs: nq ? g.docs.filter((d) => `${d.code} ${d.filename}`.toLowerCase().includes(nq)) : g.docs }))
      .filter((g) => g.docs.length),
    [groups, nq],
  );

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setMany(ids: string[], on: boolean) {
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  }
  const groupOn = (g: DocGroup) => g.docs.length > 0 && g.docs.every((d) => sel.has(d.id));
  const groupCount = (g: DocGroup) => g.docs.filter((d) => sel.has(d.id)).length;

  function gerar() {
    if (sel.size === 0) return;
    const ids = allDocs.filter((d) => sel.has(d.id)).map((d) => d.id).join(",");
    window.open(`/api/curriculo/documentos?ids=${encodeURIComponent(ids)}`, "_blank", "noopener");
  }

  return (
    <div className="dps">
      <div className="dps-bar">
        <label className="cofre-search dps-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar documentos…" />
        </label>
        <button className="tl-link" onClick={() => setSel(new Set(allDocs.map((d) => d.id)))} type="button">Marcar todos</button>
        <button className="tl-link" onClick={() => setSel(new Set())} type="button">Limpar</button>
        <span className="dps-count">{sel.size} de {allDocs.length} selecionado{sel.size === 1 ? "" : "s"}</span>
        <button className="btn-primary dps-gen" onClick={gerar} disabled={sel.size === 0} type="button">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>
          Gerar PDF ({sel.size})
        </button>
      </div>

      {view.length === 0 && <p className="tl-empty">Nenhum documento encontrado.</p>}

      {view.map((g) => (
        <section key={g.key} className="dps-group">
          <div className="dps-group-head">
            <label className="dps-group-check">
              <input type="checkbox" checked={groupOn(g)} onChange={() => setMany(g.docs.map((d) => d.id), !groupOn(g))} />
              <span className="serif dps-group-label">{g.label}</span>
            </label>
            <span className="dps-group-n">{groupCount(g)}/{g.docs.length}</span>
          </div>
          <ul className="dps-list">
            {g.docs.map((d) => (
              <li key={d.id}>
                <label className={`dps-row ${sel.has(d.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="dps-file" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B4413C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
                  </span>
                  <span className="dps-info">
                    <span className="dps-code">{d.code}</span>
                    <span className="dps-name">{d.filename}{d.date ? ` · ${d.date}` : ""}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
