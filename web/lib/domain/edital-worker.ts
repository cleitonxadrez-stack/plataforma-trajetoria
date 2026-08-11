// lib/domain/edital-worker.ts
// Wrapper do job `parse-edital`. Lê PDF do edital, parseia metodologia,
// atualiza `dossiers.cached_methodology_json` (campo livre) com a
// proposta para o usuário revisar.
//
// Persistência é responsabilidade do caller (worker) — esse módulo
// é puro: dado um PDF (Buffer), retorna a `MethodologyParseResultRAW`
// do domínio `methodology.ts`.

import { parseEdital, type EditalParserStatus } from "./methodology";

export interface EditalJobPayload {
  dossierId: string;
  userId: string;
  filename: string;
  mimeType: string;
  // Em produção o buffer vem de `processing_jobs.input_ref.storage_key`.
  buffer?: Buffer;
}

export interface ParsedEditalJobResult {
  dossierId: string;
  status: EditalParserStatus;
  filename: string;
  rulesCount: number;
  windowYears: number | null;
  applyCaps: boolean;
  /** Serializável — pronto para `dossiers.cached_methodology_json`. */
  payloadJson: string;
  warnings: string[];
}

export async function processParseEdital(input: EditalJobPayload): Promise<ParsedEditalJobResult> {
  const text = (input.buffer ?? Buffer.from("")).toString("utf8", 0, Math.min((input.buffer?.length ?? 0), 1_000_000));
  const parsed = parseEdital(text, { name: input.filename });
  const payloadJson = JSON.stringify({
    title: parsed.method.name,
    status: parsed.status,
    windowYears: parsed.method.windowYears,
    applyCaps: parsed.method.applyCaps,
    coauthorRule: parsed.method.coauthorRule,
    rules: parsed.rules,
    diagnostics: parsed.diagnostics,
  }, null, 2);

  return {
    dossierId: input.dossierId,
    status: parsed.status,
    filename: input.filename,
    rulesCount: parsed.rules.length,
    windowYears: parsed.method.windowYears,
    applyCaps: parsed.method.applyCaps,
    payloadJson,
    warnings: parsed.diagnostics,
  };
}
