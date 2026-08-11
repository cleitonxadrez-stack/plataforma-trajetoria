// lib/domain/verificar.ts
// Helper PURO para a rota pública /verificar/[codigo].
// Toda função é determinística — sem I/O — para testes sem DB.
//
// REGRAS INVIOLÁVEIS (docs/03-referencia-lattes.md §"Verificação pública"):
//   1. "Nunca afirma autenticidade" — só atesta existência e integridade
//      desde o momento de registro. O texto sempre inclui a data exata
//      de cálculo do hash.
//   2. "Privado por padrão" — se a visibilidade do doc é PRIVADO, a
//      página mostra APENAS: (a) código PLT, (b) data de registro. Sem
//      nome do usuário, sem mime, sem filename.
//   3. "A plataforma nunca deve ser capaz de linkage" — SHA-256 é
//      exposto como fingerprint criptográfico opaco, nunca cruzado.

import { isValidRegistryCode } from "../domain/registry";

/** Estados lidos da tabela documents — string crua, validada no caller. */
export type VerificationVisibility = "PRIVADO" | "PUBLICO";

export interface VerificationSource {
  registryCode: string;
  visibility: VerificationVisibility;
  originalFilename: string | null;
  mimeType: string | null;
  registeredAt: string;     // ISO 8601 UTC
  sha256: string | null;    // exposto apenas se visibility=PUBLICO
}

export interface VerificationView {
  ok: boolean;
  registryCode: string;
  /** Texto curto sempre presente — disclaimer legal. */
  authenticityStatement: string;
  /** Filename só se PUBLICO; null caso contrário. */
  filename: string | null;
  /** "Documento", "Imagem" etc — categoria NÃO-MIME. */
  category: string | null;
  /** Data de registro formatada dd/MM/yyyy BR (null se PRIVADO). */
  registeredAtBR: string | null;
  /** SHA prefixo curto, opaco, público (8 primeiros chars) ou null. */
  fingerprint: string | null;
  /** Erro se ok=false — código legível por humanos. */
  error?: string;
}

/** Categoriza o MIME em rótulo legível, sem expor extensões.
 *  Categorias são BINÁRIAS: rotulam sem deixar vazar MIME cru.
 *  No label fallback genérico — SEMPRE legível ao usuário leigo.
 */
export function mimeToCategory(mime: string | null): string {
  if (!mime) return "Arquivo digital";
  if (mime === "application/pdf") return "Documento PDF";
  if (mime.startsWith("image/")) return "Imagem";
  if (mime.startsWith("video/")) return "Vídeo";
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "Documento de texto";
  if (mime.includes("spreadsheet")) return "Planilha";
  return "Arquivo digital";
}

/** Formata ISO 8601 → dd/MM/yyyy em UTC. Não usa locale para ser determinístico. */
export function formatDateBR(iso: string | null): string | null {
  if (!iso) return null;
  // Aceita "2026-08-10T01:23:45.000Z" e similares.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Pega prefixo curto do SHA. Nunca o SHA inteiro. */
export function shortFingerprint(sha: string | null): string | null {
  if (!sha) return null;
  // SHA-256 completo tem 64 chars hex; <8 é inválido ou truncado demais.
  if (sha.length < 8) return null;
  return sha.slice(0, 8).toUpperCase();
}

/** Texto disclaimer — fixo, auditável, sem troca dinâmica. */
export const AUTHENTICITY_DISCLAIMER =
  "A plataforma atesta APENAS a existência do arquivo e a integridade do " +
  "conteúdo desde a data indicada. NÃO confirma autoria, originalidade " +
  "do emitente, nem veracidade das informações — isso cabe à comissão " +
  "avaliadora confrontar com a fonte emissora.";

/** Função principal. */
export function buildVerificationView(src: VerificationSource): VerificationView {
  // Validação defensiva: se o código não casa o regex, retornamos erro.
  if (!isValidRegistryCode(src.registryCode)) {
    return {
      ok: false,
      registryCode: src.registryCode,
      authenticityStatement: AUTHENTICITY_DISCLAIMER,
      filename: null,
      category: null,
      registeredAtBR: null,
      fingerprint: null,
      error: "Formato de código inválido.",
    };
  }

  if (src.visibility === "PRIVADO") {
    return {
      ok: true,
      registryCode: src.registryCode,
      authenticityStatement: AUTHENTICITY_DISCLAIMER,
      filename: null,
      category: null,
      registeredAtBR: null,
      fingerprint: null,
    };
  }

  // PUBLICO — category pode ser a string "Arquivo digital" (legível), nunca null.
  return {
    ok: true,
    registryCode: src.registryCode,
    authenticityStatement: AUTHENTICITY_DISCLAIMER,
    filename: src.originalFilename ?? null,
    category: mimeToCategory(src.mimeType),
    registeredAtBR: formatDateBR(src.registeredAt),
    fingerprint: shortFingerprint(src.sha256),
  };

  return {
    ok: true,
    registryCode: src.registryCode,
    authenticityStatement: AUTHENTICITY_DISCLAIMER,
    filename: src.originalFilename ?? null,
    category: mimeToCategory(src.mimeType),
    registeredAtBR: formatDateBR(src.registeredAt),
    fingerprint: shortFingerprint(src.sha256),
  };
}

/** Texto humano quando o código NÃO existe no banco (404). */
export const NOT_FOUND_DISCLAIMER =
  "Nenhum documento encontrado com este código. " +
  "Verifique se digitou corretamente — o código é PLT-AAAA-XXXX-XXXX.";
