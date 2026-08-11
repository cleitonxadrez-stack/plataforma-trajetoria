// app/api/health/route.ts
// BLOCO 7 — Health check + snapshot de métricas.
//
// Modos (lidos de ?ready=1 ou pathname /ready / /alive):
//   GET /api/health         → 200 com { ok: true, ts, metrics } (liveness DEFAULT)
//   GET /api/health?ready=1 → 200 só se dependências (Supabase, R2) OK; senão 503
//   GET /api/health/alive   → 200 sempre (liveness puro)
//
// Checagens são TIMEOUT-BOUNDED — health NUNCA trava o container.

import { NextResponse } from "next/server";
import { metrics } from "@/lib/observability/metrics";
import { R2ConfigError } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[health] timeout em ${label} (${ms}ms)`)), ms),
    ),
  ]);
}

async function checkSupabase(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL ou ANON_KEY ausentes" };
    const res = await withTimeout(
      fetch(`${url}/auth/v1/health`, { headers: { apikey: key } }),
      TIMEOUT_MS,
      "supabase",
    );
    if (!res.ok) return { ok: false, error: `supabase /auth/v1/health status=${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkR2(): Promise<{ ok: true; ms: number; buckets?: { frio: string; quente: string } } | { ok: false; error: string }> {
  try {
    // Import dinâmico: se faltar @aws-sdk client em runtime a rota cai no catch.
    const mod = await import("@/lib/storage/r2");
    const t0 = Date.now();
    const r = await mod.preflight({ presignedTtlSec: 600 });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, ms: r.writeAndDeleteMs, buckets: r.buckets };
  } catch (e) {
    if (e instanceof R2ConfigError) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message };
  }
}

async function readinessReport() {
  const [supabase, r2] = await Promise.all([checkSupabase(), checkR2()]);
  const allOk = supabase.ok && r2.ok;
  return { ready: allOk, checks: { supabase, r2 } };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantsReady =
    url.pathname.endsWith("/ready") ||
    url.searchParams.get("ready") === "1" ||
    url.searchParams.get("mode") === "ready";

  if (wantsReady) {
    const report = await readinessReport();
    return NextResponse.json(
      {
        ok: report.ready,
        ready: report.ready,
        ts: new Date().toISOString(),
        checks: report.checks,
        metrics: metrics.snapshot(),
      },
      {
        status: report.ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (url.pathname.endsWith("/alive")) {
    return NextResponse.json({ ok: true, alive: true, ts: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    { ok: true, ts: new Date().toISOString(), metrics: metrics.snapshot() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
