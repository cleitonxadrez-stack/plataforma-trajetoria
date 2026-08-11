// app/api/dossies/[id]/download/route.ts
// GET /api/dossies/[id]/download — entrega o PDF do dossiê ao próprio
// usuário via presigned URL do R2 (bucket quente), TTL curto.
//
// CHAIN:
//   1. auth — exige usuário autenticado
//   2. RLS via auth.uid() já cobre ownership de `dossiers`
//   3. se storage_key ausente OU status != PRONTO → 404 com hint, ou 202
//      se `?regenerate=true` (enfileira pdf-generate e devolve jobId)
//   4. normaliza storage_key via `normalizeStorageKey` (lib/storage/download-link.ts)
//   5. presign no R2 com TTL curto (default 60 s, clamp [30,600])
//   6. retorna JSON { ok, url, expiresAt, storageKey, fingerprint } ou
//      redirect 302 quando `?redirect=true`
//
// Por que um download à parte de `/pdf`?
//   - `/pdf` re-renderiza inline — caro para o servidor e o cliente.
//     O PDF correto está em R2 e é só baixar.
//   - Download precisa de janela curta (≤ 10 min) para não virar URL
//     pública persistente — atende a regra do contrato.
//
// Métrica: `dossier.download.count` (string schema, padrão do Bloco 7),
// tag { mime: "application/pdf" }.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignedUrl } from "@/lib/storage/r2";
import {
  buildDownloadLink,
  clampTtl,
  DownloadLinkValidationError,
  MAX_TTL_SEC,
  MIN_TTL_SEC,
  DEFAULT_TTL_SEC,
} from "@/lib/storage/download-link";
import { enqueue } from "@/lib/queue/jobs";
import { log } from "@/lib/observability/log";
import { metrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DownloadOk {
  ok: true;
  dossierId: string;
  url: string;
  storageKey: string;
  bucket: "quente";
  mimeType: "application/pdf";
  expiresAt: string;
  expiresInSec: number;
  fingerprint: string;
  regenJobId?: string;
}
interface DownloadErr {
  ok: false;
  error: string;
  hint?: string;
  regenJobId?: string;
  constraints?: { ttlSec: { min: number; default: number; max: number } };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);

  // auth
  const sb = await createClient();
  const { data: ures } = await sb.auth.getUser();
  if (!ures?.user) {
    return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  }

  // ownership + estado do PDF — `dossiers`: rls por user_id (auth.uid()).
  const { data: dossier, error: ed } = await sb
    .from("dossiers")
    .select("id, status, pdf_storage_key, pdf_generated_at")
    .eq("id", id)
    .eq("user_id", ures.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (ed) {
    return NextResponse.json({ ok: false, error: "erro ao buscar dossiê" }, { status: 500 });
  }
  if (!dossier) {
    return NextResponse.json({ ok: false, error: "dossiê não encontrado" }, { status: 404 });
  }

  const rec = dossier as {
    id: string;
    status: string;
    pdf_storage_key: string | null;
    pdf_generated_at: string | null;
  };

  // Caso 1: PDF existe e está pronto — preenche presigned URL.
  if (rec.pdf_storage_key && rec.status === "PRONTO") {
    const ttlParam = Number(url.searchParams.get("ttl") || DEFAULT_TTL_SEC);
    if (url.searchParams.get("ttl") && (ttlParam < MIN_TTL_SEC || ttlParam > MAX_TTL_SEC)) {
      return NextResponse.json(
        {
          ok: false,
          error: `ttl fora da faixa [${MIN_TTL_SEC}, ${MAX_TTL_SEC}]`,
          constraints: { ttlSec: { min: MIN_TTL_SEC, default: DEFAULT_TTL_SEC, max: MAX_TTL_SEC } },
        },
        { status: 400 },
      );
    }
    const ttl = clampTtl(ttlParam);

    let envelope;
    try {
      envelope = buildDownloadLink({ storageKey: rec.pdf_storage_key, expiresInSec: ttl });
    } catch (e) {
      if (e instanceof DownloadLinkValidationError) {
        // storage_key gravado está corrompido — não conseguimos servir.
        return NextResponse.json(
          {
            ok: false,
            error: "storage_key inválida no banco",
            hint: `campo ${e.field}: ${e.message}`,
          },
          { status: 500 },
        );
      }
      throw e;
    }

    let signed: string;
    try {
      const bucket = envelope.bucket as "quente";
      signed = await presignedUrl({
        bucket,
        key: envelope.objectKey,
        expiresInSec: envelope.expiresInSec,
      });
    } catch (e) {
      log({
        level: "error",
        scope: "dossier",
        event: "download.presign.failed",
        msg: String((e as Error)?.message ?? e).slice(0, 200),
        data: { dossierId: rec.id, storageKey: envelope.storageKey, userId: ures.user.id },
      });
      return NextResponse.json(
        { ok: false, error: "falha ao gerar URL presigned" },
        { status: 502 },
      );
    }

    metrics.inc("dossier.download.count", 1, {
      mime: "application/pdf",
      route: "download",
    });
    log({
      level: "info",
      scope: "dossier",
      event: "download.signed",
      msg: `ttl=${envelope.expiresInSec}s key=${envelope.storageKey}`,
      data: {
        dossierId: rec.id,
        userId: ures.user.id,
        fingerprint: envelope.linkFingerprint,
        expiresInSec: envelope.expiresInSec,
      },
    });

    if (url.searchParams.get("redirect") === "true") {
      return NextResponse.redirect(signed, 302);
    }
    const payload: DownloadOk = {
      ok: true,
      dossierId: rec.id,
      url: signed,
      storageKey: envelope.storageKey,
      bucket: "quente",
      mimeType: "application/pdf",
      expiresAt: envelope.expiresAt,
      expiresInSec: envelope.expiresInSec,
      fingerprint: envelope.linkFingerprint,
    };
    return NextResponse.json<DownloadOk>(payload);
  }

  // Caso 2: PDF ausente. Cliente pode pedir regeneração explícita.
  if (url.searchParams.get("regenerate") === "true") {
    try {
      const r = await enqueue("pdf-generate", { dossierId: rec.id, userId: ures.user.id });
      metrics.inc("dossier.download.regen.count", 1, { mime: "application/pdf" });
      log({
        level: "info",
        scope: "dossier",
        event: "download.regen.enqueued",
        msg: `dossierId=${rec.id} jobId=${r.id}`,
        data: { dossierId: rec.id, userId: ures.user.id, jobId: r.id },
      });
      return NextResponse.json(
        {
          ok: false,
          error: "pdf ausente — regeneração enfileirada",
          regenJobId: r.id,
          hint: "chame sem ?regenerate em ~30s para baixar o PDF pronto",
        },
        { status: 202 },
      );
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `enqueue falhou: ${String((e as Error).message ?? e).slice(0, 120)}` },
        { status: 500 },
      );
    }
  }

  // Caso 3: sem regenerate explícito — só devolve 404 com hint.
  const reason = rec.status && rec.status !== "PRONTO"
    ? `dossiê em status "${rec.status}" — aguarde o job pdf-generate`
    : "dossiê ainda não tem PDF armazenado";
  return NextResponse.json(
    { ok: false, error: "pdf ausente", hint: `${reason}. Adicione ?regenerate=true para enfileirar a geração.` },
    { status: 404 },
  );
}
