// mocks/extraction-fixtures.ts
// Dados MOCK determinísticos consumidos por lib/domain/extract.ts no modo mock.
//
// Estes fixtures simulam três cenários canônicos da cascata:
//   - cert-2024:  resolve no passo 3 (Crossref/DOI)
//   - artig-2023: resolve no passo 6 (IA — único caminho caro)
//   - dipl-2026:  resolve no passo 1 (texto embutido — caminho mais barato)
//
// Servem para que componentes e testes funcionem SEM a chain completa.

import type { ExtractedFields } from "../lib/domain/cascade";
import type { ItemView } from "../lib/domain/items";

export interface MockFixture {
  label: string;                  // humano: "Certificado — Resolveu no passo 3"
  registryCode: string;
  fields: Partial<ExtractedFields>;
  steps: { step: 1 | 2 | 3 | 4 | 5 | 6; source: string; succeeded: boolean; confidence?: number }[];
  totalCostCents: number;
  usedAI: boolean;
}

export const MOCK_FIXTURES: readonly MockFixture[] = Object.freeze([
  {
    label: "Certificado com DOI (resolveu no passo 3 — Crossref)",
    registryCode: "PLT-2026-A7K9-3F2M",
    fields: {
      documentType: "CERTIFICADO",
      title: "Certificado de participação — VIII Simpósio de Computação Aplicada",
      institutionName: "Sociedade Brasileira de Computação",
      year: 2024,
      doi: "10.1234/sbc.2024.cert.001",
      eventName: "VIII Simpósio de Computação Aplicada",
      cargaHoraria: 20,
    },
    steps: [
      { step: 1, source: "pdf-parse",     succeeded: false, confidence: 0 },
      { step: 2, source: "jsqr",          succeeded: false, confidence: 0 },
      { step: 3, source: "crossref",      succeeded: true,  confidence: 0.92 },
    ],
    totalCostCents: 0,
    usedAI: false,
  },
  {
    label: "Artigo raro sem DOI (resolveu no passo 6 — IA)",
    registryCode: "PLT-2026-B3M2-H7K4",
    fields: {
      documentType: "ARTIGO",
      title: "Modelos generativos em periódicos de baixa indexação",
      institutionName: "Universidade Federal de Pequena Cidade",
      year: 2023,
      doi: undefined,
    },
    steps: [
      { step: 1, source: "pdf-parse",     succeeded: false, confidence: 0 },
      { step: 2, source: "jsqr",          succeeded: false, confidence: 0 },
      { step: 3, source: "crossref",      succeeded: false, confidence: 0 },
      { step: 4, source: "template",      succeeded: false, confidence: 0 },
      { step: 5, source: "ocr-tesseract", succeeded: false, confidence: 0 },
      { step: 6, source: "ia-strong",     succeeded: true,  confidence: 0.74 },
    ],
    totalCostCents: 12,
    usedAI: true,
  },
  {
    label: "Diploma com PDF pesquisável (resolveu no passo 1 — texto embutido)",
    registryCode: "PLT-2026-D2K5-N8P3",
    fields: {
      documentType: "DIPLOMA",
      title: "Diploma de Doutorado em Engenharia de Produção",
      institutionName: "Universidade Federal do Estado X",
      year: 2026,
      doi: undefined,
    },
    steps: [
      { step: 1, source: "pdf-parse", succeeded: true, confidence: 0.97 },
    ],
    totalCostCents: 0,
    usedAI: false,
  },
] as MockFixture[]);

/* ─── Mock para a tela de Trajetória (Bloco 3) ─── */

export const MOCK_ITEMS: readonly ItemView[] = Object.freeze([
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Modelos generativos em periódicos de baixa indexação",
    titleEn: "Generative models in low-indexed journals",
    itemType: "ARTIGO",
    year: 2023,
    doi: null,
    nature: "TRABALHO_COMPLETO",
    state: "CONFIRMADO",
    evidenceStatus: "COM_COMPROVANTE_PARCIAL",
    evidenceCount: 1,
    citationCount: 0,
    flaggedInnovation: true,
    flaggedLattes: false,
    needsReview: true,
    visibility: "PRIVADO",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Certificado de participação — VIII Simpósio de Computação Aplicada",
    titleEn: null,
    itemType: "CERTIFICADO",
    year: 2024,
    doi: "10.1234/sbc.2024.cert.001",
    nature: "APRESENTACAO",
    state: "DOCUMENTADO",
    evidenceStatus: "COMPROVADO",
    evidenceCount: 1,
    citationCount: 0,
    flaggedInnovation: false,
    flaggedLattes: false,
    needsReview: false,
    visibility: "PRIVADO",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Diploma de Doutorado em Engenharia de Produção",
    titleEn: null,
    itemType: "DIPLOMA",
    year: 2026,
    doi: null,
    nature: "FORMACAO",
    state: "VALIDADO",
    evidenceStatus: "COMPROVADO",
    evidenceCount: 1,
    citationCount: 0,
    flaggedInnovation: false,
    flaggedLattes: true,
    needsReview: false,
    visibility: "PUBLICO",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    title: "Docência em Algoritmos — Semestre 2023.1",
    titleEn: null,
    itemType: "CERTIFICADO",
    year: 2023,
    doi: null,
    nature: "ATIVIDADE_ENSINO",
    state: "AUTODECLARADO",
    evidenceStatus: "SEM_COMPROVANTE",
    evidenceCount: 0,
    citationCount: 0,
    flaggedInnovation: false,
    flaggedLattes: false,
    needsReview: false,
    visibility: "PRIVADO",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    title: "Capítulo de livro — Introdução à Mineração de Dados",
    titleEn: "Introduction to Data Mining (book chapter)",
    itemType: "ARTIGO",
    year: 2022,
    doi: "10.5555/livro.2022.cap01",
    nature: "CAPITULO",
    state: "DOCUMENTADO",
    evidenceStatus: "COMPROVADO",
    evidenceCount: 1,
    citationCount: 3,
    flaggedInnovation: false,
    flaggedLattes: false,
    needsReview: false,
    visibility: "PRIVADO",
  },
] as ItemView[]);
