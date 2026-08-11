// src/components/SeloComprovacao.tsx
// Selo visual de comprovação — usado na tela de Trajetória.
//
// Regra visual (CLAUDE.md §"Não parecer rede social"): sem emojis exagerados,
// sem medalhas. Tom sóbrio — barra horizontal em sépia com etiqueta.
// 4 variantes (backlog §3): OFF / PRATA / OURO.

import type { EvidenceStatus } from "@/lib/domain/items";

export interface SeloProps {
  status: EvidenceStatus;
  className?: string;
}

export function SeloComprovacao({ status, className }: SeloProps) {
  const variant: Record<EvidenceStatus, { label: string; color: string; bg: string }> = {
    SEM_COMPROVANTE:        { label: "Sem comprovante",  color: "#7a8294", bg: "#e9e6dd" },
    COM_COMPROVANTE_PARCIAL:{ label: "Parcial",         color: "#a15a13", bg: "#f3e3cd" },
    COMPROVADO:            { label: "Comprovado",      color: "#0d6b52", bg: "#d9ece4" },
  };
  const v = variant[status];
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        background: v.bg,
        color: v.color,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        borderRadius: 999,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: 999,
          background: v.color,
        }}
      />
      {v.label}
    </span>
  );
}
