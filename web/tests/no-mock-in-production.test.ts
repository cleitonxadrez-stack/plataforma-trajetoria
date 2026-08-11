// tests/no-mock-in-production.test.ts
// PPU-S1.4: garante que MOCK_* de UI só vivem atrás do gate IS_DEV (ou
// `process.env.NODE_ENV !== "production"`). Em produção, Next.js faz DCE de
// branches com condicional literal constante; aqui afirmamos que a fonte
// contém o gate explícito por referência, sem tentar simular bundle.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/app");

// Constantes que o grep do commit anterior já localizou (grep -nE em painel +
// pendencias). Centralizamos aqui para que um erro de remoção seja explícito.
const MOCK_NAMES = [
  "MOCK_PROFILE",
  "MOCK_ITEMS",
  "MOCK_INTERRUPTIONS",
  "MOCK_USER",
  "MOCK_INSTITUTIONS",
  "MOCK_PENDINGS",
];
const GATE_TOKENS = [
  "process.env.NODE_ENV !== \"production\"",
  "process.env.NODE_ENV === \"development\"",
  "IS_DEV",
];

function readSrc(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

describe("plataforma — MOCK_* de UI não vazam em produção", () => {
  it("/painel: cada MOCK_* está atrás de gate de dev", () => {
    const src = readSrc("painel/page.tsx");
    for (const name of ["MOCK_PROFILE", "MOCK_ITEMS", "MOCK_INTERRUPTIONS"]) {
      const idx = src.indexOf(name);
      expect(idx, `${name} deve estar presente em painel/page.tsx`).toBeGreaterThanOrEqual(0);
      const before = src.slice(Math.max(0, idx - 400), idx);
      const gated = GATE_TOKENS.some((g) => before.includes(g));
      expect(gated, `${name} deve ser precedido por um gate de dev (IS_DEV ou NODE_ENV !== production)`).toBe(true);
    }
  });

  it("/pendencias: cada MOCK_* está atrás de gate de dev", () => {
    const src = readSrc("pendencias/page.tsx");
    for (const name of ["MOCK_USER", "MOCK_INSTITUTIONS", "MOCK_PENDINGS"]) {
      const idx = src.indexOf(name);
      expect(idx, `${name} deve estar presente em pendencias/page.tsx`).toBeGreaterThanOrEqual(0);
      const before = src.slice(Math.max(0, idx - 400), idx);
      const gated = GATE_TOKENS.some((g) => before.includes(g));
      expect(gated, `${name} deve ser precedido por um gate de dev`).toBe(true);
    }
  });

  it("/painel: IS_DEV ou gate literal está declarado uma vez (não inline)", () => {
    const src = readSrc("painel/page.tsx");
    const hasIsDev = /^const\s+IS_DEV\b/m.test(src);
    const hasInline = /process\.env\.NODE_ENV\s*!==\s*["']production["']/m.test(src);
    expect(hasIsDev || hasInline, "esperado IS_DEV helper ou gate literal no topo").toBe(true);
  });

  it("/pendencias: IS_DEV ou gate literal está declarado uma vez (não inline)", () => {
    const src = readSrc("pendencias/page.tsx");
    const hasIsDev = /^const\s+IS_DEV\b/m.test(src);
    const hasInline = /process\.env\.NODE_ENV\s*!==\s*["']production["']/m.test(src);
    expect(hasIsDev || hasInline, "esperado IS_DEV helper ou gate literal no topo").toBe(true);
  });

  it("MOCK_NAMES (catálogo) bate com o que foi encontrado nas 2 páginas", () => {
    // Anti-regressão: se algum MOCK_* novo aparecer em UI gateada, ele deve
    // estar no catálogo. Mantemos o catálogo como fonte da verdade.
    const painel = readSrc("painel/page.tsx");
    const pend = readSrc("pendencias/page.tsx");
    const found = new Set<string>();
    for (const n of MOCK_NAMES) {
      if (painel.includes(n) || pend.includes(n)) found.add(n);
    }
    expect(found).toEqual(new Set(MOCK_NAMES));
  });
});
