// lib/queue/job-alert.ts
// BLOCO 7 — Alerting de falhas em jobs. PURO.
//
// Política (CLAUDE.md §Sem mentira):
//   1. ZERO I/O — recebe `eventLog[]` (estrutura simples {ts, name, msg}),
//      aplica thresholds e devolve `AlertPlan`. Sem definir thresholds duplos,
//      sem normalizar timestamps silenciosamente: se a contagem cresce,
//      é porque entrou mais falha.
//   2. Thresholds calibráveis:
//      - ratePerHourCríticaLimite: 2 falhas/h dispara alerta CRITICAL
//      - ratePerHourWarningLimite: 1 falha/h dispara alerta WARNING
//      - sem falhas no final de janela → plano "ok".
//   3. Janela de varredura é o último argumento `windowMinutes` (default 60).
//      Janela maior do que `maxWindowMinutes` → erro tipado (do caller).
//   4. `topFailures[]` lista os jobs que falharam mais vezes na janela,
//      ordenado por `count DESC` (até `topN`).

export type AlertSeverity = "ok" | "warning" | "critical";

export interface FailureEvent {
  /** Epoch ms. O caller injeta este instante. */
  ts: number;
  /** Nome do job (`detect-duplicates`, `recovery-build`, ...). */
  name: string;
  /** Mensagem descritiva (curta). */
  msg: string;
}

export interface AlertConfig {
  /** Default 60 (minutos). Caller decide. */
  windowMinutes?: number;
  /** Default 2/h. */
  criticalThresholdPerHour?: number;
  /** Default 1/h. */
  warningThresholdPerHour?: number;
  /** Default 5. */
  topN?: number;
  /** Default 720 (12 h) — corpo do erro se for maior. */
  maxWindowMinutes?: number;
}

export interface AlertPlan {
  severity: AlertSeverity;
  windowMinutes: number;
  totalFailures: number;
  ratePerHour: number;
  thresholds: { criticalPerHour: number; warningPerHour: number };
  topFailures: Array<{ name: string; count: number }>;
  /** Quando severity != "ok". Lista seca para uso do worker. */
  reasons: string[];
  /** ISO timestamp — injetado em testes. */
  evaluatedAt: string;
}

export class AlertConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AlertConfigError";
  }
}

const DEFAULT_CFG = {
  windowMinutes: 60,
  criticalThresholdPerHour: 2,
  warningThresholdPerHour: 1,
  topN: 5,
  maxWindowMinutes: 720,
};

function resolveCfg(cfg: AlertConfig | undefined): Required<AlertConfig> {
  return {
    windowMinutes: cfg?.windowMinutes ?? DEFAULT_CFG.windowMinutes,
    criticalThresholdPerHour: cfg?.criticalThresholdPerHour ?? DEFAULT_CFG.criticalThresholdPerHour,
    warningThresholdPerHour: cfg?.warningThresholdPerHour ?? DEFAULT_CFG.warningThresholdPerHour,
    topN: cfg?.topN ?? DEFAULT_CFG.topN,
    maxWindowMinutes: cfg?.maxWindowMinutes ?? DEFAULT_CFG.maxWindowMinutes,
  };
}

/** Filtra eventos dentro da janela `[nowMs - windowMs, nowMs]`. */
function filterWindow(events: ReadonlyArray<FailureEvent>, nowMs: number, windowMs: number): FailureEvent[] {
  const min = nowMs - windowMs;
  return events.filter((e) => Number.isFinite(e.ts) && e.ts >= min && e.ts <= nowMs);
}

/** Conta ocorrências por job name. */
function aggregateCounts(events: ReadonlyArray<FailureEvent>, topN: number): Array<{ name: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of events) {
    m.set(e.name, (m.get(e.name) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(topN, 0))
    .map(([name, count]) => ({ name, count }));
}

/**
 * Aplicar thresholds — o coração do Bloco 7 (alerting). Determinístico:
 * mesmo input + mesmo `nowIso` → mesmo plano.
 */
export function analyzeFailures(
  events: ReadonlyArray<FailureEvent>,
  nowMs: number,
  cfg?: AlertConfig,
  nowIso?: string,
): AlertPlan {
  const c = resolveCfg(cfg);
  if (c.windowMinutes <= 0 || c.windowMinutes > c.maxWindowMinutes) {
    throw new AlertConfigError(
      `windowMinutes precisa estar em (0, ${c.maxWindowMinutes}]; recebido ${c.windowMinutes}`,
    );
  }
  if (c.warningThresholdPerHour > c.criticalThresholdPerHour) {
    throw new AlertConfigError(
      `warningThreshold não pode ser maior que criticalThreshold (warning=${c.warningThresholdPerHour}, critical=${c.criticalThresholdPerHour})`,
    );
  }

  const windowMs = c.windowMinutes * 60 * 1000;
  const filtered = filterWindow(events, nowMs, windowMs);
  const totalFailures = filtered.length;

  // ratePerHour = totalFailures / (windowMinutes / 60).
  // Floor 0 — janelas curtas não podem dar mais que 1 falha/h com 0 falhas.
  const ratePerHour = totalFailures / Math.max(c.windowMinutes / 60, 1 / 60);

  const topFailures = aggregateCounts(filtered, c.topN);

  const reasons: string[] = [];
  let severity: AlertSeverity = "ok";
  if (totalFailures === 0) {
    reasons.push("0 falhas na janela observada — silêncio saudável");
  } else {
    if (ratePerHour >= c.criticalThresholdPerHour) {
      severity = "critical";
      reasons.push(
        `taxa ${ratePerHour.toFixed(2)}/h >= limite CRITICO ${c.criticalThresholdPerHour}/h`,
      );
    } else if (ratePerHour >= c.warningThresholdPerHour) {
      severity = "warning";
      reasons.push(
        `taxa ${ratePerHour.toFixed(2)}/h >= limite WARN ${c.warningThresholdPerHour}/h`,
      );
    } else {
      // abaixo do limite: ainda conta o silêncio silencioso
      reasons.push(
        `taxa ${ratePerHour.toFixed(2)}/h dentro do tolerável (< ${c.warningThresholdPerHour}/h)`,
      );
    }
  }

  return {
    severity,
    windowMinutes: c.windowMinutes,
    totalFailures,
    ratePerHour: Math.round(ratePerHour * 100) / 100,
    thresholds: { criticalPerHour: c.criticalThresholdPerHour, warningPerHour: c.warningThresholdPerHour },
    topFailures,
    reasons,
    evaluatedAt: nowIso ?? new Date(nowMs).toISOString(),
  };
}
