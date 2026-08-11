// tests/recovery.test.ts
// BLOCO 6 — funções puras: agrupar por instituição, gerar carta,
// regra de follow-up.

import { describe, it, expect } from "vitest";
import {
  groupByInstitution,
  pickPreferredChannel,
  generateLetter,
  needsFollowUp,
  nextFollowUp,
  CONSENT_TEXT_PT,
  CONSENT_VERSION,
  type RecoveryItemInput,
  type RecoveryInstitutionInput,
} from "../lib/domain/recovery";

const UNIPAR: RecoveryInstitutionInput = {
  id: "inst-unipar",
  name: "Universidade Paranaense — UNIPAR",
  contactChannels: {
    secretariaAcademica: "secretaria@unipar.br",
    biblioteca: "bib@unipar.br",
  },
};
const UFMG: RecoveryInstitutionInput = {
  id: "inst-ufmg",
  name: "Universidade Federal de Minas Gerais",
  contactChannels: { proReitoriaExtensao: "proex@ufmg.br" },
};
const INST_NO_CONTACT: RecoveryInstitutionInput = {
  id: "inst-x",
  name: "Universidade Sem Canal",
  contactChannels: {},
};

function item(p: Partial<RecoveryItemInput>): RecoveryItemInput {
  return {
    id: p.id ?? crypto.randomUUID(),
    title: p.title ?? "Sem título",
    year: p.year ?? 2023,
    itemType: p.itemType ?? "CERTIFICADO",
    institutionName: p.institutionName ?? "UFMG",
    evidenceStatus: p.evidenceStatus ?? "SEM_COMPROVANTE",
  };
}

describe("recovery — agrupamento por instituição", () => {
  it("exclui itens já COMPROVADO", () => {
    const out = groupByInstitution({
      items: [
        item({ institutionName: "UFMG", evidenceStatus: "COMPROVADO" }),
        item({ institutionName: "UFMG", evidenceStatus: "SEM_COMPROVANTE" }),
      ],
      institutions: [UFMG],
      consentTextVersion: CONSENT_VERSION,
      now: "2026-08-09T12:00:00Z",
    });
    expect(out.totals.items).toBe(1);
    expect(out.totals.pendingItems).toBe(1);
  });

  it("12 itens da UNIPAR → 1 grupo (não 12 e-mails)", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ id: `u-${i}`, institutionName: "UNIPAR", evidenceStatus: "SEM_COMPROVANTE" }),
    );
    // Acerta o matcher: o user-facing name é "UNIPAR" e a instituição tem
    // "Universidade Paranaense — UNIPAR" — o normalizeName cobre ambos.
    const out = groupByInstitution({
      items,
      institutions: [UNIPAR],
      consentTextVersion: CONSENT_VERSION,
      now: "2026-08-09T12:00:00Z",
    });
    expect(out.groups.length).toBe(1);
    expect(out.groups[0].itemIds.length).toBe(12);
    expect(out.totals.institutions).toBe(1);
  });

  it("3 instituições → 3 grupos ordenados por # de itens DESC", () => {
    const out = groupByInstitution({
      items: [
        item({ id: "u1", institutionName: "UNIPAR" }),
        item({ id: "u2", institutionName: "UNIPAR" }),
        item({ id: "u3", institutionName: "UNIPAR" }),
        item({ id: "m1", institutionName: "UFMG" }),
        item({ id: "x1", institutionName: "Universidade Sem Canal" }),
      ],
      institutions: [UNIPAR, UFMG, INST_NO_CONTACT],
      consentTextVersion: CONSENT_VERSION,
      now: "2026-08-09T12:00:00Z",
    });
    expect(out.groups.map((g) => g.institutionName))
      .toEqual(["Universidade Paranaense — UNIPAR", "Universidade Federal de Minas Gerais", "Universidade Sem Canal"]);
    expect(out.totals.items).toBe(5);
  });

  it("canal preferencial = secretaria > biblioteca > pro-reitoria > outro", () => {
    expect(pickPreferredChannel({ secretariaAcademica: "sa@u.br" }).channel)
      .toBe("secretariaAcademica");
    expect(pickPreferredChannel({ biblioteca: "b@u.br" }).channel)
      .toBe("biblioteca");
    expect(pickPreferredChannel({ proReitoriaExtensao: "p@u.br" }).channel)
      .toBe("proReitoriaExtensao");
    expect(pickPreferredChannel({}).channel).toBe("outro");
  });

  it("partialCoverageRatio reflete % com PARCIAL", () => {
    const out = groupByInstitution({
      items: [
        item({ id: "1", institutionName: "UFMG", evidenceStatus: "COM_COMPROVANTE_PARCIAL" }),
        item({ id: "2", institutionName: "UFMG", evidenceStatus: "SEM_COMPROVANTE" }),
        item({ id: "3", institutionName: "UFMG", evidenceStatus: "SEM_COMPROVANTE" }),
        item({ id: "4", institutionName: "UFMG", evidenceStatus: "COM_COMPROVANTE_PARCIAL" }),
      ],
      institutions: [UFMG],
      consentTextVersion: CONSENT_VERSION,
      now: "2026-08-09T12:00:00Z",
    });
    expect(out.groups[0].partialCoverageRatio).toBeCloseTo(0.5, 5);
  });
});

describe("recovery — geração da carta", () => {
  const NOW = "2026-08-09T12:00:00Z";
  const group = {
    institutionId: UNIPAR.id,
    institutionName: UNIPAR.name,
    preferredChannel: "secretariaAcademica" as const,
    channelAddress: "secretaria@unipar.br",
    itemIds: ["u-1", "u-2"],
    partialCoverageRatio: 0.5,
  };
  const items = [
    { id: "u-1", title: "Monitoria de Cálculo I", year: 2022, itemType: "CERTIFICADO" },
    { id: "u-2", title: "Participação Semana Acadêmica", year: 2023, itemType: "CERTIFICADO" },
  ] as ReadonlyArray<{ id: string; title: string; year: number; itemType: string }>;
  type LetterItem = { id: string; title: string; year: number; itemType: string };
  // Helper: items no formato esperado por `generateLetter` quando chamado pelos testes.
  const itemsFor = (...idx: number[]): readonly LetterItem[] => idx.map((i) => items[i]!);

  it("a carta contém todos os dados do solicitante", () => {
    const letter = generateLetter({
      userFullName: "Maria de Souza",
      userLattesId: "K4000001P5",
      userORCID: "0000-0000-0000-0001",
      group, items: itemsFor(0, 1), now: NOW,
    });
    expect(letter.body).toContain("Maria de Souza");
    expect(letter.body).toContain("K4000001P5");
    expect(letter.body).toContain("ORCID: 0000-0000-0000-0001");
    expect(letter.body).toContain(UNIPAR.name);
    expect(letter.body).toContain("Monitoria de Cálculo I");
    expect(letter.body).toContain("Participação Semana Acadêmica");
    expect(letter.body).toContain("secretaria@unipar.br");
    expect(letter.body).toContain(CONSENT_TEXT_PT);
  });

  it("consentTextVersion é selada na carta e na request", () => {
    const letter = generateLetter({
      userFullName: "X", group, items: itemsFor(0, 1), now: NOW,
    });
    expect(letter.consentTextVersion).toBe(CONSENT_VERSION);
    expect(letter.body).toContain(`Consentimento ${CONSENT_VERSION}`);
  });

  it("endereço ausente → texto neutro sem quebrar", () => {
    const letter = generateLetter({
      userFullName: "Y",
      group: { ...group, preferredChannel: "outro", channelAddress: null },
      items: itemsFor(0, 1), now: NOW,
    });
    expect(letter.body).toContain("a confirmar nos contatos institucionais");
  });
});

describe("recovery — follow-up (30 dias)", () => {
  const NOW = new Date("2026-08-09T12:00:00Z");

  it("precisa follow-up se enviada há ≥30 dias sem resposta", () => {
    expect(needsFollowUp(
      { sentAt: "2026-07-01T00:00:00Z", respondedAt: null, lastFollowUpAt: null },
      NOW,
    )).toBe(true);
  });

  it("NÃO precisa se respondeu", () => {
    expect(needsFollowUp(
      { sentAt: "2026-07-01T00:00:00Z", respondedAt: "2026-07-15T00:00:00Z", lastFollowUpAt: null },
      NOW,
    )).toBe(false);
  });

  it("NÃO precisa se último ping foi há < 30 dias", () => {
    expect(needsFollowUp(
      { sentAt: "2026-06-01T00:00:00Z", respondedAt: null, lastFollowUpAt: "2026-07-20T00:00:00Z" },
      NOW,
    )).toBe(false);
  });

  it("NÃO precisa se nunca foi enviada", () => {
    expect(needsFollowUp(
      { sentAt: null, respondedAt: null, lastFollowUpAt: null },
      NOW,
    )).toBe(false);
  });

  it("nextFollowUp calcula +30 dias a partir do último evento", () => {
    expect(nextFollowUp({ sentAt: "2026-08-01T00:00:00Z", lastFollowUpAt: null }))
      .toBe("2026-08-31T00:00:00.000Z");
    expect(nextFollowUp({ sentAt: null, lastFollowUpAt: null })).toBeNull();
  });

  it("intervalDays configurável", () => {
    expect(needsFollowUp(
      { sentAt: "2026-08-01T00:00:00Z", respondedAt: null, lastFollowUpAt: null },
      NOW, 7,
    )).toBe(true);
  });
});
