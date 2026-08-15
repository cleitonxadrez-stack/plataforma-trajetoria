// src/components/TrajectoryChart.tsx
// Gráfico de área/linha da evolução acumulada da trajetória por ano.
// SVG puro (server component, sem libs). Recebe pontos já acumulados.

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
    return <p className="pnl-chart-empty">Sem itens datados para exibir a evolução ainda.</p>;
  }
  const W = 860, H = 320, padL = 46, padR = 18, padT = 16, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v: number) => padT + innerH - (innerH * v) / maxV;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const areaPts = `${x(0)},${y(0)} ${linePts} ${x(n - 1)},${y(0)}`;
  const showEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <svg className="pnl-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Evolução acumulada da trajetória por ano">
      <defs>
        <linearGradient id="pnlArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1F5EFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1F5EFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grades + rótulos do eixo Y */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#EDF1F7" strokeWidth="1" />
          <text x={padL - 10} y={y(t) + 4} textAnchor="end" className="pnl-chart-axis">{t}</text>
        </g>
      ))}

      {/* área + linha */}
      <polygon points={areaPts} fill="url(#pnlArea)" />
      <polyline points={linePts} fill="none" stroke="#1F5EFF" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* pontos */}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke="#1F5EFF" strokeWidth="2" />
      ))}

      {/* rótulos do eixo X */}
      {points.map((p, i) => (i % showEvery === 0 || i === n - 1) ? (
        <text key={`x${i}`} x={x(i)} y={H - 12} textAnchor="middle" className="pnl-chart-axis">{p.label}</text>
      ) : null)}
    </svg>
  );
}
