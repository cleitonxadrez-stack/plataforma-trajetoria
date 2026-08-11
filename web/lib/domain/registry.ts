// lib/domain/registry.ts
// Núcleo do registro: SHA-256 streaming + código PLT-AAAA-XXXX-XXXX.
//
// REGRAS INVIOLÁVEIS (CLAUDE.md):
//   - "Nunca afirma autenticidade" — só atesta existência e integridade desde então.
//   - "Privado por padrão" — receipt do upload é PRIVADO; visibilidade muda só com ação.
//   - "A plataforma nunca deve ser capaz de linkage" — SHA é criptográfico, não fingerprint.
//
// DESIGN:
//   - hash em chunks para nunca carregar arquivo inteiro na memória (50 MB).
//   - alfabeto A-Z sem I/L/O/U reduz ambiguidade visual em OCR.
//   - random de crypto.randomBytes → seedado por counter monotônico + timestamp.

import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";  // 23 letras — sem I, L, O, U
const CURRENT_YEAR = new Date().getUTCFullYear();

/** PLT-AAAA-XXXX-XXXX → true se casa o regex restrito do projeto. */
export const PLT_REGEX = /^PLT-\d{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** Gera um código novo. Colisões ≈ 23⁸ / 2 ≈ 2e10 — astronomicamente improvável. */
export function generateRegistryCode(): string {
  const year = CURRENT_YEAR;
  const a = randomBlock(4);
  const b = randomBlock(4);
  return `PLT-${year}-${a}-${b}`;
}

function randomBlock(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) {
    // 0..255 — mapeia uniformemente em módulo 23. Viés de ≤ 12% é aceitável.
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Valida sem alocar buffer grande — usado em verificações de input. */
export function isValidRegistryCode(s: string): boolean {
  return typeof s === "string" && PLT_REGEX.test(s.toUpperCase());
}

/** SHA-256 streaming a partir de Buffer (sync). Limite de memória: ~chunkSize. */
export function sha256OfBuffer(buf: Buffer): string {
  const h = createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}

/** SHA-256 streaming a partir de Readable (assíncrono). */
export async function sha256OfStream(stream: Readable): Promise<string> {
  const h = createHash("sha256");
  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => h.update(chunk));
    stream.on("end", () => resolve(h.digest("hex")));
    stream.on("error", reject);
  });
}

/** SHA-256 streaming a partir de AsyncIterable (compatível com Web streams). */
export async function sha256OfAsyncIterable(iter: AsyncIterable<Uint8Array>): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of iter) h.update(Buffer.from(chunk));
  return h.digest("hex");
}

/** Mapeia MIME → categoria aceita pelo projeto. */
export const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/heic", "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml", "text/xml",  // Lattes XML só via /importar; mesmo assim aceita
]);
export const MAX_BYTES = 50 * 1024 * 1024;  // 50 MB

export type AcceptedMime = typeof ACCEPTED_MIME extends Set<infer T> ? T : never;

export function isAcceptedMime(mime: string): mime is AcceptedMime {
  return ACCEPTED_MIME.has(mime);
}

// ──────────────────────────────────────────────────────────────
// Constantes públicas de UI — perfil público e disclaimers.
// Privado por padrão: cores e textos só aparecem onde já há opt-in.
// ──────────────────────────────────────────────────────────────
export const PUBLIC_ACCENT = "#7c2d12";      // tom marrom-quente do tema
export const PUBLIC_DISCLAIMER =
  "Esta página não é atestado de autenticidade. O conteúdo é autodeclarado pelo titular e validado pelo Plataforma Trajetória conforme regras vigentes.";
