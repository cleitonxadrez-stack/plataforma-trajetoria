// lib/domain/cascade.ts
// CASCATA DE EXTRAÇÃO — ordem OBRIGATÓRIA (docs/05-fluxos.md §1.4).
//
//   1. Texto embutido no PDF   — pdf-parse   · custo 0 · ~40% resolve aqui
//   2. QR code                 — jsQR        · custo 0 · resolve URL → confirma
//   3. Identificador           — DOI/ISBN/ISSN via Crossref/Google Books · custo 0
//   4. Template conhecido      — fingerprint → templates · custo 0 · cobertura CRESCE
//   5. OCR local               — Tesseract · custo 0 · gera texto → volta a 3 e 4
//   6. IA                      — só se 1-5 falharam · custo $$ · SEMPRE gera/atualiza template
//
// REGRA (prova em tests/cascade.test.ts):
//   *se step N resolve com sucesso, NUNCA chama steps > N* (asserção do backlog §2.1).
//   *IA nunca é chamada quando passo anterior resolve* (asserção idem).
//
// Os adapters vivem em ./cascade-adapters.ts para permitir vi.doMock()
// sem mudar o orquestrador.

import { generateRegistryCode, sha256OfBuffer } from "./registry";
import {
  pdfParse, qrReader, idResolver,
  templateMatch, ocrLocal, iaExtractor,
  type CascadeStep, type Adapter,
} from "./cascade-adapters";

export type { CascadeStep, StepSource } from "./cascade-adapters";
export type { Adapter } from "./cascade-adapters";

export interface ExtractedFields {
  documentType?: "CERTIFICADO" | "DIPLOMA" | "ATA" | "ARTIGO" | "CAPA_FICHA" | "OUTROS";
  doi?: string;
  isbn?: string;
  issn?: string;
  qrPayload?: string;
  title?: string;
  institutionName?: string;
  year?: number;
  eventName?: string;
  cargaHoraria?: number;
  pageIndex?: number;
  bbox?: { x: number; y: number; w: number; h: number };
  rawText?: string;
}

export interface CascadeInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

interface CascadeState {
  documentId: string;
  steps: CascadeStep[];
  best: Partial<ExtractedFields>;
}

export interface CascadeOutput {
  documentId: string;
  registryCode: string;
  steps: CascadeStep[];
  fields: Partial<ExtractedFields>;
  totalCostCents: number;
  usedAI: boolean;
}

const ADAPTERS: Adapter[] = [pdfParse, qrReader, idResolver, templateMatch, ocrLocal, iaExtractor];

export async function runCascade(input: CascadeInput, documentId: string): Promise<CascadeOutput> {
  const state: CascadeState = { documentId, steps: [], best: {} };

  for (let i = 0; i < ADAPTERS.length; i++) {
    const stepNum = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const result = await ADAPTERS[i](input, state.best);
    state.steps.push(result);

    if (result.succeeded) {
      if (result.fields) Object.assign(state.best, result.fields);
      break;
    }
  }

  const totalCostCents = state.steps.reduce((s, r) => s + (r.costCents ?? 0), 0);
  const usedAI = state.steps.some((s) => s.source.startsWith("ia-"));

  return {
    documentId,
    registryCode: generateRegistryCode(),
    steps: state.steps,
    fields: state.best,
    totalCostCents,
    usedAI,
  };
}

export const hashBuf = sha256OfBuffer;
