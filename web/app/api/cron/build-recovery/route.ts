// app/api/cron/build-recovery/route.ts
// Disparador batch do job `recovery-build` para todos os usuários ativos
// (ou filtrados). Roteado por Vercel Cron em horário off-peak.
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}`.
// Sem CRON_SECRET em produção, retorna 401 — fail-closed.
//
// Parâmetros via query string:
//   - sinceHours=24     (default 24h) — escopo "users com items novos"
//   - allUsers=true     (admin-only)  — força escopo total aos ativos

import { NextResponse } from "next/server";
import { enqueue } from "@/lib/queue/jobs";
import { log } from "@/lib/observability/log";
import { metrics, Schemas } from "@/lib/observability/metrics";
import { cronAuthGuard } from "@/lib/queue/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_BATCH = 200;
const MAX_LOOKBACK_HOURS = 24 * 30; // 30 dias

// Auth consolidada em lib/queue/cron-auth.ts (fail-closed).

function parseSinceHours(url: URL): number {
  const raw = url.searchParams.get("sinceHours");
  if (!raw) return DEFAULT_LOOKBACK_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(n, MAX_LOOKBACK_HOURS);
}

function parseAllUsers(url: URL): boolean {
  return url.searchParams.get("allUsers") === "true";
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = cronAuthGuard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const sinceHours = parseSinceHours(url);
  const allUsers = parseAllUsers(url);

  try {
    const sb = await import("@/lib/supabase/server").then((m) => m.createClient());

    const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

    const { data: recentRows } = await sb
      .from("academic_items")
      .select("user_id")
      .is("deleted_at", null)
      .gte("created_at", cutoff);

    let userIds = Array.from(
      new Set((recentRows ?? []).map((r) => (r as { user_id: string }).user_id)),
    );

    if (allUsers || userIds.length === 0) {
      const { data: allUsersRows } = await sb
        .from("users")
        .select("id")
        .is("deleted_at", null);
      userIds = Array.from(
        new Set((allUsersRows ?? []).map((u) => (u as { id: string }).id)),
      );
    }

    userIds = userIds.slice(0, MAX_BATCH);

    let queued = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await enqueue("recovery-build", { userId, limit: 1000 });
        queued += 1;
      } catch (e) {
        failed += 1;
        void e;
      }
    }

    // Métrica: mesmo Schemas que o detect-duplicates (cron.batch.enqueued).
    metrics.inc("cron.batch.enqueued", queued, {
      job: "recovery-build",
      allUsers: String(allUsers),
    });
    // Log: telefona `Schemas.cronBatchEnqueued` se existir (compat com detect-duplicates).
    if ("cronBatchEnqueued" in Schemas) {
      metrics.inc(
        (Schemas as { cronBatchEnqueued?: string }).cronBatchEnqueued!,
        queued,
        { job: "recovery-build", allUsers: String(allUsers) },
      );
    }

    log({
      level: "info",
      scope: "recovery",
      event: "cron.build.enqueued",
      msg: `queued=${queued} failed=${failed} scope=${allUsers ? "all" : `since=${sinceHours}h`}`,
      data: { queued, failed, scope: allUsers ? "all" : sinceHours, total: userIds.length },
    });

    return NextResponse.json({
      ok: true,
      queued,
      failed,
      scope: allUsers ? "all" : `since=${sinceHours}h`,
      total: userIds.length,
    });
  } catch (e) {
    log({
      level: "error",
      scope: "recovery",
      event: "cron.build.failed",
      msg: String((e as Error)?.message ?? e).slice(0, 200),
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
