// tests/cron-auth.test.ts
// Cobre o guard compartilhado `cronAuthGuard`, usado por:
//   - /api/cron/build-recovery
//   - /api/cron/alert-job-failures
//   - /api/cron/pdf-regenerate
//
// Política testada (sem inventar):
//   1. Sem CRON_SECRET em env → SEMPRE 401 (fail-closed em produção).
//   2. CRON_SECRET presente mas sem header `Authorization` → 401.
//   3. CRON_SECRET presente + `Bearer ${expected}` exato → null (autorizado).
//   4. Header divergente (case, prefixo diferente, espaços extras) → 401.
//   5. Mutação de env entre testes não vaza (cada teste reseta / usa delete).

import { describe, it, expect, afterEach } from "vitest";
import { cronAuthGuard } from "../lib/queue/cron-auth";

const ORIGINAL_ENV = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  }
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/test", { headers });
}

describe("cron-auth — guard compartilhado dos endpoints /api/cron/*", () => {
  it("sem CRON_SECRET em env → 401 unauthorized", () => {
    delete process.env.CRON_SECRET;
    const r = cronAuthGuard(req({ authorization: "Bearer anything" }));
    expect(r).not.toBeNull();
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + Bearer correto → null (autorizado)", () => {
    process.env.CRON_SECRET = "my-secret-1";
    const r = cronAuthGuard(req({ authorization: "Bearer my-secret-1" }));
    expect(r).toBeNull();
  });

  it("CRON_SECRET presente + Bearer errado → 401", () => {
    process.env.CRON_SECRET = "my-secret-1";
    const r = cronAuthGuard(req({ authorization: "Bearer my-secret-2" }));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + sem header authorization → 401", () => {
    process.env.CRON_SECRET = "my-secret-1";
    const r = cronAuthGuard(req({}));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + case-sensitive (lowercase não bate) → 401", () => {
    process.env.CRON_SECRET = "MySecret";
    const r = cronAuthGuard(req({ authorization: "bearer MySecret" }));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + prefixo errado ('Token' em vez de 'Bearer') → 401", () => {
    process.env.CRON_SECRET = "abc";
    const r = cronAuthGuard(req({ authorization: "Token abc" }));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + espaços extras no header → 401 (match estrito)", () => {
    process.env.CRON_SECRET = "abc";
    const r = cronAuthGuard(req({ authorization: "Bearer  abc" }));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + secreta vazia → 401", () => {
    process.env.CRON_SECRET = "";
    const r = cronAuthGuard(req({ authorization: "Bearer " }));
    expect(r?.status).toBe(401);
  });

  it("CRON_SECRET presente + header com valor case-different → 401", () => {
    process.env.CRON_SECRET = "abc";
    const r = cronAuthGuard(req({ authorization: "Bearer ABC" }));
    expect(r?.status).toBe(401);
  });
});
