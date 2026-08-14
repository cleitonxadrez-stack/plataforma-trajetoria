// src/components/Logo.tsx
// Marca da Trajetória360 — SVG inline (nítido em qualquer tamanho, sem asset).
// mark: documento numa órbita azul + selo de verificação (check).
// wordmark: "Trajetória" (navy) + "360" (azul), o 0 final estilizado como
// seta circular (o "360°" da recontagem/atualização).

interface LogoProps {
  /** Altura do mark em px (o texto acompanha). Default 32. */
  size?: number;
  /** Mostra o texto ao lado do mark. Default true. */
  withWordmark?: boolean;
  className?: string;
}

const NAVY = "#102A43";
const BLUE = "#1f9be6";
const TEAL = "#17b0c4";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Trajetória360"
    >
      {/* órbita (elipse inclinada) com ponta de seta */}
      <g transform="rotate(-24 24 24)">
        <ellipse cx="24" cy="24" rx="21.5" ry="12.5" stroke={BLUE} strokeWidth="3.2" fill="none" />
        <path d="M43 20.5l3.2 3.4-4.6 1.2" stroke={BLUE} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      {/* documento */}
      <rect x="15" y="9" width="18" height="23" rx="2.5" fill="#fff" stroke={NAVY} strokeWidth="2.6" />
      <line x1="19" y1="16" x2="29" y2="16" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="20.5" x2="29" y2="20.5" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="25" x2="26" y2="25" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
      {/* selo de verificação */}
      <circle cx="16" cy="34" r="7.5" fill={TEAL} stroke="#fff" strokeWidth="2" />
      <path d="M12.6 34l2.3 2.3 4.2-4.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ size = 32, withWordmark = true, className }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={size} />
      {withWordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: size * 0.62, lineHeight: 1 }}
        >
          <span style={{ color: NAVY }}>Trajetória</span>
          <span style={{ color: BLUE }}>360</span>
        </span>
      )}
    </span>
  );
}
