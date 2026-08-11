// lib/observability/log.ts
// BLOCO 7 — Logger estruturado mínimo.
// Sem dependência externa: JSON line por entrada. Em dev basta console;
// em produção pg-boss + Vercel enviam para Datadog/Sentry (env OUT).
//
// Princípio (CLAUDE.md §"Como deve parecer"): o log nunca vaza PII.
// Carregamos `redact(entry, lists)` aplicável a userId, sha256, cpf.

const PII_KEYS: ReadonlySet<string> = new Set([
  "userId", "user_id", "cpf", "email", "birthDate", "birth_date", "fullName", "full_name",
]);
const REDACT_PLACEHOLDER = "[REDACTED]";

export type Level = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;              // ISO
  level: Level;
  scope: string;           // "registry" | "cascade" | "recovery" | "indicators" | "edital"
  event: string;           // "document.registered" | "cascata.step.failed" ...
  msg?: string;            // frase humana curta (pt-BR)
  requestId?: string;
  data?: Record<string, unknown>;
}

export function log(e: Omit<LogEntry, "ts">): LogEntry {
  const entry: LogEntry = { ts: new Date().toISOString(), ...e };
  const safe = redact(entry);
  const stream = safe.level === "error" || safe.level === "warn" ? console.error : console.log;
  stream(JSON.stringify(safe));
  return safe;
}

export function redact(entry: LogEntry): LogEntry {
  if (!entry.data) return entry;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry.data)) {
    if (PII_KEYS.has(k)) { out[k] = REDACT_PLACEHOLDER; continue; }
    out[k] = redactUnknown(v);
  }
  return { ...entry, data: out };
}

function redactUnknown(v: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 240 ? v.slice(0, 240) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redactUnknown(x, depth + 1));
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEYS.has(k)) { o[k] = REDACT_PLACEHOLDER; continue; }
      o[k] = redactUnknown(vv, depth + 1);
    }
    return o;
  }
  return v;
}
