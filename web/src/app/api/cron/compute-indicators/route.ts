// app/api/cron/compute-indicators/route.ts
// Disparador batch: computa indicadores para todos os usuários que
// sofreram mudança em academic_items desde `lastComputeAt`.
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}`.

import { NextResponse } from "next/server";
import { enqueue } from "@/lib/queue/pgboss";
import { log } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const sb = await import("@/lib/supabase/server").then((m) => m.createClient());
    const { data: users } = await sb
      .from("academic_items")
      .select("user_id")
      .is("deleted_at", null);
    const set = new Set<string>();
    for (const u of users ?? []) set.add((u as { user_id: string }).user_id);
    let queued = 0;
    for (const userId of set) {
      await enqueue("compute-indicators", { userId, reason: "academic_items_changed" });
      queued += 1;
    }
    log({ level: "info", scope: "indicators", event: "cron.compute-indicators.batch", msg: `queued=${queued}` });
    return NextResponse.json({ ok: true, queued });
  } catch (e) {
    log({ level: "error", scope: "indicators", event: "cron.compute-indicators.failed", msg: String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
