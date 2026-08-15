// src/components/RecoveryLetterPreview.tsx
// Componente que renderiza a carta pronta para copiar (Bloco 6).
// Tom sóbrio (CLAUDE.md) — sem emoji, sépia, bloco pré-formatado com
// botão "Copiar texto integral" usando Clipboard API.

"use client";

import { useState } from "react";
import type { LetterDraft } from "@/lib/domain/recovery";

export interface RecoveryLetterPreviewProps {
  letter: LetterDraft;
  /** Handler chamado quando o usuário clica em "Marcar como enviada". */
  onMarkSent?: (channelUsed: string) => void | Promise<void>;
}

export function RecoveryLetterPreview({ letter, onMarkSent }: RecoveryLetterPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(letter.body); } catch { /* fallback silencioso */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function markSent() {
    if (!onMarkSent) return;
    await onMarkSent(letter.preferredChannel);
    setSent(true);
  }

  return (
    <article
      className="card"
      data-testid={`letter-${letter.institutionName.replace(/\W+/g, "-").toLowerCase()}`}
      style={{ marginBottom: 16 }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">Destinatário</p>
          <h3 className="serif text-xl text-[#0B2341] leading-snug">{letter.institutionName}</h3>
          <p className="text-xs text-stone-500 mt-1">
            {letter.itemCount} {letter.itemCount === 1 ? "item" : "itens"} agrupados ·
            canal: <code style={{ fontFamily: "monospace" }}>{letter.preferredChannel}</code>
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span title={`Consentimento ${letter.consentTextVersion}`} style={{
            padding: "3px 9px", fontSize: 11, letterSpacing: ".06em",
            textTransform: "uppercase", background: "#e2ecf7",
            color: "#4a5266", borderRadius: 999,
          }}>
            Termo {letter.consentTextVersion}
          </span>
          <span className="text-xs text-stone-500">
            gerada em {new Date(letter.generatedAt).toLocaleString("pt-BR")}
          </span>
        </div>
      </header>

      <textarea
        data-testid="letter-body"
        readOnly
        value={letter.body}
        rows={Math.min(20, letter.body.split("\n").length + 1)}
        style={{
          width: "100%",
          fontFamily: '"Source Serif 4", Georgia, serif',
          fontSize: 13,
          background: "#EAF2FF",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: 14,
          marginTop: 14,
          color: "#1a1f2c",
          whiteSpace: "pre-wrap",
          lineHeight: 1.55,
          resize: "vertical",
        }}
      />

      <footer style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="btn-primary"
          data-testid="letter-copy"
          onClick={copy}
          style={{ fontSize: 13, padding: "6px 12px" }}
        >
          {copied ? "Copiado" : "Copiar texto integral"}
        </button>
        {onMarkSent && (
          <button
            type="button"
            className="btn-secondary"
            data-testid="letter-mark-sent"
            disabled={sent}
            onClick={markSent}
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            {sent ? "Marcada como enviada" : "Marcar como enviada"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {letter.channelAddress && (
          <a
            href={`mailto:${letter.channelAddress}?subject=${encodeURIComponent(
              "Solicitação de documentos comprobatórios — " + letter.institutionName
            )}`}
            className="text-xs underline"
            style={{ color: "#1F5EFF" }}
          >
            ou abrir e-mail pré-preenchido →
          </a>
        )}
      </footer>

      <p className="text-xs text-stone-500 mt-4">
        ⚠ Esta carta é gerada pelo sistema. Você deve revisar e enviar
        manualmente pelo canal <code>{letter.preferredChannel}</code>. O sistema
        não dispara e-mail direto — você decide quando e como enviar.
      </p>
    </article>
  );
}
