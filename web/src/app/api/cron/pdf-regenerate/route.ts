// app/api/cron/pdf-regenerate/route.ts
// GET/POST /api/cron/pdf-regenerate — varredura DEDICADA para regenerar
// PDFs dos dossiês. Diferente de `/api/cron/pdf-generate` (dispatcher
// genérico), este endpoint:
//   1. Lê o storage do dossier table (selecionando candidatos à regen);
//   2. Aplica o módulo PURO `pickDossiersToRegen`;
//   3. Enfileira `pdf-generate` (Jobs["pdf-generate"] canônico).
//
// Autenticação: header `Authorization: Bearer ${CRON_SECRET}` (fail-closed).
// Em prod Vercel Cron → 401 sem secret. Em dev sem secret → 401 também
// (siga a postura de `cron/build-recovery`).
//
// Query params:
//   - limit=50     (default 50, max 500) — teto defensivo
//   - staleAfterDays=90 (default 90)
//
// Métrica: `cron.batch.enqueued{job=pdf-regenerate}`.

import { NextResponse } from "next/server";
import { enqueue } from "@/lib/queue/jobs";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability/log";
import { metrics } from "@/lib/observability/metrics";
import {
  pickDossiersToRegen,
  RegenPickerConfigError,
  type DossierRegenInput,
} from "@/lib/domain/pdf-regen-picker";
import { cronAuthGuard } from "@/lib/queue/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth consolidada em lib/queue/cron-auth.ts (fail-closed).

function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 500);
}

function parseStale(url: URL): number {
  const raw = url.searchParams.get("staleAfterDays");
  if (!raw) return 90;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 90;
  return n;
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = cronAuthGuard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const staleAfterDays = parseStale(url);
  const nowIso = new Date().toISOString();

  try {
    const sb = await createClient();

    // Lê apenas os campos necessários — janela recente (últimas 4 semanas).
    // Limite do Postgres server-side é uma camada extra antes da função pura.
    const { data: rows, error } = await sb
      .from("dossiers")
      .select("id, user_id, status, pdf_storage_key, pdf_generated_at, updated_at")
      .is("deleted_at", null)
      .gte("updated_at", new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString())
      .limit(2000);
    if (error) {
      log({
        level: "error",
        scope: "pdf-regenerate",
        event: "scan.failed",
        msg: (error.message ?? "").slice(0, 200),
      });
      return NextResponse.json({ error: "scan falhou" }, { status: 500 });
    }

    const inputs: DossierRegenInput[] = ((rows ?? []) as Array<{
      id: string;
      user_id: string;
      status: string | null;
      pdf_storage_key: string | null;
      pdf_generated_at: string | null;
      updated_at: string | null;
    }>).map((r) => ({
      id: r.id,
      userId: r.user_id,
      status: r.status,
      pdfStorageKey: r.pdf_storage_key,
      pdfGeneratedAt: r.pdf_generated_at,
      updatedAt: r.updated_at,
    }));

    let candidates;
    try {
      candidates = pickDossiersToRegen(inputs, { limit, staleAfterDays, nowIso });
    } catch (e) {
      if (e instanceof RegenPickerConfigError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    let queued = 0;
    let failed = 0;
    const reasonCounts: Record<string, number> = {};
    for (const c of candidates) {
      reasonCounts[c.reason] = (reasonCounts[c.reason] ?? 0) + 1;
      try {
        await enqueue("pdf-generate", { dossierId: c.dossierId, userId: c.userId });
        queued += 1;
      } catch (e) {
        failed += 1;
        log({
          level: "error",
          scope: "pdf-regenerate",
          event: "enqueue.failed",
          msg: String((e as Error)?.message ?? e).slice(0, 200),
          data: { dossierId: c.dossierId, userId: c.userId },
        });
      }
    }

    metrics.inc("cron.batch.enqueued", queued, { job: "pdf-regenerate" });
    log({
      level: "info",
      scope: "pdf-regenerate",
      event: "scan.done",
      msg: `candidates=${candidates.length} queued=${queued} failed=${failed}`,
      data: { candidates: candidates.length, queued, failed, reasonCounts },
    });

    return NextResponse.json({
      ok: true,
      scanned: inputs.length,
      candidates: candidates.length,
      queued,
      failed,
      reasons: reasonCounts,
      candidates_preview: candidates.slice(0, 10).map((c) => ({
        dossierId: c.dossierId,
        reason: c.reason,
        ageDays: c.ageDays,
      })),
    });
  } catch (e) {
    log({
      level: "error",
      scope: "pdf-regenerate",
      event: "cron.failed",
      msg: String((e as Error)?.message ?? e).slice(0, 200),
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
