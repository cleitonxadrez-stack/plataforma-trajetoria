// vitest.config.ts
// Setup mínimo para testes do domínio. Os testes de RLS são SQL puro
// e rodam contra um Postgres de teste (CI), não precisam de jsdom.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    pool: "forks",
  },
  resolve: {
    // Ordem importa: aliases mais específicos ANTES do genérico "@",
    // senão "@" casa "@/lib/..." primeiro e resolve para ./src/lib (inexistente).
    alias: {
      "@/lib": new URL("./lib", import.meta.url).pathname,
      "@/mocks": new URL("./mocks", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
