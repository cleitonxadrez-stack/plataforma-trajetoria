// src/components/DocumentCard.tsx
// Card usado no painel do cofre — exibe documento com selo, ação rápida
// e indicador de "IA foi usada" (honestidade ao usuário, CLAUDE.md).

import Link from "next/link";
import type { DocQueueView } from "@/lib/domain/document-queue";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

export interface DocumentCardProps {
  doc: DocQueueView;
  registryCode: string;
  filename: string;
  suggestedTitle: string | null;
  confidence: number | null;
  sourceLabel: string;        // ex: "Passos: 1, 2, 3 → Crossref"
}

export function DocumentCard(props: DocumentCardProps) {
  const { doc, registryCode, filename, suggestedTitle, confidence, sourceLabel } = props;
  const auditCount = doc.audit.length;
  const confPct = confidence != null ? Math.round(confidence * 100) : null;
  const lowConf  = confidence != null && confidence < 0.80;

  return (
    <article
      className="card"
      data-testid={`doc-card-${doc.documentId}`}
      style={{ marginBottom: 12 }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1"
             style={{ fontFamily: "monospace" }}>{registryCode}</p>
          <h3 className="serif text-[20px] text-[#0f2942] leading-snug"
              style={{ wordBreak: "break-word" }}>
            {suggestedTitle ?? filename}
          </h3>
          <p className="text-xs text-stone-500 mt-1" title={filename}>
            {filename.length > 70 ? filename.slice(0, 70) + "…" : filename}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <DocumentStatusBadge state={doc.state} />
          {confPct != null && (
            <span
              title={`Confiança da extração (${lowConf ? "BAIXA — revise com atenção" : "OK"})`}
              style={{
                fontSize: 11, letterSpacing: ".06em", padding: "2px 7px",
                background: lowConf ? "#f3dfda" : "#e9e6dd",
                color:      lowConf ? "#8a2a1f" : "#4a5266",
                borderRadius: 6,
              }}
            >
              {confPct}% confiança
            </span>
          )}
          {doc.riskFlags.usedAI && (
            <span
              title="Passo 6 — IA foi acionada. Sua confirmação é obrigatória."
              style={{
                fontSize: 10, letterSpacing: ".08em", padding: "2px 7px",
                background: "#f3e3cd", color: "#a15a13",
                borderRadius: 6, textTransform: "uppercase",
              }}
            >
              via IA — confirme
            </span>
          )}
        </div>
      </header>

      <footer
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#7a8294" }}>
          <span>{sourceLabel}</span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>{auditCount} {auditCount === 1 ? "evento" : "eventos"} no histórico</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href={`/documentos/${doc.documentId}`}
            className="btn-secondary"
            style={{ fontSize: 13, padding: "6px 10px" }}
          >
            Abrir
          </Link>
          {(doc.state === "PENDENTE" || doc.state === "EM_REVISAO") && (
            <Link
              href={`/documentos/revisar?doc=${doc.documentId}`}
              className="btn-primary"
              style={{ fontSize: 13, padding: "6px 10px" }}
            >
              Revisar
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
