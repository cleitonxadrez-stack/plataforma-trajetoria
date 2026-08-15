"use client";

// src/components/CurriculoView.tsx
// Visualização MODERNA e interativa do currículo (experiência de plataforma).
// Impressão/A4 controlada por @media print em globals.css (com capa).

import { useMemo, useState } from "react";

export interface CvViewItem {
  id: string; year: number | null; title: string; natureza: string | null;
  sealLabel: string; sealTone: string; docId: string | null; isPublication: boolean;
}
export interface CvViewSection { key: string; label: string; documented: number; items: CvViewItem[] }
export interface CvProfile {
  name: string; firstName: string; treatment: string; role: string | null; title: string; location: string | null;
  citation: string | null; lattes: string | null; orcid: string | null; email: string | null;
  emailProf: string | null; website: string | null; linkedin: string | null; instagram: string | null;
  institution: string | null; areas: string[]; languages: { lang: string; detail: string }[];
  photoUrl: string | null; birth: string | null; phone: string | null; address: string | null;
}
export interface CvStats { total: number; comprovados: number; anos: number; formacoes: number }

function Icon({ name }: { name: string }) {
  const p: Record<string, string> = {
    search: "M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
    download: "M12 3v10m0 0 4-4m-4 4-4-4M5 21h14",
    copy: "M9 9V5h11v11h-4M4 9h11v11H4z",
    check: "M20 6 9 17l-5-5",
    external: "M14 3h7v7m0-7L10 14M5 5v14h14v-6",
    pdf: "M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 16h6",
    select: "M4 6h16M4 12h16M4 18h10",
  };
  const stroke = ["download", "check", "external", "pdf", "select"].includes(name);
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill={stroke ? "none" : "currentColor"} stroke={stroke ? "currentColor" : "none"}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p[name]} /></svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function CurriculoView({ profile, sections, stats }: { profile: CvProfile; sections: CvViewSection[]; stats: CvStats }) {
  const [q, setQ] = useState("");
  const [onlyProven, setOnlyProven] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pct = stats.total ? Math.round((stats.comprovados / stats.total) * 100) : 0;

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return sections
      .map((s) => ({ ...s, items: s.items.filter((it) => {
        if (onlyProven && it.sealTone !== "comprovado" && it.sealTone !== "validado") return false;
        if (!nq) return true;
        return (it.title + " " + (it.natureza ?? "")).toLowerCase().includes(nq);
      }) }))
      .filter((s) => s.items.length > 0);
  }, [sections, q, onlyProven]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function exportAll() { document.body.classList.remove("print-selected-only"); window.print(); }
  function exportSelected() {
    if (!selected.size) return;
    document.body.classList.add("print-selected-only");
    window.print();
    setTimeout(() => document.body.classList.remove("print-selected-only"), 500);
  }

  async function copyProfile() {
    const lines = [profile.name, profile.title, profile.role, profile.location,
      profile.citation && `Citações: ${profile.citation}`, profile.lattes && `Lattes: ${profile.lattes}`,
      profile.orcid && `ORCID: ${profile.orcid}`, profile.website && `Site: ${profile.website}`,
      profile.email && `E-mail: ${profile.email}`, profile.emailProf && `E-mail profissional: ${profile.emailProf}`,
      profile.linkedin && `LinkedIn: ${profile.linkedin}`,
      profile.institution && `Instituição: ${profile.institution}`,
      profile.areas.length ? `Áreas: ${profile.areas.join("; ")}` : null,
    ].filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  }
  const goto = (key: string) => document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={`cv2 ${selectMode ? "cv2-selmode" : ""}`}>
      {/* Capa (só impressão) */}
      <div className="cv2-cover"><div>
        <p className="cv2-cover-kicker">Currículo acadêmico</p>
        <h1 className="cv2-cover-name">{profile.name}</h1>
        <p className="cv2-cover-title">{profile.title}</p>
        {profile.location && <p className="cv2-cover-loc">{profile.location}</p>}
        <p className="cv2-cover-foot">Trajetória360 · {stats.total} registros · {stats.comprovados} comprovados</p>
      </div></div>

      {/* Boas-vindas */}
      <div className="cv2-welcome no-print">
        Seja bem-vindo, <b>{profile.treatment ? `${profile.treatment} ` : ""}{profile.firstName}</b>! Vamos atualizar e organizar seu currículo?
      </div>

      {/* Perfil */}
      <section className="cv2-profile">
        {profile.photoUrl
          ? <img className="cv2-avatar cv2-avatar-img" src={profile.photoUrl} alt={profile.name} />
          : <div className="cv2-avatar" aria-hidden="true">{initials(profile.name)}</div>}
        <div className="cv2-profile-main">
          <h1 className="cv2-name">{profile.name}</h1>
          <p className="cv2-title">{profile.title}</p>
          {profile.role && <p className="cv2-role">{profile.role}</p>}
          {profile.location && <p className="cv2-loc">{profile.location}</p>}
          <div className="cv2-links">
            {profile.institution && <span className="cv2-chip">{profile.institution}</span>}
            {profile.lattes && <a className="cv2-chip" href={`http://lattes.cnpq.br/${profile.lattes}`} target="_blank" rel="noopener noreferrer">Lattes <Icon name="external" /></a>}
            {profile.orcid && <a className="cv2-chip" href={profile.orcid.startsWith("http") ? profile.orcid : `https://orcid.org/${profile.orcid}`} target="_blank" rel="noopener noreferrer">ORCID <Icon name="external" /></a>}
            {profile.website && <a className="cv2-chip" href={profile.website} target="_blank" rel="noopener noreferrer">Site <Icon name="external" /></a>}
            {profile.linkedin && <a className="cv2-chip" href={profile.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn <Icon name="external" /></a>}
            {profile.instagram && <a className="cv2-chip" href={profile.instagram} target="_blank" rel="noopener noreferrer">Instagram <Icon name="external" /></a>}
            {profile.email && <a className="cv2-chip" href={`mailto:${profile.email}`}>{profile.email}</a>}
            {profile.emailProf && <a className="cv2-chip" href={`mailto:${profile.emailProf}`}>{profile.emailProf}</a>}
          </div>
          {profile.areas.length > 0 && <p className="cv2-meta"><b>Áreas:</b> {profile.areas.join(" · ")}</p>}
          {profile.languages.length > 0 && <p className="cv2-meta"><b>Idiomas:</b> {profile.languages.map((l) => l.lang).join(", ")}</p>}
        </div>
        <div className="cv2-profile-actions no-print">
          <button className="cv2-btn cv2-btn-ghost" onClick={copyProfile}>
            {copied ? <><Icon name="check" /> Copiado</> : <><Icon name="copy" /> Copiar dados</>}
          </button>
        </div>
      </section>

      {/* Resumo em dois blocos */}
      <div className="cv2-summary">
        <section className="cv2-panel">
          <p className="cv2-panel-title">Registros atuais</p>
          <div className="cv2-stats">
            <div><span className="cv2-stat-n">{stats.total}</span><span className="cv2-stat-l">registros</span></div>
            <div><span className="cv2-stat-n cv2-green">{stats.comprovados}</span><span className="cv2-stat-l">comprovados</span></div>
            <div><span className="cv2-stat-n">{stats.anos}</span><span className="cv2-stat-l">anos de trajetória</span></div>
            <div><span className="cv2-stat-n">{stats.formacoes}</span><span className="cv2-stat-l">formações</span></div>
          </div>
        </section>
        <section className="cv2-panel">
          <p className="cv2-panel-title">Nível de registro</p>
          <p className="cv2-level-pct">{pct}%<span> documentado</span></p>
          <div className="cv2-stat-bar-track"><div className="cv2-stat-bar-fill" style={{ width: `${pct}%` }} /></div>
          <p className="cv2-level-sub">{stats.comprovados} de {stats.total} registros com comprovante</p>
        </section>
      </div>

      {/* Barra de ferramentas */}
      <div className="cv2-toolbar no-print">
        <div className="cv2-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar na trajetória…" aria-label="Pesquisar" />
        </div>
        <label className="cv2-toggle"><input type="checkbox" checked={onlyProven} onChange={(e) => setOnlyProven(e.target.checked)} /> Só comprovados</label>
        <button className="cv2-btn cv2-btn-primary" onClick={exportAll}><Icon name="pdf" /> Exportar PDF</button>
        <button className={`cv2-btn ${selectMode ? "cv2-btn-primary" : "cv2-btn-ghost"}`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
          <Icon name="select" /> {selectMode ? "Cancelar seleção" : "Selecionar"}
        </button>
        {selectMode && (
          <button className="cv2-btn cv2-btn-green" disabled={!selected.size} onClick={exportSelected}>
            <Icon name="download" /> Exportar selecionados ({selected.size})
          </button>
        )}
      </div>

      {/* Corpo */}
      <div className="cv2-body">
        <nav className="cv2-nav no-print" aria-label="Seções">
          <div className="cv2-nav-head"><span>Seção</span><span>total</span><span>com doc.</span></div>
          {filtered.map((s) => (
            <button key={s.key} className="cv2-nav-item" onClick={() => goto(s.key)}>
              <span className="cv2-nav-label">{s.label}</span>
              <span className="cv2-nav-count">{s.items.length}</span>
              <span className="cv2-nav-count cv2-nav-count-green">{s.documented}</span>
            </button>
          ))}
        </nav>

        <main className="cv2-sections">
          {filtered.length === 0 && <p className="cv2-empty">Nenhum registro encontrado para “{q}”.</p>}
          {filtered.map((s) => (
            <section key={s.key} id={`sec-${s.key}`} className="cv2-card">
              <header className="cv2-card-head">
                <h2>{s.label}</h2>
                <span className="cv2-card-count">{s.items.length}</span>
                <span className="cv2-card-count cv2-card-count-green">{s.documented} com doc.</span>
              </header>
              <ul className="cv2-timeline">
                {s.items.map((it) => (
                  <li key={it.id} className={`cv2-tl-item ${selectMode && !selected.has(it.id) ? "unselected" : ""} ${selected.has(it.id) ? "is-selected" : ""}`}>
                    {selectMode && (
                      <input className="cv2-tl-check no-print" type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} aria-label="Selecionar" />
                    )}
                    <span className="cv2-tl-year">{it.year || "—"}</span>
                    <div className="cv2-tl-body">
                      <p className="cv2-tl-title">{it.title}</p>
                      {it.natureza && <p className="cv2-tl-nat">{it.natureza}</p>}
                      <div className="cv2-tl-tags">
                        <span className={`cv2-seal cv2-seal-${it.sealTone}`}>{it.sealLabel}</span>
                        {it.isPublication && <span className="cv2-seal cv2-seal-publicacao">Publicação</span>}
                        {it.docId && <a className="cv2-doclink" href={`/api/documentos/${it.docId}`} target="_blank" rel="noopener noreferrer"><Icon name="download" /> Comprovante</a>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* Aviso: atualizar no Lattes */}
          <p className="cv2-lattes-nudge no-print">
            Alguns comprovantes que você anexou aqui podem ainda não estar no seu Lattes.
            Ao adicionar um novo documento, lembre de <b>atualizar também no Lattes</b> para manter os dois em sincronia.
          </p>
        </main>
      </div>
    </div>
  );
}
