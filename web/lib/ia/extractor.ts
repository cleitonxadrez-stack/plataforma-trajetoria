// lib/ia/extractor.ts
// ADAPTER isolado para o passo 6 da cascata — passo caro em $.
//
// REGRAS (CLAUDE.md / docs/05-fluxos.md §1.4):
//   1. IA é o ÚLTIMO recurso, não o primeiro. Sempre atrás de 1-5.
//   2. Toda saída de IA é SUGESTÃO — fluxo "confirme ou edite" é lei.
//   3. Sem chave configurada → { ok:false, reason:"NO_MODEL_CONFIGURED" }.
//      NUNCA trava o sistema; o documento fica PENDENTE e a UI trata como tal.
//   4. Toda chamada registra costCents em document_extractions — métrica pública
//      do produto (vide CLAUDE.md §"IA nunca decide sozinha").
//
// TROCA DE MODELO:
//   O adapter abaixo usa uma chamada leve. PROD substitui por OpenAI/Anthropic.
//   O ponto de troca é a função `extract()` — sempre retorna { fields, costCents, confidence }.

export interface IAInput {
  buffer: Uint8Array;
  filename: string;
  mimeType: string;
  /** Best-effort conhecimento prévio (dos passos 1-5) — economiza tokens */
  priorGuess?: {
    text?: string;
    fingerprint?: string;
  };
}

export interface IAOutput {
  ok: boolean;
  reason?: string;            // presente se ok=false
  fields?: Record<string, unknown>;
  confidence?: number;        // 0..1
  model?: string;
  costCents?: number;
}

/** Função principal de extração IA. Substitua a implementação
    em produção sem mexer nos call-sites (cascade.step6). */
export async function extract(input: IAInput): Promise<IAOutput> {
  if (!process.env.IA_EXTRACTION_API_KEY) {
    return {
      ok: false,
      reason: "NO_MODEL_CONFIGURED",
    };
  }

  // PLACEHOLDER para implementação real — Anthropic/OpenAI/Vision.
  // IMPORTANTE: nunca chamar fora de lib/domain/cascade.ts (passo 6) ou
  //             lib/domain/actions/re-extract.ts. Toda chamada aqui é $\$.
  return {
    ok: false,
    reason: "NOT_IMPLEMENTED",
  };
}

/** Classificador leve — usado para decidir se vale chamar o modelo forte.
    Aqui também: sem chave → { ok:false, reason:"NO_MODEL_CONFIGURED" }. */
export async function classify(_input: IAInput): Promise<IAOutput> {
  if (!process.env.IA_CLASSIFY_API_KEY) {
    return { ok: false, reason: "NO_MODEL_CONFIGURED" };
  }
  return { ok: false, reason: "NOT_IMPLEMENTED" };
}
