// src/components/TrajectoryChart.tsx
// Gráfico de barras: VOLUME DE PRODUÇÃO por ano (nº de itens registrados a
// cada ano). SVG puro (server component, sem libs).

export interface ChartPoint { label: string; value: number }

function niceMax(m: number): number {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

export function TrajectoryChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return <p className="pnl-chart-empty">Sem itens datados para exibir o volume ainda.</p>;
  }
  const W = 860, H = 300, padL = 40, padR = 16, padT = 14, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const n = points.length;
  const band = innerW / n;
  const bw = Math.min(34, band * 0.6);
  const x = (i: number) => padL + band * i + band / 2;
  const y = (v: number) => padT + innerH - (innerH * v) / maxV;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  const showEvery = Math.max(1, Math.ceil(n / 10));

  return (
    <svg className="pnl-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Volume de produção por ano">
      <defs>
        <linearGradient id="pnlBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B75FF" />
          <stop offset="100%" stopColor="#1F5EFF" />
        </linearGradient>
      </defs>

      {/* grades + rótulos Y */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#EDF1F7" strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="pnl-chart-axis">{t}</text>
        </g>
      ))}

      {/* barras */}
      {points.map((p, i) => {
        const h = Math.max(p.value > 0 ? 2 : 0, y(0) - y(p.value));
        return <rect key={i} x={x(i) - bw / 2} y={y(p.value)} width={bw} height={h} rx="3" fill="url(#pnlBar)" />;
      })}

      {/* rótulos X */}
      {points.map((p, i) => (i % showEvery === 0 || i === n - 1) ? (
        <text key={`x${i}`} x={x(i)} y={H - 12} textAnchor="middle" className="pnl-chart-axis">{p.label}</text>
      ) : null)}
    </svg>
  );
}
