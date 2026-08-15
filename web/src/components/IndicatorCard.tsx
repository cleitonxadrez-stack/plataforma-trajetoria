// src/components/IndicatorCard.tsx
// Bloco 5 — Card visual para UM indicador pessoal.
//
// Tom sóbrio (CLAUDE.md §"Como deve parecer") — sépia, serif no título,
// sem emoji. Mostra label, valor principal, sub-métrica e timestamp de
// cálculo. Suporta estado "desconhecido" via `placeholder`.

export interface IndicatorCardProps {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  /** Mensagem exibida quando o indicador não pode ser calculado ainda. */
  placeholder?: string;
  /** Texto auxiliar curto (ex.: "+ 2 anos reais") */
  hint?: string;
  /** Cor de destaque — padrão sépia, opções: positive/warning/alert. */
  tone?: "default" | "positive" | "warning" | "alert";
}

const TONE: Record<NonNullable<IndicatorCardProps["tone"]>, { bg: string; fg: string }> = {
  default:  { bg: "#fff",    fg: "#0B2341" },
  positive: { bg: "#E7F7EF", fg: "#168553" },
  warning:  { bg: "#FCF3E1", fg: "#B7791F" },
  alert:    { bg: "#FBE7E7", fg: "#B4413C" },
};

export function IndicatorCard(props: IndicatorCardProps) {
  const tone = TONE[props.tone ?? "default"];
  return (
    <div
      className="card"
      data-testid={`indicator-${props.label.toLowerCase().replace(/\s+/g, "-")}`}
      style={{ background: tone.bg }}
    >
      <p
        className="text-xs uppercase tracking-[.12em] mb-2"
        style={{ color: "#7a8294" }}
      >
        {props.label}
      </p>
      <p
        className="serif"
        style={{
          fontSize: 38,
          lineHeight: 1.1,
          color: tone.fg,
          fontWeight: 500,
        }}
      >
        {props.placeholder ? (
          <span style={{ color: props.tone === "alert" ? "#B4413C" : "#7a8294" }}>
            {props.placeholder}
          </span>
        ) : (
          <>
            {props.value}
            {props.unit && (
              <span style={{ fontSize: 16, marginLeft: 4, color: "#4a5266" }}>
                {props.unit}
              </span>
            )}
          </>
        )}
      </p>
      {props.caption && !props.placeholder && (
        <p className="text-xs" style={{ color: "#4a5266", marginTop: 6 }}>
          {props.caption}
        </p>
      )}
      {props.hint && (
        <p className="text-xs" style={{ color: "#7a8294", marginTop: 4 }}>
          {props.hint}
        </p>
      )}
    </div>
  );
}
