// lib/domain/validation/upload.ts
// Validação PURA de upload — sem I/O. Camada separada do componente
// para permitir testes determinísticos sem cadeia React/Supabase.
//
// REGRAS (Backlog §2.3 — upload ≤ 50 MB, MIME fechado, dedupe por SHA-256):
//   1. Tamanho máximo = 50 MB (registry.MAX_BYTES).
//   2. MIME fechado (whitelist). Não tenta "sniffar" tipo — confia no
//      Content-Type enviado pelo browser na primeira barreira.
//   3. Dedupe por SHA-256 é responsabilidade da action de upload, mas
//      esta função expõe `assertNotDuplicate(hash, known)` para uso síncrono.
//   4. Nome de arquivo é sanitizado — caracteres de controle viram "_".

import { ACCEPTED_MIME, MAX_BYTES, type AcceptedMime } from "../registry";

const FILENAME_FORBIDDEN = /[\\/\x00-\x1f<>:"|?*]/g;
const FILENAME_RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;

export type UploadValidationError =
  | "FILE_TOO_LARGE"
  | "MIME_NOT_ACCEPTED"
  | "FILENAME_INVALID"
  | "EMPTY_FILE"
  | "DUPLICATE";

export interface UploadValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  knownHashes?: ReadonlyArray<string>;
}

export interface UploadValidationOk {
  ok: true;
  filename: string;          // sanitizado
  mimeType: AcceptedMime;
  sizeBytes: number;
  sha256: string | null;
}

export interface UploadValidationErr {
  ok: false;
  error: UploadValidationError;
  message: string;
}

export type UploadValidationResult = UploadValidationOk | UploadValidationErr;

/** Sanitiza nome — substitui caracteres proibidos por "_". */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "arquivo";
  const cleaned = trimmed.replace(FILENAME_FORBIDDEN, "_");
  if (FILENAME_RESERVED.test(cleaned)) return `_${cleaned}`;
  return cleaned.slice(0, 220);    // limite patronômico
}

/** Validação completa — função pura determinística. */
export function validateUpload(input: UploadValidationInput): UploadValidationResult {
  const { filename, mimeType, sizeBytes, sha256, knownHashes } = input;

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "EMPTY_FILE", message: "Arquivo vazio ou inválido." };
  }
  if (sizeBytes > MAX_BYTES) {
    return {
      ok: false, error: "FILE_TOO_LARGE",
      message: `Arquivo acima de ${Math.round(MAX_BYTES / (1024 * 1024))} MB. Compacte antes de enviar.`,
    };
  }
  if (!ACCEPTED_MIME.has(mimeType)) {
    return {
      ok: false, error: "MIME_NOT_ACCEPTED",
      message: `Tipo não suportado: ${mimeType || "(vazio)"}. Aceitos: PDF, JPG, PNG, HEIC, TIFF, DOC/DOCX.`,
    };
  }
  const safe = sanitizeFilename(filename);
  if (safe !== filename.replace(FILENAME_FORBIDDEN, "_")) {
    return {
      ok: false, error: "FILENAME_INVALID",
      message: "Nome de arquivo contém caracteres inválidos.",
    };
  }
  if (sha256 && knownHashes?.includes(sha256)) {
    return {
      ok: false, error: "DUPLICATE",
      message: "Este arquivo já foi recebido antes — veja o cofre.",
    };
  }

  return { ok: true, filename: safe, mimeType: mimeType as AcceptedMime, sizeBytes, sha256: sha256 ?? null };
}
