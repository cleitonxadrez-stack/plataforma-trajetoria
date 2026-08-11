// lib/queue/followup.ts
// BLOCO 7 — Job diário de follow-up (docs/05-fluxos.md §Fluxo 7).
// Worker registrado no pg-boss com schedule diário. Em dev fica como
// função pura exportada — chamada manual via `pnpm worker:followup`.

import { needsFollowUp } from "@/lib/domain/recovery";

export interface FollowUpRequest {
  id: string;
  userId: string;
  institutionId: string;
  institutionName: string;
  /** Email institucional (ou pessoal) — preenchido pelo recovery-build-worker. */
  institutionEmail?: string | null;
  userEmail?: string | null;
  /** Nome completo do pesquisador — usado no template do e-mail. */
  userFullName?: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  lastFollowUpAt: string | null;
  consentTextVersion: string;
}

/**
 * Shape intermediário produzido por `planFollowUps()` e consumido pelo
 * transport de e-mail (Bloco 7). Exportado aqui para que `followup-email.ts`
 * não dependa de um módulo separado.
 */
export interface FollowUpNotification {
  requestId: string;
  userId: string;
  institutionId: string;
  institutionName: string;
  daysPast: number;
}

export interface FollowUpResult {
  scanned: number;
  dueCount: number;
  notifications: FollowUpNotification[];
  /** true se rodou em ambiente sem credenciais — worker fica dormindo. */
  dryRun: boolean;
}

/**
 * Aplica a regra de follow-up: ≥30 dias após envio sem resposta → ping.
 * Aqui NÃO dispara e-mail — só produz o payload — porque o canal real
 * é decidido no Bloco 7 (e-mail transacional / Sentry / webhook).
 * A função é pura: testa cada request contra a regra e devolve o
 * delta para envio.
 */
export function planFollowUps(
  requests: ReadonlyArray<FollowUpRequest>,
  now: Date,
  intervalDays = 30,
): FollowUpResult {
  const notifications: FollowUpNotification[] = [];
  let dueCount = 0;
  for (const r of requests) {
    if (!needsFollowUp(r, now, intervalDays)) continue;
    dueCount++;
    const ref = r.lastFollowUpAt ?? r.sentAt ?? now.toISOString();
    const daysPast = Math.floor(
      (now.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24),
    );
    notifications.push({
      requestId: r.id,
      userId: r.userId,
      institutionId: r.institutionId,
      institutionName: r.institutionName,
      daysPast,
    });
  }
  return {
    scanned: requests.length,
    dueCount,
    notifications,
    dryRun: !process.env.FOLLOWUP_NOTIFY_ENABLED,
  };
}
