"use client";

import { useState } from "react";

// Campo rotulado com botão de copiar — para preencher cadastros rapidamente.
export function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard indisponível — ignora silenciosamente */
    }
  }

  return (
    <div className="copy-field">
      <div className="copy-field-body">
        <span className="copy-field-label">{label}</span>
        <span className="copy-field-value">{value}</span>
      </div>
      <button type="button" className="copy-field-btn" onClick={copy} aria-label={`Copiar ${label}`}>
        {copied ? "✓ Copiado" : "Copiar"}
      </button>
    </div>
  );
}
