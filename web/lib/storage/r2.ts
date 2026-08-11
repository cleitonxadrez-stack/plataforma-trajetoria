// lib/storage/r2.ts
// Wrapper S3-compatible focado no Cloudflare R2.
// Dois buckets: `quente` (versão otimizada, CDN) e `frio` (originais).
//
// Implementação real usa @aws-sdk/client-s3; este wrapper ASSINA o contrato
// para ser substituído sem mexer nos call-sites.
//
// CONVENÇÃO DE PATH (vide docs/01-arquitetura.md §3 — recovery):
//   frio    : originals/yyyy/mm/dd/<documentId>/<originalFilename>
//   quente  : optimized/<documentId>/[<key>]

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/** Lê env vars obrigatórias — falha alto e cedo se faltarem. */
export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketFrio: string;
  bucketQuente: string;
}

export function getR2Config(): R2Config {
  const cfg = {
    endpoint: process.env.R2_ENDPOINT ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucketFrio: process.env.R2_BUCKET_FRIO ?? "plataforma-frio",
    bucketQuente: process.env.R2_BUCKET_QUENTE ?? "plataforma-quente",
  };
  const missing: string[] = [];
  if (!cfg.endpoint) missing.push("R2_ENDPOINT");
  if (!cfg.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!cfg.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (missing.length) {
    throw new R2ConfigError(missing);
  }
  return cfg;
}

export class R2ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`[r2] config ausente: ${missing.join(", ")}. Defina no .env / Vercel / script check-r2 antes de usar storage.`);
    this.name = "R2ConfigError";
    this.missing = missing;
  }
}

/** Defaults lidos lazy — sem throw no import do módulo. */
export const buckets = {
  frio: process.env.R2_BUCKET_FRIO ?? "plataforma-frio",
  quente: process.env.R2_BUCKET_QUENTE ?? "plataforma-quente",
} as const;

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  const cfg = getR2Config();
  _client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

/** Path frio — prefixa data para particionar restores. */
export function frioKey(documentId: string, originalFilename: string): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `originals/${yyyy}/${mm}/${dd}/${documentId}/${originalFilename}`;
}

export function quenteKey(documentId: string, name: string): string {
  return `optimized/${documentId}/${name}`;
}

export async function putObject(opts: {
  bucket: "frio" | "quente";
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}): Promise<void> {
  const cfg = getR2Config();
  await client().send(new PutObjectCommand({
    Bucket: opts.bucket === "frio" ? cfg.bucketFrio : cfg.bucketQuente,
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
  }));
}

/** URL assinada e expirável — nunca link público direto (CLAUDE.md). */
export async function presignedUrl(opts: {
  bucket: "frio" | "quente";
  key: string;
  expiresInSec: number;
}): Promise<string> {
  const cfg = getR2Config();
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: opts.bucket === "frio" ? cfg.bucketFrio : cfg.bucketQuente,
      Key: opts.key,
    }),
    { expiresIn: opts.expiresInSec },
  );
}

/**
 * Preflight R2 — usado por scripts/check-r2.ts e /api/health/ready.
 * Verifica:
 *   1. buckets existem (HeadBucket 200 nos 2)
 *   2. consegue escrever em `frio` (PutObject + GetObject + Delete)
 *   3. consegue assinar URL (presigned URL vence em ≤ expiresInSec)
 *
 * NUNCA deixa objeto de teste vazar — sempre tenta Delete após Put.
 */
export interface PreflightOK {
  ok: true;
  buckets: { frio: string; quente: string };
  writeAndDeleteMs: number;
  presignedTtlSec: number;
}
export interface PreflightFail {
  ok: false;
  error: string;
  code?: string;
}
export type PreflightResult = PreflightOK | PreflightFail;

export async function preflight(opts: { presignedTtlSec?: number } = {}): Promise<PreflightResult> {
  const ttl = Math.min(3600, Math.max(60, opts.presignedTtlSec ?? 600));
  const cfg = getR2Config();
  const probeKey = `__preflight__/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const probeBody = `r2-preflight-${new Date().toISOString()}`;

  try {
    const c = client();
    await c.send(new HeadBucketCommand({ Bucket: cfg.bucketFrio }));
    await c.send(new HeadBucketCommand({ Bucket: cfg.bucketQuente }));

    const t0 = Date.now();
    await c.send(new PutObjectCommand({
      Bucket: cfg.bucketFrio,
      Key: probeKey,
      Body: probeBody,
      ContentType: "text/plain",
    }));
    await c.send(new GetObjectCommand({ Bucket: cfg.bucketFrio, Key: probeKey }));
    await c.send(new DeleteObjectCommand({ Bucket: cfg.bucketFrio, Key: probeKey }));
    const writeAndDeleteMs = Date.now() - t0;

    const url = await presignedUrl({ bucket: "frio", key: probeKey, expiresInSec: ttl });

    return {
      ok: true,
      buckets: { frio: cfg.bucketFrio, quente: cfg.bucketQuente },
      writeAndDeleteMs,
      presignedTtlSec: ttl,
    };
  } catch (e) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    return {
      ok: false,
      error: err?.message ?? String(e),
      code: err?.$metadata?.httpStatusCode?.toString() ?? err?.name,
    };
  }
}
