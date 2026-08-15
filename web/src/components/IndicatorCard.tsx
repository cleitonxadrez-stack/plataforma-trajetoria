// src/components/IndicatorCard.tsx
// Bloco 5 — Card premium para UM indicador pessoal.
//
// Layout: chip de ícone à esquerda, corpo (label / número serifado / legenda)
// à direita e barra de progresso opcional no rodapé. Suporta estado
// "desconhecido" via `placeholder` e tom de destaque.

export interface IndicatorCardProps {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  /** Mensagem exibida quando o indicador não pode ser calculado ainda. */
  placeholder?: string;
  /** Texto auxiliar curto (ex.: "+ 2 anos reais") */
  hint?: string;
  /** Cor de destaque — padrão azul, opções: positive/warning/alert. */
  tone?: "default" | "positive" | "warning" | "alert";
  /** Caminho(s) SVG do ícone (24x24, stroke). */
  icon?: string;
  /** Preenchimento da barra de progresso (0–1). Oculta a barra se ausente. */
  progress?: number;
}

export function IndicatorCard(props: IndicatorCardProps) {
  const tone = props.tone ?? "default";
  const pct = typeof props.progress === "number"
    ? Math.round(Math.max(0, Math.min(1, props.progress)) * 100)
    : null;
  return (
    <div
      className={`ind-card ind-card-${tone}`}
      data-testid={`indicator-${props.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="ind-card-main">
        {props.icon && (
          <span className="ind-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={props.icon} /></svg>
          </span>
        )}
        <div className="ind-card-body">
          <p className="ind-card-label">{props.label}</p>
          {props.placeholder ? (
            <p className="ind-card-value ind-card-placeholder serif">{props.placeholder}</p>
          ) : (
            <p className="ind-card-value serif">
              {props.value}
              {props.unit && <span className="ind-card-unit">{props.unit}</span>}
            </p>
          )}
          {props.caption && !props.placeholder && (
            <p className="ind-card-caption">{props.caption}</p>
          )}
          {props.hint && <p className="ind-card-hint">{props.hint}</p>}
        </div>
      </div>

      {pct !== null && (
        <div className="ind-card-bar" role="presentation">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
