// app/api/cron/alert-job-failures/route.ts
// GET /api/cron/alert-job-failures — Varre falhas recentes de jobs (métrica
// + log estruturado) e emite plano de alerta.
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}`. Sem secret
// em produção → 401 (fail-closed, simétrico a `app/api/cron/build-recovery/route.ts`).
//
// Estratégia:
//   1. Lê falhas recentes via `metrics.recent("job.failure.count")` (tag name).
//   2. Chama o módulo PURO `analyzeFailures` (lib/queue/job-alert.ts).
//   3. Emite métrica `alert.plan.count{kind=ok|warning|critical}` e log estruturado.
//   4. Opcionalmente envia e-mail ao admin (variável ALERT_ADMIN_EMAIL).
//
// Métrica schema:
//   - `alert.plan.count` (counter, tags: kind, severity)
//   - `alert.admin.email.count` (counter, tags: ok)
//
// GET query params:
//   - windowMinutes=60  (default 60, max 720)

import { NextResponse } from "next/server";
import { analyzeFailures, type FailureEvent, AlertConfigError } from "@/lib/queue/job-alert";
import { log } from "@/lib/observability/log";
import { metrics } from "@/lib/observability/metrics";
import { sendEmail } from "@/lib/queue/email-transport";
import { cronAuthGuard } from "@/lib/queue/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_SUBJECT_PREFIX = "[Trajetória360 · ALERTA]";

// Auth consolidada em lib/queue/cron-auth.ts (fail-closed).

function parseWindowMinutes(url: URL): number {
  const raw = url.searchParams.get("windowMinutes");
  if (!raw) return 60;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(n, 720);
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = cronAuthGuard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const windowMinutes = parseWindowMinutes(url);

  try {
    const nowMs = Date.now();

    // Métricas em memória: `metrics.recent()` já vem ordenado do mais novo
    // para o mais antigo (vide observability/metrics.ts:61).
    // `job.failure.count` é o Schemas.jobFailure exportado no métriрос.
    // Tags de identificação vêm como `name=<jobName>` se o worker setar.
    const points = metrics.recent("job.failure.count");

    // Cada point se traduz numa FailureEvent; se a tag `name` não vier,
    // caímos no `metricLabel` (tag `metric` ou string vazia).
    const events: FailureEvent[] = points.map((p) => {
      const tagName = p.tags?.name ?? p.tags?.job ?? "";
      const msg = p.tags?.msg ?? "job-failure";
      return { ts: p.ts, name: tagName, msg };
    });

    let plan;
    try {
      plan = analyzeFailures(events, nowMs, { windowMinutes });
    } catch (e) {
      if (e instanceof AlertConfigError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    metrics.inc("alert.plan.count", 1, {
      severity: plan.severity,
      window: String(plan.windowMinutes),
    });

    log({
      level: plan.severity === "critical" ? "error" : plan.severity === "warning" ? "warn" : "info",
      scope: "alert",
      event: "plan.evaluated",
      msg: `severity=${plan.severity} total=${plan.totalFailures} rate=${plan.ratePerHour}/h window=${plan.windowMinutes}m`,
      data: {
        severity: plan.severity,
        total: plan.totalFailures,
        rate: plan.ratePerHour,
        window: plan.windowMinutes,
        top: plan.topFailures,
        evaluatedAt: plan.evaluatedAt,
      },
    });

    let adminEmailSent = false;
    let adminEmailDryRun = true;
    if (plan.severity !== "ok" && process.env.ALERT_ADMIN_EMAIL) {
      const body = [
        `Severidade: ${plan.severity.toUpperCase()}`,
        `Total falhas: ${plan.totalFailures} em ${plan.windowMinutes} min`,
        `Taxa: ${plan.ratePerHour}/h (critical=${plan.thresholds.criticalPerHour}, warn=${plan.thresholds.warningPerHour})`,
        `Top falhas: ${plan.topFailures.map((t) => `${t.name}=${t.count}`).join(", ") || "(nenhuma)"}`,
        `Avaliado: ${plan.evaluatedAt}`,
        "",
        `Razões:`,
        ...plan.reasons.map((r) => `- ${r}`),
      ].join("\n");
      const r = await sendEmail({
        to: process.env.ALERT_ADMIN_EMAIL,
        subject: `${ALERT_SUBJECT_PREFIX} ${plan.severity.toUpperCase()} — ${plan.totalFailures} falhas em ${plan.windowMinutes}m`,
        text: body,
        topic: "ops.alert.plan",
      });
      adminEmailSent = r.ok;
      adminEmailDryRun = Boolean(r.dryRun);
      metrics.inc("alert.admin.email.count", 1, { ok: String(r.ok), dryRun: String(Boolean(r.dryRun)) });
      log({
        level: "info",
        scope: "alert",
        event: "admin.email.sent",
        msg: `ok=${r.ok} dryRun=${Boolean(r.dryRun)}`,
        data: { severity: plan.severity, to: process.env.ALERT_ADMIN_EMAIL },
      });
    }

    return NextResponse.json({
      ok: true,
      plan,
      adminEmailSent,
      adminEmailDryRun,
    });
  } catch (e) {
    log({
      level: "error",
      scope: "alert",
      event: "cron.failed",
      msg: String((e as Error)?.message ?? e).slice(0, 200),
    });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
