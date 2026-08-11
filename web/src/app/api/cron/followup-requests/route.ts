// app/api/cron/followup-requests/route.ts
// Cron diário Vercel (vercel.json — 0 2 * * *). Dispara o job pg-boss
// `follow-up-requests` que é o hook do Bloco 6.
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}` exigido
// pela Vercel Cron. Sem isso, retornamos 401.

import { NextResponse } from "next/server";
import { enqueue } from "@/lib/queue/pgboss";
import { log } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const id = await enqueue("follow-up-requests", { nowIso: new Date().toISOString() });
    log({ level: "info", scope: "recovery", event: "cron.followup.enqueued", data: { jobId: id ?? null } });
    return NextResponse.json({ ok: true, jobId: id ?? null });
  } catch (e) {
    log({ level: "error", scope: "recovery", event: "cron.followup.enqueue.failed", msg: String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
