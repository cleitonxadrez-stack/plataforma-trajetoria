// src/components/IndicatorCard.tsx
// Bloco 5 — Card visual premium para UM indicador pessoal.
//
// Layout premium: chip de ícone + label, número serifado grande, legenda e
// dica. Suporta estado "desconhecido" via `placeholder` e tom de destaque.

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
}

export function IndicatorCard(props: IndicatorCardProps) {
  const tone = props.tone ?? "default";
  return (
    <div
      className={`ind-card ind-card-${tone}`}
      data-testid={`indicator-${props.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="ind-card-head">
        {props.icon && (
          <span className="ind-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={props.icon} /></svg>
          </span>
        )}
        <p className="ind-card-label">{props.label}</p>
      </div>

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
  );
}
