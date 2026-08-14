"use client";

import { useState } from "react";

// Bloco de dados com UM botão que copia a seção INTEIRA (label: valor por linha).
export function CopyBlock({ title, fields }: { title: string; fields: { label: string; value: string | null | undefined }[] }) {
  const rows = fields.filter((f) => f.value);
  const [copied, setCopied] = useState(false);
  if (!rows.length) return null;

  async function copy() {
    const text = rows.map((f) => `${f.label}: ${f.value}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  }

  return (
    <section className="pd-block">
      <header className="pd-block-head">
        <h2>{title}</h2>
        <button type="button" className="pd-copy" onClick={copy}>{copied ? "✓ Copiado" : "Copiar bloco"}</button>
      </header>
      <div>
        {rows.map((f) => (
          <div key={f.label} className="pd-row">
            <span className="pd-label">{f.label}</span>
            <span className="pd-value">{f.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
