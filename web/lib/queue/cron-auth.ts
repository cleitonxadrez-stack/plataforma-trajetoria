// lib/queue/cron-auth.ts
// Guard de autenticação compartilhado por endpoints /api/cron/* (Bloco 7).
//
// Política (CLAUDE.md §Sem mentira):
//   1. Fail-closed em produção: sem `process.env.CRON_SECRET` definido, o
//      endpoint retorna SEMPRE 401 — mesmo em ambiente deservolvimento.
//      A postura é mesma da família `cron/build-recovery` / `cron/alert-job-failures`
//      / `cron/pdf-regenerate`.
//   2. Header esperado: `Authorization: Bearer ${CRON_SECRET}`.
//      Match exato (case-sensitive); trim não é aplicado para evitar bypass
//      por espaços extras.
//   3. NUNCA toca DB, fila ou e-mail — função pura em cima do Request.
//
// Quando retorna `null`, o caller prossegue para o handler. Caso contrário,
// devolve `NextResponse` 401 com payload canônico `{ error: "unauthorized" }`.

import { NextResponse } from "next/server";

export interface CronGuardAuthorized {
  ok: true;
}
export interface CronGuardDenied {
  ok: false;
  response: NextResponse;
}
export type CronGuardResult = CronGuardAuthorized | CronGuardDenied;

/**
 * Returns `null` when authorised; returns a 401 `NextResponse` otherwise.
 * Caller short-circuits with the returned response.
 */
export function cronAuthGuard(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected || typeof expected !== "string" || expected.length === 0) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
