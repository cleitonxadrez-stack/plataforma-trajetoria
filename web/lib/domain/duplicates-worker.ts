// lib/domain/duplicates-worker.ts
// Worker wrapper do job `detect-duplicates` — escaneia itens do usuário
// e devolve possíveis duplicatas. NÃO muta o banco (sem auto-merge) —
// emite métrica + log para revisão posterior.

import { createClient } from "@/lib/supabase/server";
import {
  classifyDuplicate,
  findDuplicates,
  STRONG_DUPLICATE_SCORE,
  type DuplicateCandidateInput,
  type DuplicateMatch,
} from "./detect-duplicates";
import { log } from "../observability/log";
import { metrics, Schemas } from "../observability/metrics";

export interface DetectDuplicatesPayload {
  userId: string;
  /** Opcional: limite de batch (default 500). */
  limit?: number;
  /** Opcional: desconsiderar soft-deleted (default true). */
  skipDeleted?: boolean;
}

export interface DetectDuplicatesResult {
  ok: boolean;
  userId: string;
  scanned: number;
  autoMergeCandidates: number;   // score >= 0.95
  humanReviewCandidates: number; // 0.70 <= score < 0.95
  error?: string;
}

export async function processDetectDuplicates(
  input: DetectDuplicatesPayload,
): Promise<DetectDuplicatesResult> {
  const sb = await createClient();
  const limit = input.limit ?? 500;
  const skipDeleted = input.skipDeleted ?? true;

  // orcid e lattes_id vivem em `users` (não em academic_items — fonte única).
  // JOIN aplicado em uma única query via embedding FK relationship.
  const q = sb
    .from("academic_items")
    .select(
      "id, item_type, title, title_en, year, doi, isbn, issn, raw_authors, users:user_id(orcid, lattes_id)",
    )
    .eq("user_id", input.userId);
  const { data: rows, error } = skipDeleted
    ? await q.is("deleted_at", null).limit(Math.min(limit * 2, 1000)).limit(limit)
    : await q.limit(limit);

  if (error) {
    return {
      ok: false,
      userId: input.userId,
      scanned: 0,
      autoMergeCandidates: 0,
      humanReviewCandidates: 0,
      error: error.message?.slice(0, 200),
    };
  }

  const corpus: DuplicateCandidateInput[] = (rows ?? []).map((r) => {
    const rec = r as unknown as {
      id: string;
      item_type: string;
      title: string | null;
      title_en: string | null;
      year: number | null;
      doi: string | null;
      isbn: string | null;
      issn: string | null;
      raw_authors: string[] | null;
      users: { orcid: string | null; lattes_id: string | null } | null;
    };
    return {
      id: String(rec.id),
      itemType: String(rec.item_type),
      title: String(rec.title ?? ""),
      titleEn: rec.title_en ?? null,
      year: rec.year ?? null,
      doi: rec.doi ?? null,
      isbn: rec.isbn ?? null,
      issn: rec.issn ?? null,
      authors: rec.raw_authors ?? null,
      orcid: rec.users?.orcid ?? null,
      lattesId: rec.users?.lattes_id ?? null,
    };
  });

  let autoMergeCandidates = 0;
  let humanReviewCandidates = 0;
  for (const candidate of corpus) {
    const matches: DuplicateMatch[] = findDuplicates(candidate, corpus);
    const verdict = classifyDuplicate(matches);
    if (verdict.verdict === "AUTO_MERGE") {
      autoMergeCandidates += 1;
      metrics.inc(Schemas.duplicateAutoMerge, 1, { userId: input.userId });
    } else if (verdict.verdict === "HUMAN_REVIEW") {
      humanReviewCandidates += 1;
      metrics.inc(Schemas.duplicateHumanReview, 1, { userId: input.userId });
    }
  }

  log({
    level: "info",
    scope: "duplicates",
    event: "scan.done",
    msg: `userId=${input.userId} scanned=${corpus.length} auto=${autoMergeCandidates} review=${humanReviewCandidates}`,
    data: { autoMergeCandidates, humanReviewCandidates },
  });

  return {
    ok: true,
    userId: input.userId,
    scanned: corpus.length,
    autoMergeCandidates,
    humanReviewCandidates,
  };
}

// Re-export para evitar ciclo no import do worker dispatcher.
export { STRONG_DUPLICATE_SCORE };
