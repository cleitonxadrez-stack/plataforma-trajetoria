// lib/storage/download-link.ts
// BLOCO 8 — geração PURA de link de download do PDF do dossiê.
//
// Política (CLAUDE.md §Sem mentira):
//   1. Endpoint é dono do storage_key e da URL effêmera — esta função
//      valida/normaliza o input e prepara o envelope para o caller
//      passar para o presigner real (`presignedUrl` em lib/storage/r2.ts).
//   2. NUNCA toca a rede. Fingerprint é determinístico.
//   3. Janela curta — TTL padrão 60 s, mínimo 30 s, máximo 600 s.

import { createHash } from "node:crypto";

export const BUCKET_QUENTE = "quente";
export const DEFAULT_TTL_SEC = 60;
export const MIN_TTL_SEC = 30;
export const MAX_TTL_SEC = 600; // 10 min — mais do que isso vira vetor de scraping

export interface DownloadLinkInput {
  /** Storage key completa, ex: "quente/d-<uuid>/dossie.pdf". */
  storageKey: string;
  /** TTL em segundos — clamped a [30, 600]. */
  expiresInSec?: number;
  /** ISO timestamp — injetado em testes. */
  now?: string;
}

export interface DownloadLinkEnvelope {
  bucket: "quente";
  /** A parte da storageKey depois do bucket/, ex: "d-<uuid>/dossie.pdf". */
  objectKey: string;
  storageKey: string;
  /** TTL efetivamente aplicado (clamped). */
  expiresInSec: number;
  expiresAt: string;
  /** SHA-256 hex (40 chars) sobre (storageKey|expiresInSec) — audit envelope. */
  linkFingerprint: string;
}

/** Erros tipados — caller que mapeia para HTTP. */
export class DownloadLinkValidationError extends Error {
  constructor(msg: string, public readonly field: "storageKey" | "expiresInSec") {
    super(msg);
    this.name = "DownloadLinkValidationError";
  }
}

/** Clamp TTL ao range permitido. */
export function clampTtl(raw: number | undefined): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_TTL_SEC;
  if (n < MIN_TTL_SEC) return MIN_TTL_SEC;
  if (n > MAX_TTL_SEC) return MAX_TTL_SEC;
  return Math.floor(n);
}

/** Normaliza e valida a storageKey. NULL/bad → throw estruturado. */
export function normalizeStorageKey(raw: string): { bucket: string; objectKey: string; storageKey: string } {
  if (!raw || typeof raw !== "string") {
    throw new DownloadLinkValidationError("storageKey ausente", "storageKey");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new DownloadLinkValidationError("storageKey vazia", "storageKey");
  }
  if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
    throw new DownloadLinkValidationError("storageKey não pode começar/terminar com /", "storageKey");
  }
  if (trimmed.includes("..") || trimmed.includes("\\")) {
    throw new DownloadLinkValidationError("storageKey inválida (path traversal ou separador de SO)", "storageKey");
  }
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new DownloadLinkValidationError("storageKey precisa de bucket + objeto (ao menos 2 segmentos)", "storageKey");
  }
  const [bucket, ...rest] = parts;
  if (bucket !== BUCKET_QUENTE) {
    throw new DownloadLinkValidationError(`apenas bucket "${BUCKET_QUENTE}" é suportado; recebido "${bucket}"`, "storageKey");
  }
  if (!/\.pdf$/i.test(rest.join("/"))) {
    throw new DownloadLinkValidationError("objeto precisa terminar em .pdf", "storageKey");
  }
  return { bucket, objectKey: rest.join("/"), storageKey: trimmed };
}

/** Audit envelope — SHA-256 hex truncado a 40 chars. */
export function fingerprintLink(storageKey: string, expiresInSec: number): string {
  return createHash("sha256")
    .update(`${storageKey}|ttl=${expiresInSec}`)
    .digest("hex")
    .slice(0, 40);
}

/** Composição pura — equivale a um "presign dry-run" mas SEM I/O. */
export function buildDownloadLink(input: DownloadLinkInput): DownloadLinkEnvelope {
  const norm = normalizeStorageKey(input.storageKey);
  const ttl = clampTtl(input.expiresInSec);
  const nowIso = (input.now ?? new Date().toISOString()).trim();
  const baseMs = Date.parse(nowIso);
  if (!Number.isFinite(baseMs)) {
    throw new DownloadLinkValidationError("`now` não é um ISO timestamp válido", "storageKey");
  }
  const expiresAt = new Date(baseMs + ttl * 1000).toISOString();
  return {
    bucket: norm.bucket as "quente",
    objectKey: norm.objectKey,
    storageKey: norm.storageKey,
    expiresInSec: ttl,
    expiresAt,
    linkFingerprint: fingerprintLink(norm.storageKey, ttl),
  };
}
