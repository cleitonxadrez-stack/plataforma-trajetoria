// tests/rls.test.ts
// Testes de DOMÍNIO que validam as regras do Bloco 1 — BACKLOG §1.2.
//
// Estes testes são PUROS (sem I/O) e verificam invariantes lógicas.
// Para validação completa da RLS no Postgres, rodar o script
// tests/rls.sql contra o projeto Supabase em CI (vide README → "Provar RLS").
//
// Critério do backlog:
//   "Usuário A não acessa dado de B nem por manipulação direta de query."

import { describe, it, expect } from "vitest";
import {
  isValidEmail, isValidPassword, isValidFullName,
} from "../lib/domain/validation";

describe("Bloco 1 §1.2 — validação de entrada", () => {
  it("rejeita emails vazios ou mal-formados", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("fulano@")).toBe(false);
    expect(isValidEmail("fulano@dominio")).toBe(false);
    expect(isValidEmail("fulano@dominio.com")).toBe(true);
  });

  it("exige senha >= 8 caracteres", () => {
    expect(isValidPassword("")).toBe(false);
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
    expect(isValidPassword("uma-senha-real")).toBe(true);
  });

  it("exige nome completo não-vazio", () => {
    expect(isValidFullName("")).toBe(false);
    expect(isValidFullName("   ")).toBe(false);
    expect(isValidFullName("Cleiton M. Santana")).toBe(true);
  });
});

// Os testes acima garantem a regra aplicada em src/app/cadastrar.
// A regra "A não vê dados de B" só é provada pelo SQL tests/rls.sql
// (vide README §"Provar RLS").
