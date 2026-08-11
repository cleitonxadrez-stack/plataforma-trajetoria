// app/api/recovery/build/route.ts
// POST /api/recovery/build — dispara o job pg-boss `recovery-build` para o
// usuário autenticado. Idempotente: re-chamar recolhe os mesmos items e
// gera dedupe via fingerprint.
//
// CHAIN:
//   1. auth — exige usuário autenticado
//   2. opcional `limit` via query string (default 1000, max 2000)
//   3. enqueue("recovery-build", { userId, limit })
//   4. retorna { ok, jobId, queuedFor }
//
// A persistência em `recovery_requests` acontece DENTRO do worker — este
// endpoint apenas coloca na fila. Falhas de enqueue são capturadas no
// try/catch e devolvidas como 500 com a mensagem da dependência.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueue } from "@/lib/queue/jobs";
import { log } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BuildResponse {
  ok: boolean;
  jobId: string | null;
  queuedFor: string | null;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<BuildResponse>> {
  const sb = await createClient();
  const { data: ures } = await sb.auth.getUser();
  if (!ures?.user) {
    return NextResponse.json(
      { ok: false, jobId: null, queuedFor: null, error: "Não autenticado." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr
    ? Math.min(Math.max(Number(limitStr) || 1000, 1), 2000)
    : 1000;

  try {
    const result = await enqueue("recovery-build", { userId: ures.user.id, limit });
    log({
      level: "info",
      scope: "recovery",
      event: "build.enqueued",
      data: { userId: ures.user.id, jobId: result.id, limit },
    });
    return NextResponse.json(
      { ok: true, jobId: result.id, queuedFor: ures.user.id },
      { status: 202 },
    );
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 200);
    log({
      level: "error",
      scope: "recovery",
      event: "build.enqueue.failed",
      msg,
      data: { userId: ures.user.id },
    });
    return NextResponse.json(
      { ok: false, jobId: null, queuedFor: ures.user.id, error: msg },
      { status: 500 },
    );
  }
}

export const GET = POST;
