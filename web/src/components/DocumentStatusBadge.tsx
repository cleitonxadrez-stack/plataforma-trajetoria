// src/components/DocumentStatusBadge.tsx
// Selo/etiqueta para o estado do documento no cofre.
// Tom sóbrio — sem emoji (CLAUDE.md §"Como deve parecer").

import type { DocQueueState } from "@/lib/domain/document-queue";

const VARIANT: Record<DocQueueState, { label: string; bg: string; fg: string }> = {
  PENDENTE:     { label: "Na fila",         bg: "#dce8f6", fg: "#4a5266" },
  EM_REVISAO:   { label: "Em revisão",      bg: "#f3e3cd", fg: "#a15a13" },
  CONFIRMADO:   { label: "Confirmado",      bg: "#d9ece4", fg: "#15803D" },
  CORRIGIDO:    { label: "Corrigido",       bg: "#e1ecf5", fg: "#2563EB" },
  REJEITADO:    { label: "Descartado",      bg: "#f3dfda", fg: "#8a2a1f" },
  FALHOU:       { label: "Falhou",          bg: "#f3dfda", fg: "#8a2a1f" },
};

export function DocumentStatusBadge({ state, className }: { state: DocQueueState; className?: string }) {
  const v = VARIANT[state];
  return (
    <span
      className={className}
      data-testid={`doc-status-${state}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        background: v.bg, color: v.fg,
        fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
        borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: v.fg }} />
      {v.label}
    </span>
  );
}
