// lib/domain/recovery-build-worker.ts
// I/O wrapper do job pg-boss `recovery-build`. Lê academic_items (que
// precisam de carta) + institutions + dados do user do banco, chama o
// módulo puro `buildRecoveryRequests`, faz upsert idempotente em
// `recovery_requests` (status=ABERTA, consent_text_version selada).
//
// REGRAS (CLAUDE.md §Sem mentira):
//   1. NUNCA gera carta para itens COMPROVADO — filtro na origem.
//   2. Dedupe por (user_id, institution_id, sorted(item_ids)).
//   3. Falha em 1 item NÃO cancela o batch — try/catch interno + log.
//   4. Métrica `Schemas.letterGenerated` por linha INSERIDA com sucesso.

import { metrics, Schemas } from "@/lib/observability/metrics";
import { log } from "@/lib/observability/log";
import {
  buildRecoveryRequests,
  fingerprintFromIds,
  type RecoveryBuildRow,
} from "./recovery-build";

export interface ProcessRecoveryBuildInput {
  userId: string;
  /** Default 1000 — teto defensivo por usuário. */
  limit?: number;
}

export interface ProcessRecoveryBuildOutcome {
  ok: boolean;
  userId: string;
  scannedItems: number;
  requestsCreated: number;
  skippedDuplicate: number;
  failed: number;
  error?: string;
}

const NEEDS_LETTER_EVIDENCE: ReadonlySet<string> = new Set([
  "SEM_COMPROVANTE",
  "COM_COMPROVANTE_PARCIAL",
]);

export async function processRecoveryBuild(
  input: ProcessRecoveryBuildInput,
): Promise<ProcessRecoveryBuildOutcome> {
  const out: ProcessRecoveryBuildOutcome = {
    ok: false,
    userId: input.userId,
    scannedItems: 0,
    requestsCreated: 0,
    skippedDuplicate: 0,
    failed: 0,
  };

  try {
    // Import dinâmico — evita edge-bundle problemático em testes.
    const { createClient } = await import("@/lib/supabase/server");
    const sb = await createClient();

    // 1. user data (auth já garantida pelo caller de API; aqui idempotência).
    const { data: urow, error: uerr } = await sb
      .from("users")
      .select("full_name, lattes_id, orcid")
      .eq("id", input.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (uerr) {
      out.error = (uerr.message ?? "user lookup failed").slice(0, 200);
      return out;
    }
    if (!urow) {
      out.error = "user not found";
      return out;
    }
    const urec = urow as {
      full_name: string | null;
      lattes_id: string | null;
      orcid: string | null;
    };
    const userFullName = urec.full_name?.trim() || "Colaborador";

    // 2. Items do usuário (apenas os que precisam de carta).
    const limit = Math.min(Math.max(input.limit ?? 1000, 1), 2000);
    const { data: irows, error: ierr } = await sb
      .from("academic_items")
      .select("id, item_type, title, year, institution_name, evidence_status")
      .eq("user_id", input.userId)
      .is("deleted_at", null)
      .limit(limit);
    if (ierr) {
      out.error = (ierr.message ?? "items lookup failed").slice(0, 200);
      return out;
    }
    const allItems = (irows ?? []) as Array<{
      id: string;
      item_type: string;
      title: string;
      year: number | null;
      institution_name: string | null;
      evidence_status: string;
    }>;
    out.scannedItems = allItems.length;

    const filteredItems = allItems.filter((r) => NEEDS_LETTER_EVIDENCE.has(r.evidence_status));

    // 3. Institutions (todas — o matching por nome acontece dentro do módulo puro).
    const { data: insts, error: inserr } = await sb
      .from("institutions")
      .select("id, name, contact_channels")
      .is("deleted_at", null);
    if (inserr) {
      out.error = (inserr.message ?? "institutions lookup failed").slice(0, 200);
      return out;
    }
    const institutions = (insts ?? []).map((r) => {
      const rec = r as {
        id: string;
        name: string;
        contact_channels: {
          secretariaAcademica?: string;
          biblioteca?: string;
          proReitoriaExtensao?: string;
        } | null;
      };
      return {
        id: rec.id,
        name: rec.name,
        contactChannels: rec.contact_channels ?? {},
      };
    });

    // 4. Composição PURA — sem mutação de DB aqui.
    const build = buildRecoveryRequests({
      userId: input.userId,
      userFullName,
      userLattesId: urec.lattes_id ?? null,
      userORCID: urec.orcid ?? null,
      items: filteredItems.map((r) => ({
        id: r.id,
        title: r.title ?? "(sem título)",
        year: r.year ?? 0,
        itemType: r.item_type ?? "OUTROS",
        institutionName: r.institution_name ?? "",
        evidenceStatus: r.evidence_status as "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL",
      })),
      institutions,
    });

    // 5. Upsert idempotente por row.
    for (const row of build.rows) {
      try {
        const fp = row.fingerprint;
        const { data: existing, error: selErr } = await sb
          .from("recovery_requests")
          .select("id")
          .eq("user_id", row.userId)
          .eq("institution_id", row.institutionId)
          .eq("consent_text_version", row.consentTextVersion)
          .contains("item_ids", [...row.itemIds].sort())
          .maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          out.skippedDuplicate += 1;
          continue;
        }

        const insertPayload = {
          user_id: row.userId,
          institution_id: row.institutionId,
          item_ids: row.itemIds,
          status: "ABERTA",
          consent_text_version: row.consentTextVersion,
          channel_used: row.channelUsed,
        };
        const { error: insErr } = await sb.from("recovery_requests").insert(insertPayload);
        if (insErr) throw insErr;

        out.requestsCreated += 1;
        metrics.inc(Schemas.letterGenerated, 1, {
          userId: input.userId,
          channel: row.channelUsed,
          institution: row.institutionId,
        });
        log({
          level: "info",
          scope: "recovery",
          event: "letter.created",
          msg: `${row.institutionName} via ${row.channelUsed} (${row.itemIds.length} itens)`,
          data: { itemCount: row.itemIds.length, channel: row.channelUsed, fp },
        });
      } catch (e) {
        out.failed += 1;
        log({
          level: "error",
          scope: "recovery",
          event: "letter.insert.failed",
          msg: String((e as Error)?.message ?? e).slice(0, 200),
          data: { userId: input.userId, institutionId: row.institutionId, fp: fingerprintFromIds(row.itemIds) },
        });
        void row;
      }
    }

    out.ok = true;
    log({
      level: "info",
      scope: "recovery",
      event: "build.done",
      msg: `created=${out.requestsCreated} dup=${out.skippedDuplicate} failed=${out.failed} scanned=${out.scannedItems}`,
      data: { userId: out.userId },
    });
    return out;
  } catch (e) {
    out.error = String((e as Error)?.message ?? e).slice(0, 200);
    log({ level: "error", scope: "recovery", event: "build.failed", msg: out.error, data: { userId: out.userId } });
    return out;
  }
}

// Re-export do tipo para callers de API.
export type { RecoveryBuildRow };
