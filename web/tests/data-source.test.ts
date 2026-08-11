// tests/data-source.test.ts
// Cobre a política central de fallback (lib/ui/data-source.ts).
// Não toca DB — testes puros.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chooseDataSource, FALLBACK_BADGE } from "../lib/ui/data-source";

const ORIGINAL_ENV = process.env.NODE_ENV;

function setEnv(value: "production" | "development" | "test") {
  Object.assign(process.env, { NODE_ENV: value });
}

describe("chooseDataSource — qualquer dado vindo do DB vence", () => {
  it("profileFound=true → fromDb, usingMock=false, isEmpty=false", () => {
    setEnv("production");
    const r = chooseDataSource({
      profileFound: true, itemsFound: false, interruptionsFound: false, institutionsFound: false,
      fromDb: { tag: "real" },
      fallback: { tag: "should-not-appear" },
    });
    expect(r.data).toEqual({ tag: "real" });
    expect(r.usingMock).toBe(false);
    expect(r.isEmpty).toBe(false);
  });

  it("itemsFound=true → fromDb", () => {
    setEnv("production");
    const r = chooseDataSource({
      profileFound: false, itemsFound: true, interruptionsFound: false, institutionsFound: false,
      fromDb: { tag: "real" }, fallback: { tag: "mock" },
    });
    expect(r.data).toEqual({ tag: "real" });
    expect(r.usingMock).toBe(false);
  });
});

describe("chooseDataSource — DB vazio em PRODUÇÃO NUNCA devolve mock", () => {
  beforeEach(() => setEnv("production"));
  afterEach(() => setEnv(ORIGINAL_ENV ?? "test"));

  it("retorna fallback do caller (empty-state HTML/JSX) com usingMock=false", () => {
    const empty = { emptyStateHtml: true };
    const r = chooseDataSource({
      profileFound: false, itemsFound: false, interruptionsFound: false, institutionsFound: false,
      fromDb: { emptyStateHtml: false }, fallback: empty,
    });
    expect(r.data).toBe(empty);
    expect(r.usingMock).toBe(false);
    expect(r.isEmpty).toBe(true);
  });
});

describe("chooseDataSource — DB vazio em DEV pode usar fallback (mock)", () => {
  beforeEach(() => setEnv("development"));
  afterEach(() => setEnv(ORIGINAL_ENV ?? "test"));

  it("retorna fallback com usingMock=true para renderizar badge", () => {
    const mockData = { items: ["fake1", "fake2"] };
    const r = chooseDataSource({
      profileFound: false, itemsFound: false, interruptionsFound: false, institutionsFound: false,
      fromDb: { items: [] }, fallback: mockData,
    });
    expect(r.data).toBe(mockData);
    expect(r.usingMock).toBe(true);
    expect(r.isEmpty).toBe(true);
  });
});

describe("FALLBACK_BADGE", () => {
  it("é constante legível contendo 'modo demonstração'", () => {
    expect(FALLBACK_BADGE).toContain("modo demonstração");
    expect(FALLBACK_BADGE).toContain("DB vazio");
  });
});
