// app/api/cron/detect-duplicates/route.ts
// Disparador batch do job `detect-duplicates` para todos os usuários
// que (a) importaram Lattes nos últimos N dias, ou (b) todos os usuários
// ativos quando chamado sem filtro.
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}`.
//
// Parâmetros via query string:
//   - sinceHours=168    (default 7 dias) — escopo "usuários com items novos"
//   - allUsers=true     (admin-only)    — força escopo total

import { NextResponse } from "next/server";
import { enqueue } from "@/lib/queue/jobs";
import { log } from "@/lib/observability/log";
import { metrics, Schemas } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_HOURS = 168; // 7 dias
const MAX_BATCH = 200;              // teto defensivo — nunca dispara mais que isso

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // dev sem secret: aceita (caller deve configurar)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

function parseSinceHours(url: URL, fallback = DEFAULT_LOOKBACK_HOURS): number {
  const raw = url.searchParams.get("sinceHours");
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 24 * 30);                      // cap em 30 dias
}

function parseAllUsers(url: URL): boolean {
  return url.searchParams.get("allUsers") === "true";
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const sinceHours = parseSinceHours(url);
  const allUsers = parseAllUsers(url);

  try {
    const sb = await import("@/lib/supabase/server").then((m) => m.createClient());

    // Janela: usuários com pelo menos 1 academic_items.created_at >= now- sinceHours
    const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

    // Estratégia: coletar distinct user_id de academic_items. Se allUsers=true
    // ou se a janela filtrar demais (0), pega todos os users ativos de users.
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
        await enqueue("detect-duplicates", { userId, limit: 1000 });
        queued += 1;
      } catch (e) {
        failed += 1;
        void e;
      }
    }

    metrics.inc(Schemas.cronBatchEnqueued, queued, {
      job: "detect-duplicates",
      allUsers: String(allUsers),
    });

    log({
      level: "info",
      scope: "duplicates",
      event: "cron.batch",
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
      scope: "duplicates",
      event: "cron.batch.failed",
      msg: String((e as Error).message ?? e).slice(0, 200),
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
