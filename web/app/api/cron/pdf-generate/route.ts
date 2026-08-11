// app/api/cron/pdf-generate/route.ts
// Endpoint HTTP que worker pode usar para chamar pg-boss via API HTTP em
// ambientes em que o processo persistente não pode ser mantido.
//
// Estratégia: Vercel/Railway cron chama este endpoint, o endpoint
// despacha `pdf-generate` para cada dossier em `status="PRONTO_SEM_PDF"`
// (regra interna). Idempotente — pode ser chamado várias vezes.

import { NextResponse } from "next/server";
import { enqueue, isKnownQueue } from "@/lib/queue/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get("x-cron-secret");
  if (secret && supplied !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as { queue?: string; payload?: unknown };

  if (!body.queue || !isKnownQueue(body.queue)) {
    return NextResponse.json(
      { ok: false, error: "queue inválida ou ausente", queues: ["extract-cascade","parse-edital","pdf-generate","compute-indicators","follow-up-requests"] },
      { status: 400 },
    );
  }
  try {
    // @ts-expect-error — body.payload validado por fila conhecida
    const r = await enqueue(body.queue, body.payload ?? {});
    return NextResponse.json({ ok: true, queued: true, id: r.id, queue: body.queue }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message?.slice(0, 120) }, { status: 500 });
  }
}
