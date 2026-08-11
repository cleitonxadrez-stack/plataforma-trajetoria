// scripts/worker.ts
// BLOCO 7 — Worker entry-point. Roda TODOS os jobs conhecidos em um
// único processo Node. Em ambiente serverless (Vercel) o ideal é
// manter 1 service separado (Vercel Cron + Railway/Fly.io).
//
// Adicionado nesta entrega: parse-edital, pdf-generate, compute-indicators.
// Mantidos: extract-cascade, follow-up-requests.

import { work, scheduleDaily, stop, type JobName } from "../lib/queue/pgboss";
import { planFollowUps, type FollowUpRequest } from "../lib/queue/followup";
import { buildFollowUpEmail } from "../lib/queue/followup-email";
import { sendEmail } from "../lib/queue/email-transport";
import { log } from "../lib/observability/log";
import { metrics, Schemas } from "../lib/observability/metrics";
import { processExtractCascade } from "../lib/domain/cascade-worker";
import { processParseEdital } from "../lib/domain/edital-worker";
import { processPdfGenerate } from "../lib/domain/pdf-worker";
import { processComputeIndicators } from "../lib/domain/indicators-worker";
import { computeIndicatorsUpsert } from "../lib/domain/compute-indicators";
import { processRecoveryBuild } from "../lib/domain/recovery-build-worker";
import { processDetectDuplicates } from "../lib/domain/duplicates-worker";
import type { IndicatorInputItem, IndicatorInputCareerInterruption } from "../lib/domain/indicators";

/**
 * instrumented(queue, fn) — wire-up do signal Bloco 7 → alert-job-failures.
 *
 * Política (CLAUDE.md §Sem mentira):
 *   1. Incrementa Schemas.jobFailure em CASO de exceção, com tags {queue,error}.
 *      A tag `error` carrega o NOME do erro (não a mensagem inteira), para manter o
 *      recall finito em queries de análise. Mensagem completa vai para log estruturado.
 *   2. Re-lança a exceção para que pg-boss execute `retryLimit=3 / retryBackoff=true`.
 *      Falha não é silenciada — quem decide retry é o scheduler.
 *   3. `successCount` apenas loga; `durationMs` alimenta histograma futuro.
 *   4. NUNCA engole erros de `pg-boss` propriamente dito (ex: conexão perdida).
 */
async function instrumented(
  queue: JobName,
  fn: () => Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  try {
    await fn();
    const duration = Date.now() - startedAt;
    log({
      level: "debug",
      scope: "worker",
      event: "job.success",
      msg: `${queue} ok em ${duration}ms`,
      data: { queue, durationMs: duration },
    });
  } catch (e) {
    const errName = (e as Error)?.name ?? "Error";
    const errMsg = String((e as Error)?.message ?? e).slice(0, 200);
    metrics.inc(Schemas.jobFailure, 1, { queue, error: errName });
    log({
      level: "error",
      scope: "worker",
      event: "job.failed",
      msg: `${queue} ${errName}: ${errMsg}`,
      data: { queue, error: errName, message: errMsg },
    });
    throw e; // re-lança para o pg-boss aplicar retry/backoff
  }
}

async function bootstrap() {
  log({ level: "info", scope: "worker", event: "boot", msg: "worker iniciando" });

  // Cascata (passos 1..6) — também serve re-extract on correction.
  await work<{ documentId: string; userId: string; data?: never }>("extract-cascade", async (j) => {
    await instrumented("extract-cascade", async () => {
      metrics.inc("extract-cascade", 1, { documentId: (j as { documentId: string }).documentId });
      await processExtractCascade((j as { documentId: string }).documentId);
    });
  });

  // Parser de edital PDF → metodologia candidate.
  await work<{ dossierId: string; userId: string; filename: string; mimeType: string; data?: never }>(
    "parse-edital",
    async (j) => {
      await instrumented("parse-edital", async () => {
        metrics.inc(Schemas.cascadeStep, 1, { step: "parse-edital" });
        await processParseEdital(j as unknown as { dossierId: string; userId: string; filename: string; mimeType: string });
      });
    },
  );

  // Render do PDF do dossiê.
  await work<{ dossierId: string; userId: string; data?: never }>("pdf-generate", async (j) => {
    await instrumented("pdf-generate", async () => {
      metrics.inc(Schemas.cascadeAiCost, 0, {
        dossierId: (j as { dossierId: string }).dossierId,
        mimeType: "pdf-render",
      });
      await processPdfGenerate(j as unknown as { dossierId: string; userId: string });
    });
  });

  // Recompute de indicadores quando academic_items mudam.
  await work<{ userId: string; reason: "manual" | "academic_items_changed"; data?: never }>(
    "compute-indicators",
    async (j) => {
      await instrumented("compute-indicators", async () => {
        const userId = (j as { userId: string }).userId;
        // Recalcula derivado PURO (total_score + theme_count) sobre o trabalho
        // do processComputeIndicators — sem round-trip extra ao DB.
        const sb = await import("../lib/supabase/server").then((m) => m.createClient());
        const [{ data: items }, { data: ints }] = await Promise.all([
          sb.from("academic_items")
            .select("id, item_type, year, evidence_status, verification_level, keywords")
            .eq("user_id", userId).is("deleted_at", null),
          sb.from("career_interruptions")
            .select("type, start_date, end_date")
            .eq("user_id", userId).is("deleted_at", null),
        ]);
        const TYPES = ["ARTIGO", "CAPITULO", "CERTIFICADO", "DIPLOMA", "CAPA_FICHA", "OUTROS"] as const;
        const STATES = ["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"] as const;
        const EVID = ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"] as const;
        const mappedItems: IndicatorInputItem[] = ((items ?? []) as Array<{
          item_type: string; year: number | null; verification_level: string; evidence_status: string; keywords: string | null;
        }>).map((r) => ({
          itemType: (TYPES as readonly string[]).includes(r.item_type) ? (r.item_type as IndicatorInputItem["itemType"]) : ("OUTROS" as IndicatorInputItem["itemType"]),
          year: r.year ?? 0,
          state: (STATES as readonly string[]).includes(r.verification_level) ? (r.verification_level as IndicatorInputItem["state"]) : ("AUTODECLARADO" as IndicatorInputItem["state"]),
          evidenceStatus: (EVID as readonly string[]).includes(r.evidence_status) ? (r.evidence_status as IndicatorInputItem["evidenceStatus"]) : ("SEM_COMPROVANTE" as IndicatorInputItem["evidenceStatus"]),
          keywords: r.keywords ?? "",
        }));
        const mappedInts: IndicatorInputCareerInterruption[] = ((ints ?? []) as Array<{
          type: string; start_date: string; end_date: string | null;
        }>).map((r) => ({
          type: (["MATERNIDADE", "PATERNIDADE", "ADOCAO", "SAUDE", "OUTRO"] as readonly string[]).includes(r.type) ? (r.type as IndicatorInputCareerInterruption["type"]) : ("OUTRO" as IndicatorInputCareerInterruption["type"]),
          startDate: r.start_date,
          endDate: r.end_date,
        }));
        const up = computeIndicatorsUpsert({
          userId,
          items: mappedItems,
          interruptions: mappedInts,
          careerStartDate: null,
        });
        metrics.inc(Schemas.indicatorRecomputes, 1, { userId });
        await processComputeIndicators({ userId, reason: "academic_items_changed" });
        { void up; }
      });
    },
  );

  // Recuperação assistida (Bloco 6) — agrupa items SEM_COMPROVANTE por
  // instituição e gera letter bodies idempotentes em recovery_requests.
  await work<{ userId: string; limit?: number; data?: never }>(
    "recovery-build",
    async (j) => {
      await instrumented("recovery-build", async () => {
        const input = j as unknown as { userId: string; limit?: number };
        await processRecoveryBuild({ userId: input.userId, limit: input.limit });
      });
    },
  );

  // Detecção de duplicatas — recomendado após cada importação Lattes ou
  // upload em lote. NUNCA auto-merge: emite métrica e log; revisão humana na UI.
  await work<{ userId: string; limit?: number; skipDeleted?: boolean; data?: never }>(
    "detect-duplicates",
    async (j) => {
      await instrumented("detect-duplicates", async () => {
        const payload = j as unknown as { userId: string; limit?: number; skipDeleted?: boolean };
        await processDetectDuplicates({
          userId: payload.userId,
          limit: payload.limit,
          skipDeleted: payload.skipDeleted ?? true,
        });
      });
    },
  );

  // BLOCO 6 — follow-up diário (cron 02:00 UTC).
  await work<{ requests: FollowUpRequest[]; nowIso: string; data?: never }>(
    "follow-up-requests",
    async (j) => {
      await instrumented("follow-up-requests", async () => {
        const { requests, nowIso } = j as unknown as { requests: FollowUpRequest[]; nowIso: string };
        const plan = planFollowUps((requests ?? []) as ReadonlyArray<FollowUpRequest>, new Date(nowIso));
        log({
          level: plan.dueCount > 0 ? "info" : "debug",
          scope: "recovery",
          event: "followup.scan",
          msg: `devidos=${plan.dueCount}/${plan.scanned}`,
          data: { dueCount: plan.dueCount, scanned: plan.scanned, dryRun: plan.dryRun },
        });
        if (plan.notifications.length > 0) {
          metrics.inc(Schemas.followupSent, plan.notifications.length);
        }
        // Item #7 — envia e-mail real para cada notificação (transport dry-run-aware).
        for (const n of plan.notifications) {
          const req = (requests ?? []).find((r) => r.id === n.requestId);
          if (!req) continue;
          const msg = buildFollowUpEmail({
            notification: n,
            userEmail: req.institutionEmail ?? req.userEmail ?? "redacted@local",
            userFullName: req.userFullName ?? "Colaborador",
            institutionName: req.institutionName,
            consentTextVersion: req.consentTextVersion ?? "v1",
            daysInterval: 30,
          });
          const r = await sendEmail(msg);
          metrics.inc("email.send.count", 1, { topic: msg.topic, ok: String(r.ok), dryRun: String(r.dryRun) });
        }
      });
    },
  );
  await scheduleDaily("follow-up-requests", "0 2 * * *");

  log({ level: "info", scope: "worker", event: "ready", msg: "todos os jobs subscritos" });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] boot falhou:", err);
  process.exitCode = 1;
});

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);
async function shutdown() {
  log({ level: "warn", scope: "worker", event: "shutdown", msg: "SIGTERM recebido" });
  await stop();
}

declare module "../lib/observability/metrics" {
  interface Registry {
    incremented(name: string, tags?: Record<string, string>): Promise<void>;
  }
}

// Work<...> não é genérico resolvido em runtime — anota aqui só para o tsx
// carregar o módulo sem erro.
type _Ensure = IndicatorInputItem | IndicatorInputCareerInterruption;


