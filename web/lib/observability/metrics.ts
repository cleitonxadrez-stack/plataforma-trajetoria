// lib/observability/metrics.ts
// BLOCO 7 — Métricas em memória. Contadores/histogramas simples.
// Em produção, expostos em Prometheus via OTLP; aqui ficam disponíveis
// p/ o /api/health retornar last values e p/ testes confirmarem o
// formato.

export interface MetricPoint {
  name: string;
  value: number;
  ts: number;        // epoch ms
  tags?: Record<string, string>;
}

const BUCKETS = [10, 25, 50, 100, 200, 400, 800, 1600, 3200]; // ms

class Registry {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private points: MetricPoint[] = [];

  inc(name: string, by = 1, tags?: Record<string, string>) {
    const k = tagKey(name, tags);
    this.counters.set(k, (this.counters.get(k) ?? 0) + by);
    this.points.push({ name, value: by, ts: Date.now(), tags });
    if (this.points.length > 1000) this.points.shift();
  }

  /** Alias async de `inc` — usado por código que prefere `await`. */
  async incremented(name: string, tags?: Record<string, string>): Promise<void> {
    this.inc(name, 1, tags);
  }

  observe(name: string, ms: number, tags?: Record<string, string>) {
    const k = tagKey(name, tags);
    const arr = this.histograms.get(k) ?? [];
    arr.push(ms);
    if (arr.length > 1000) arr.shift();
    this.histograms.set(k, arr);
    this.points.push({ name, value: ms, ts: Date.now(), tags });
    if (this.points.length > 1000) this.points.shift();
  }

  snapshot() {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.counters) {
      out[k] = { type: "counter", value: v };
    }
    for (const [k, samples] of this.histograms) {
      const sorted = [...samples].sort((a, b) => a - b);
      const p = (q: number) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      out[k] = {
        type: "histogram",
        count: sorted.length,
        p50: p(0.5), p90: p(0.9), p99: p(0.99),
        buckets: BucketsToJson(BUCKETS, sorted),
      };
    }
    return out;
  }

  recent(name: string): MetricPoint[] {
    return this.points.filter((p) => p.name === name).slice(-50);
  }
}

function tagKey(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const parts = Object.keys(tags).sort().map((k) => `${k}=${tags[k]}`);
  return `${name}{${parts.join(",")}}`;
}

function BucketsToJson(bs: number[], samples: number[]) {
  return bs.map((b) => ({ le: b, count: samples.filter((s) => s <= b).length }));
}

export const metrics = new Registry();

// ── Padrões conhecidos do projeto ──────────────────────────────
// Os Blocos 1–6 instrumentam aqui; ficam centralizados para o
// /api/health e dashboards não divergirem.

export const Schemas = {
  /** Cascade: tempo por passo da cascata. */
  cascadeStep: "cascade.step.duration.ms",
  /** Cascade: custo R$ do passo 6. */
  cascadeAiCost: "cascade.step.cost.cents",
  /** Recovery: carta gerada. */
  letterGenerated: "letter.generated.count",
  /** Recovery: follow-up disparado. */
  followupSent: "followup.sent.count",
  /** Indicator: recompute por mudança. */
  indicatorRecomputes: "indicator.recompute.count",
  /** HTTP server requests. */
  httpRequest: "http.request.duration.ms",
  /** Falha de qualquer job. */
  jobFailure: "job.failure.count",
  /** Duplicatas detectadas — auto-merge (score >= 0.95). */
  duplicateAutoMerge: "duplicate.auto.merge.count",
  /** Duplicatas detectadas — revisão humana (0.60 <= score < 0.95). */
  duplicateHumanReview: "duplicate.human.review.count",
  /** Cron batch: jobs enfileirados em massa pelo endpoint /api/cron/* . */
  cronBatchEnqueued: "cron.batch.enqueued.count",
} as const;

/** Helper wrapper: instrumenta uma função assíncrona e mede duração. */
export async function measured<T>(
  metric: string,
  tags: Record<string, string> | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try { return await fn(); }
  finally { metrics.observe(metric, Date.now() - start, tags); }
}
