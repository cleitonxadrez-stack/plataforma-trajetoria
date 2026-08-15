"use client";

// src/components/DadosVault.tsx
// Blocos de dados pessoais com: copiar por bloco (individual) E modo de
// seleção para copiar/exportar vários blocos de uma vez.

import { useState } from "react";

export interface VaultBlock { key: string; title: string; fields: { label: string; value: string }[] }

function blockText(b: VaultBlock): string {
  return `${b.title}\n` + b.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
}

export function DadosVault({ blocks }: { blocks: VaultBlock[] }) {
  const has = blocks.filter((b) => b.fields.length > 0);
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1600); } catch { /* noop */ }
  }
  function toggle(k: string) { setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  const selected = has.filter((b) => sel.has(b.key));

  function exportSelected() {
    document.body.classList.add("print-vault");
    has.forEach((b) => document.getElementById(`pdb-${b.key}`)?.classList.toggle("vault-print", sel.has(b.key)));
    window.print();
    setTimeout(() => document.body.classList.remove("print-vault"), 500);
  }

  return (
    <div>
      <div className="pd-vault-bar no-print">
        <button className={`pd-copy ${selMode ? "pd-copy-active" : ""}`} onClick={() => { setSelMode(!selMode); setSel(new Set()); }}>
          {selMode ? "Cancelar seleção" : "Selecionar blocos"}
        </button>
        {selMode && (
          <>
            <button className="pd-copy" onClick={() => setSel(new Set(sel.size === has.length ? [] : has.map((b) => b.key)))}>
              {sel.size === has.length ? "Limpar" : "Selecionar tudo"}
            </button>
            <button className="cv2-btn cv2-btn-green" disabled={!sel.size}
              onClick={() => copy(selected.map(blockText).join("\n\n"), "__sel__")}>
              {copied === "__sel__" ? "✓ Copiado" : `Copiar selecionados (${sel.size})`}
            </button>
            <button className="cv2-btn cv2-btn-primary" disabled={!sel.size} onClick={exportSelected}>
              Exportar PDF ({sel.size})
            </button>
          </>
        )}
      </div>

      <div className="space-y-4">
        {has.map((b) => (
          <section key={b.key} id={`pdb-${b.key}`} className={`pd-block ${sel.has(b.key) ? "pd-block-sel" : ""}`}>
            <header className="pd-block-head">
              <div className="pd-block-title">
                {selMode && <input className="pd-block-check no-print" type="checkbox" checked={sel.has(b.key)} onChange={() => toggle(b.key)} aria-label={`Selecionar ${b.title}`} />}
                <h2>{b.title}</h2>
              </div>
              <button className="pd-copy no-print" onClick={() => copy(blockText(b), b.key)}>
                {copied === b.key ? "✓ Copiado" : "Copiar bloco"}
              </button>
            </header>
            <div>
              {b.fields.map((f) => (
                <div key={f.label} className="pd-row">
                  <span className="pd-label">{f.label}</span>
                  <span className="pd-value">{f.value}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
