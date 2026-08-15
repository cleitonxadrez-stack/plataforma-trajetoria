// src/components/DocumentStatusBadge.tsx
// Selo/etiqueta para o estado do documento no cofre.
// Tom sóbrio — sem emoji (CLAUDE.md §"Como deve parecer").

import type { DocQueueState } from "@/lib/domain/document-queue";

const VARIANT: Record<DocQueueState, { label: string; bg: string; fg: string }> = {
  PENDENTE:     { label: "Na fila",         bg: "#dce8f6", fg: "#4a5266" },
  EM_REVISAO:   { label: "Em revisão",      bg: "#FCF3E1", fg: "#B7791F" },
  CONFIRMADO:   { label: "Confirmado",      bg: "#E7F7EF", fg: "#168553" },
  CORRIGIDO:    { label: "Corrigido",       bg: "#e1ecf5", fg: "#1F5EFF" },
  REJEITADO:    { label: "Descartado",      bg: "#FBE7E7", fg: "#B4413C" },
  FALHOU:       { label: "Falhou",          bg: "#FBE7E7", fg: "#B4413C" },
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
