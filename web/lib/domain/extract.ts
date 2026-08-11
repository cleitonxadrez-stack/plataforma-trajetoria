// lib/domain/extract.ts
// PORTA TIPADA DE EXTRAÇÃO — único contrato que a UI consome.
//
// Toda tela de revisão ou fluxo de cascata chama `getExtractionPort().extract(input)`.
// Em produção, delega ao `runCascade(...)` real; em dev/sem-configuração,
// cai no mock determinístico (mocks/extraction-fixtures.ts). Os componentes
// NÃO conhecem a implementação — só o tipo.
//
// Fronteira entre o domínio (extração) e a borda (UI). Trocar a implementação
// NÃO exige mudar a página.

import type { CascadeInput, CascadeOutput, ExtractedFields } from "./cascade";
import { runCascade } from "./cascade";
import { MOCK_FIXTURES, type MockFixture } from "@/mocks/extraction-fixtures";

export interface ExtractionInput {
  documentId: string;
  filename: string;
  mimeType: string;
  /** Em modo mock, este índice aponta o fixture; em produção, ignorado. */
  fixtureIndex?: number;
}

export interface ExtractionResult {
  documentId: string;
  registryCode: string;
  fields: Partial<ExtractedFields>;
  steps: { step: 1 | 2 | 3 | 4 | 5 | 6; source: string; succeeded: boolean; confidence?: number }[];
  totalCostCents: number;
  usedAI: boolean;
  /** Fonte do resultado — UI mostra honestamente "mock" no dev. */
  source: "mock" | "real";
}

export interface ExtractionPort {
  describe(): { name: string; mode: "mock" | "real" };
  isAvailable(): boolean;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/* ─────────────── Mock ─────────────── */

function fixtureToResult(fix: MockFixture, documentId: string): ExtractionResult {
  return {
    documentId,
    registryCode: fix.registryCode,
    fields: fix.fields,
    steps: fix.steps.map((s: MockFixture["steps"][number]) => ({
      step: s.step, source: s.source, succeeded: s.succeeded, confidence: s.confidence,
    })),
    totalCostCents: fix.totalCostCents,
    usedAI: fix.usedAI,
    source: "mock",
  };
}

const mockPort: ExtractionPort = {
  describe: () => ({ name: "Mock determinístico (dev)", mode: "mock" }),
  isAvailable: () => true,
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const idx = typeof input.fixtureIndex === "number"
      ? Math.max(0, Math.min(input.fixtureIndex, MOCK_FIXTURES.length - 1))
      : 0;
    return fixtureToResult(MOCK_FIXTURES[idx], input.documentId);
  },
};

/* ─────────────── Real ─────────────── */

function envLookup(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

const realPort: ExtractionPort = {
  describe: () => ({ name: "Cascata 1→6 (produção)", mode: "real" }),
  isAvailable: () => Boolean(envLookup().SUPABASE_SERVICE_ROLE_KEY),
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const buf = Buffer.from([]);
    const cascadeInput: CascadeInput = { buffer: buf, filename: input.filename, mimeType: input.mimeType };
    const out: CascadeOutput = await runCascade(cascadeInput, input.documentId);
    return {
      documentId: out.documentId,
      registryCode: out.registryCode,
      fields: out.fields,
      steps: out.steps.map((s: CascadeOutput["steps"][number]) => ({
        step: s.step, source: s.source, succeeded: s.succeeded, confidence: s.confidence,
      })),
      totalCostCents: out.totalCostCents,
      usedAI: out.usedAI,
      source: "real",
    };
  },
};

/* ─────────────── Factory ─────────────── */

/** Troca a porta ativa via env `EXTRACTION_MODE=mock|real`. Default: mock. */
export function getExtractionPort(): ExtractionPort {
  const mode = envLookup().EXTRACTION_MODE ?? "mock";
  return mode === "real" ? realPort : mockPort;
}

export type AcademicItemDraft = {
  title: string;
  titleEn: string | null;
  year: number;
  doi: string | null;
  itemType: "ARTIGO" | "CERTIFICADO" | "DIPLOMA" | "CAPA_FICHA" | "OUTROS";
  evidenceStatus: "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL" | "COMPROVADO";
  needsReview: boolean;
};

/** Mapeia ExtractedFields ===> academic_items row (campos de banco). */
export function mapExtractionToItem(
  fields: Partial<ExtractedFields>,
  fallbackTitle: string,
  fallbackYear: number,
): AcademicItemDraft {
  const itemType: AcademicItemDraft["itemType"] =
    fields.documentType === "ARTIGO" ? "ARTIGO"
    : fields.documentType === "CERTIFICADO" ? "CERTIFICADO"
    : fields.documentType === "DIPLOMA" ? "DIPLOMA"
    : "OUTROS";

  const hasDoi = Boolean(fields.doi);
  const hasTitle = Boolean(fields.title ?? fallbackTitle);
  const evidenceStatus: AcademicItemDraft["evidenceStatus"] =
    hasDoi && hasTitle ? "COM_COMPROVANTE_PARCIAL"
    : hasTitle ? "COM_COMPROVANTE_PARCIAL"
    : "SEM_COMPROVANTE";

  return {
    title: fields.title ?? fallbackTitle,
    titleEn: null,
    year: fields.year ?? fallbackYear,
    doi: fields.doi ?? null,
    itemType,
    evidenceStatus,
    needsReview: !hasDoi,
  };
}
