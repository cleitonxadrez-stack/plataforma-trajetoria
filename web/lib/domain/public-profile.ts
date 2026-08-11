// lib/domain/public-profile.ts
// Helper PURO para a rota pública /c/[user_id].
// Toda função é determinística - sem I/O.
//
// DECISÃO DE PRODUTO (CLAUDE.md): privado por padrão. Nada vaza se o
// usuário não fizer opt-in explícito em `public_profile_enabled`.

import { PUBLIC_ACCENT, PUBLIC_DISCLAIMER as ROOT_DISCLAIMER } from "./registry";

// ════════════════════════════════════════════════════════
// VALIDADORES
// ════════════════════════════════════════════════════════

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{4,38}[a-z0-9])?$/;

export function isValidUserIdOrSlug(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  if (s.length > 64) return false;
  return UUID_RE.test(s) || SLUG_RE.test(s);
}

// ════════════════════════════════════════════════════════
// DISCLAIMERS — reexport de registry para consistência global
// ════════════════════════════════════════════════════════

export const NOT_FOUND_DISCLAIMER =
  "Esta página não está disponível. O perfil é privado ou não existe.";

export { ROOT_DISCLAIMER as AUTHENTICITY_DISCLAIMER };

// ════════════════════════════════════════════════════════
// TIPOS DE ENTRADA (apenas o que é público)
// ════════════════════════════════════════════════════════

export interface PublicProfileUserInput {
  id: string;
  fullName: string;
  citationName: string | null;
  lattesId: string | null;
  orcid: string | null;
  publicSlug: string | null;
  publicProfileEnabled: boolean;
  publicProfileEnabledAt: string | null;
  createdAt: string;
}

export interface PublicProfileItemInput {
  id: string;
  itemType: string;
  title: string;
  titleEn: string | null;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  issn: string | null;
  qualisStratum: string | null;
  flaggedLattes: boolean;
  flaggedInnovation: boolean;
}

export interface PublicProfileView {
  accent: string;
  ok: boolean;
  profile: PublicProfileUserInput | null;
  items: PublicProfileItemInput[] | null;
  disclaimer: string;
  notFoundMessage: string | null;
  generatedAt: string;
}

// ════════════════════════════════════════════════════════
// LIMIT & FILTRO
// ════════════════════════════════════════════════════════

export const PUBLIC_PROFILE_LIMIT = 50;

export function filterPublicItems<T extends PublicProfileItemInput>(
  items: T[]
): T[] {
  return items
    .filter((it) => it !== null && typeof it === "object")
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, PUBLIC_PROFILE_LIMIT);
}

// ════════════════════════════════════════════════════════
// SANITIZAÇÃO - nunca expor colunas sensíveis
// ════════════════════════════════════════════════════════

export const SENSITIVE_USER_KEYS = [
  "email",
  "cpfEncrypted",
  "birthDateEncrypted",
  "planTier",
  "planExpiresAt",
  "docQuotaUsed",
  "docQuotaLimit",
] as const;

export function sanitizeForPublicProfile<T extends Record<string, unknown>>(
  user: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(user)) {
    if ((SENSITIVE_USER_KEYS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out;
}

// ════════════════════════════════════════════════════════
// VIEW BUILDER
// ════════════════════════════════════════════════════════

export function buildPublicProfileView(input: {
  user: PublicProfileUserInput | null;
  items: PublicProfileItemInput[] | null;
  generatedAt?: string;
}): PublicProfileView {
  const found = input.user !== null && input.items !== null;
  return {
    accent: PUBLIC_ACCENT,
    ok: found,
    profile: input.user,
    items: input.items,
    disclaimer: ROOT_DISCLAIMER,
    notFoundMessage: found ? null : NOT_FOUND_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
