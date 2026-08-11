// tests/public-profile.test.ts
// Item #6 — perfilamento público /c/[user_id].
// 9 specs puras (sem I/O de banco).

import { describe, it, expect } from "vitest";
import {
  AUTHENTICITY_DISCLAIMER,
  NOT_FOUND_DISCLAIMER,
  PUBLIC_PROFILE_LIMIT,
  SENSITIVE_USER_KEYS,
  buildPublicProfileView,
  filterPublicItems,
  isValidUserIdOrSlug,
  sanitizeForPublicProfile,
} from "../lib/domain/public-profile";

const validUser = {
  id: "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  fullName: "Ada Lovelace",
  citationName: "LOVELACE, A.",
  lattesId: "1234567890ABCDEF",
  orcid: "0000-0002-1825-0097",
  publicSlug: "ada-lovelace",
  publicProfileEnabled: true,
  publicProfileEnabledAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

const sampleItems = [
  { id: "i1", itemType: "ARTIGO", title: "Notas sobre a máquina analítica", titleEn: null, year: 2024, doi: "10.1234/abc", isbn: null, issn: null, qualisStratum: null, flaggedLattes: true, flaggedInnovation: false },
  { id: "i2", itemType: "CAPITULO", title: "Capítulo antigo", titleEn: null, year: 1999, doi: null, isbn: "978-85-1234", issn: null, qualisStratum: null, flaggedLattes: false, flaggedInnovation: false },
  { id: "i3", itemType: "CERTIFICADO", title: "Premio X", titleEn: null, year: 2010, doi: null, isbn: null, issn: null, qualisStratum: null, flaggedLattes: false, flaggedInnovation: true },
];

describe("public-profile", () => {
  it("isValidUserIdOrSlug aceita UUID", () => {
    expect(isValidUserIdOrSlug("a1b2c3d4-e5f6-7890-abcd-1234567890ab")).toBe(true);
  });

  it("isValidUserIdOrSlug aceita slug válido", () => {
    expect(isValidUserIdOrSlug("ada-lovelace")).toBe(true);
    expect(isValidUserIdOrSlug("francisco-123")).toBe(true);
  });

  it("isValidUserIdOrSlug rejeita slug/lixo", () => {
    expect(isValidUserIdOrSlug("")).toBe(false);
    expect(isValidUserIdOrSlug("-leading-dash")).toBe(false);
    expect(isValidUserIdOrSlug("trailing-dash-")).toBe(false);
    expect(isValidUserIdOrSlug("COM-UPERCASE")).toBe(false);
    expect(isValidUserIdOrSlug("ab")).toBe(false);
    expect(isValidUserIdOrSlug("a".repeat(65))).toBe(false);
    expect(isValidUserIdOrSlug(null as unknown as string)).toBe(false);
    expect(isValidUserIdOrSlug(undefined as unknown as string)).toBe(false);
  });

  it("SENSITIVE_USER_KEYS contém apenas chaves proibidas", () => {
    expect(SENSITIVE_USER_KEYS).toEqual(
      expect.arrayContaining([
        "email",
        "cpfEncrypted",
        "birthDateEncrypted",
        "planTier",
        "docQuotaUsed",
        "docQuotaLimit",
      ])
    );
  });

  it("sanitizeForPublicProfile remove chaves sensíveis", () => {
    const out = sanitizeForPublicProfile({
      id: "abc",
      fullName: "Nome",
      email: "email@privado",
      cpfEncrypted: "***",
      birthDateEncrypted: "***",
      planTier: "FREE",
      docQuotaUsed: 1,
      docQuotaLimit: 500,
    });
    expect(out).toEqual({ id: "abc", fullName: "Nome" });
    expect(JSON.stringify(out)).not.toMatch(/email|FREE|500/);
  });

  it("filterPublicItems ordena desc por ano e respeita limite", () => {
    const arr = filterPublicItems(sampleItems);
    expect(arr.map((i) => i.year)).toEqual([2024, 2010, 1999]);
    expect(arr.length).toBeLessThanOrEqual(PUBLIC_PROFILE_LIMIT);
  });

  it("buildPublicProfileView marca ok=true quando user+items presentes", () => {
    const v = buildPublicProfileView({ user: validUser as never, items: sampleItems });
    expect(v.ok).toBe(true);
    expect(v.profile?.id).toBe(validUser.id);
    expect(v.disclaimer).toBe(AUTHENTICITY_DISCLAIMER);
  });

  it("buildPublicProfileView marca ok=false e devolve notFoundMessage quando user é null", () => {
    const v = buildPublicProfileView({ user: null, items: sampleItems });
    expect(v.ok).toBe(false);
    expect(v.notFoundMessage).toBe(NOT_FOUND_DISCLAIMER);
    expect(v.profile).toBeNull();
  });

  it("buildPublicProfileView tem generatedAt default ISO", () => {
    const v = buildPublicProfileView({ user: validUser as never, items: [] });
    expect(typeof v.generatedAt).toBe("string");
    expect(new Date(v.generatedAt).toString()).not.toBe("Invalid Date");
  });
});
