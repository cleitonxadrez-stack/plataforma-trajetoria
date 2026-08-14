"use client";

// src/components/CurriculoView.tsx
// Visualização MODERNA e interativa do currículo (experiência de plataforma).
// A versão A4/impressa é controlada por @media print em globals.css.

import { useMemo, useState } from "react";

export interface CvViewItem {
  id: string; year: number | null; title: string; natureza: string | null;
  sealLabel: string; sealTone: string; docId: string | null; isPublication: boolean;
}
export interface CvViewSection { key: string; label: string; items: CvViewItem[] }
export interface CvProfile {
  name: string; title: string; location: string | null; citation: string | null;
  lattes: string | null; orcid: string | null; email: string | null; institution: string | null;
  areas: string[]; languages: { lang: string; detail: string }[];
  birth: string | null; phone: string | null; address: string | null;
}
export interface CvStats { total: number; comprovados: number; anos: number; formacoes: number }

function Icon({ name }: { name: string }) {
  const p: Record<string, string> = {
    search: "M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
    download: "M12 3v10m0 0 4-4m-4 4-4-4M5 21h14",
    copy: "M9 9V5h11v11h-4M4 9h11v11H4z",
    check: "M20 6 9 17l-5-5",
    external: "M14 3h7v7m0-7L10 14M5 5v14h14v-6",
    doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  };
  const stroke = ["download", "check", "external", "doc"].includes(name);
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill={stroke ? "none" : "currentColor"} stroke={stroke ? "currentColor" : "none"}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={p[name]} />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

export function CurriculoView({ profile, sections, stats }: { profile: CvProfile; sections: CvViewSection[]; stats: CvStats }) {
  const [q, setQ] = useState("");
  const [onlyProven, setOnlyProven] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => {
          if (onlyProven && it.sealTone !== "comprovado" && it.sealTone !== "validado") return false;
          if (!nq) return true;
          return (it.title + " " + (it.natureza ?? "")).toLowerCase().includes(nq);
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, q, onlyProven]);

  async function copyProfile() {
    const lines = [
      profile.name,
      profile.title,
      profile.location,
      profile.citation && `Citações: ${profile.citation}`,
      profile.lattes && `Lattes: ${profile.lattes}`,
      profile.orcid && `ORCID: ${profile.orcid}`,
      profile.email && `E-mail: ${profile.email}`,
      profile.institution && `Instituição: ${profile.institution}`,
      profile.areas.length ? `Áreas: ${profile.areas.join("; ")}` : null,
      profile.languages.length ? `Idiomas: ${profile.languages.map((l) => l.lang).join(", ")}` : null,
    ].filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  }

  function goto(key: string) {
    document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="cv2">
      {/* ── Cartão de perfil ─────────────────────────────── */}
      <section className="cv2-profile">
        <div className="cv2-avatar" aria-hidden="true">{initials(profile.name)}</div>
        <div className="cv2-profile-main">
          <h1 className="cv2-name">{profile.name}</h1>
          <p className="cv2-title">{profile.title}</p>
          {profile.location && <p className="cv2-loc">{profile.location}</p>}
          <div className="cv2-links">
            {profile.institution && <span className="cv2-chip">{profile.institution}</span>}
            {profile.lattes && <a className="cv2-chip" href={`http://lattes.cnpq.br/${profile.lattes}`} target="_blank" rel="noopener noreferrer">Lattes <Icon name="external" /></a>}
            {profile.orcid && <a className="cv2-chip" href={profile.orcid.startsWith("http") ? profile.orcid : `https://orcid.org/${profile.orcid}`} target="_blank" rel="noopener noreferrer">ORCID <Icon name="external" /></a>}
            {profile.email && <a className="cv2-chip" href={`mailto:${profile.email}`}>{profile.email}</a>}
          </div>
          {profile.areas.length > 0 && (
            <p className="cv2-meta"><b>Áreas:</b> {profile.areas.join(" · ")}</p>
          )}
          {profile.languages.length > 0 && (
            <p className="cv2-meta"><b>Idiomas:</b> {profile.languages.map((l) => l.lang).join(", ")}</p>
          )}
        </div>
        <div className="cv2-profile-actions no-print">
          <button className="cv2-btn cv2-btn-ghost" onClick={copyProfile}>
            {copied ? <><Icon name="check" /> Copiado</> : <><Icon name="copy" /> Copiar dados</>}
          </button>
        </div>
      </section>

      {/* ── Faixa de resumo ──────────────────────────────── */}
      <section className="cv2-stats">
        <div><span className="cv2-stat-n">{stats.total}</span><span className="cv2-stat-l">registros</span></div>
        <div><span className="cv2-stat-n cv2-green">{stats.comprovados}</span><span className="cv2-stat-l">comprovados</span></div>
        <div><span className="cv2-stat-n">{stats.anos}</span><span className="cv2-stat-l">anos de trajetória</span></div>
        <div><span className="cv2-stat-n">{stats.formacoes}</span><span className="cv2-stat-l">formações</span></div>
        <div className="cv2-stat-bar">
          <div className="cv2-stat-bar-track"><div className="cv2-stat-bar-fill" style={{ width: `${stats.total ? Math.round((stats.comprovados / stats.total) * 100) : 0}%` }} /></div>
          <span className="cv2-stat-l">{stats.total ? Math.round((stats.comprovados / stats.total) * 100) : 0}% documentado</span>
        </div>
      </section>

      {/* ── Barra de ferramentas ─────────────────────────── */}
      <div className="cv2-toolbar no-print">
        <div className="cv2-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar na trajetória…" aria-label="Pesquisar" />
        </div>
        <label className="cv2-toggle">
          <input type="checkbox" checked={onlyProven} onChange={(e) => setOnlyProven(e.target.checked)} />
          Só comprovados
        </label>
      </div>

      {/* ── Corpo: navegação + seções ────────────────────── */}
      <div className="cv2-body">
        <nav className="cv2-nav no-print" aria-label="Seções">
          {filtered.map((s) => (
            <button key={s.key} className="cv2-nav-item" onClick={() => goto(s.key)}>
              {s.label} <span className="cv2-nav-count">{s.items.length}</span>
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
              </header>
              <ul className="cv2-timeline">
                {s.items.map((it) => (
                  <li key={it.id} className="cv2-tl-item">
                    <span className="cv2-tl-year">{it.year || "—"}</span>
                    <div className="cv2-tl-body">
                      <p className="cv2-tl-title">{it.title}</p>
                      {it.natureza && <p className="cv2-tl-nat">{it.natureza}</p>}
                      <div className="cv2-tl-tags">
                        <span className={`cv2-seal cv2-seal-${it.sealTone}`}>{it.sealLabel}</span>
                        {it.isPublication && <span className="cv2-seal cv2-seal-publicacao">Publicação</span>}
                        {it.docId && (
                          <a className="cv2-doclink" href={`/api/documentos/${it.docId}`} target="_blank" rel="noopener noreferrer">
                            <Icon name="download" /> Comprovante
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
