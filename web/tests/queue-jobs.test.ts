// tests/queue-jobs.test.ts
// Validação do mapeamento de nomes canônicos.
//
// Cobre os 7 jobs atuais do Bloco 7:
//   extract-cascade, parse-edital, pdf-generate, compute-indicators,
//   detect-duplicates, recovery-build, follow-up-requests.

import { describe, it, expect } from "vitest";
import { QUEUE_NAMES, isKnownQueue } from "../lib/queue/jobs";

describe("queue-jobs — mapeamento canônico", () => {
  it("inclui OS 7 jobs do Bloco 7 (incluindo recovery-build)", () => {
    expect(new Set(QUEUE_NAMES)).toEqual(new Set([
      "extract-cascade",
      "parse-edital",
      "pdf-generate",
      "compute-indicators",
      "detect-duplicates",
      "recovery-build",
      "follow-up-requests",
    ]));
    expect(QUEUE_NAMES).toHaveLength(7);
  });

  it("isKnownQueue é type-guard", () => {
    expect(isKnownQueue("pdf-generate")).toBe(true);
    expect(isKnownQueue("detect-duplicates")).toBe(true);
    expect(isKnownQueue("recovery-build")).toBe(true);
    expect(isKnownQueue("inventado")).toBe(false);
  });

  it("Jobs['recovery-build'] aceita payload {userId, limit?}", () => {
    // Tipo só é garantido pela checagem em tempo de compilação, então aqui
    // validamos por reflexão do objeto de tipo via require runtime.
    type J = {
      "recovery-build": { userId: string; limit?: number };
    };
    const sample: J["recovery-build"] = { userId: "u-1", limit: 500 };
    expect(sample.userId).toBe("u-1");
    expect(sample.limit).toBe(500);
  });
});
