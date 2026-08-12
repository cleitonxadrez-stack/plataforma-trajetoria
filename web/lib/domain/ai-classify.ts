// lib/domain/ai-classify.ts
// Classificação por IA: lê o texto bruto de um documento e devolve os campos
// estruturados que a tela de revisão pré-preenche. Chama a OpenAI via fetch
// (sem SDK). É OPCIONAL — sem IA_EXTRACTION_API_KEY, o caller simplesmente pula.
//
// REGRA (CLAUDE.md §"IA nunca decide sozinha"): a IA apenas SUGERE. Nada entra
// na trajetória sem o clique do usuário na revisão.

export interface AIClassifiedFields {
  documentType?: "CERTIFICADO" | "DIPLOMA" | "ATA" | "ARTIGO" | "CAPA_FICHA" | "OUTROS";
  title?: string;
  institutionName?: string;
  year?: number;
  cargaHoraria?: number;
  eventName?: string;
}

export type AIClassifyResult =
  | { ok: true; fields: AIClassifiedFields; model: string; costCents: number }
  | { ok: false; reason: string };

const DOC_TYPES = ["CERTIFICADO", "DIPLOMA", "ATA", "ARTIGO", "CAPA_FICHA", "OUTROS"];

const SYSTEM_PROMPT = `Você extrai metadados de documentos acadêmicos brasileiros
(certificados, diplomas, atas, artigos). Recebe o TEXTO BRUTO de um documento e
responde SOMENTE com um objeto JSON, sem texto extra, com as chaves:
- documentType: um de ${DOC_TYPES.join(", ")} (o mais provável)
- title: título/curso/evento principal do documento (string curta)
- institutionName: instituição emissora (string) ou omita se não houver
- year: ano (número de 4 dígitos) ou omita
- cargaHoraria: carga horária em horas (número) ou omita
- eventName: nome do evento, se aplicável, ou omita
Omita qualquer chave que não conseguir inferir com confiança. Não invente dados.`;

/** Classifica o texto bruto em campos estruturados via OpenAI. */
export async function classifyDocumentFields(
  rawText: string,
  opts: { timeoutMs?: number } = {},
): Promise<AIClassifyResult> {
  const key = process.env.IA_EXTRACTION_API_KEY;
  if (!key) return { ok: false, reason: "NO_MODEL_CONFIGURED" };
  const text = (rawText ?? "").trim();
  if (!text) return { ok: false, reason: "no-text" };

  const model = process.env.IA_MODEL ?? "gpt-4o-mini";
  const endpoint = process.env.IA_BASE_URL ?? "https://api.openai.com/v1";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 6000) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `openai-${res.status}:${body.slice(0, 80)}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: "empty-response" };

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "invalid-json" };
    }

    const fields = normalizeFields(parsed);
    // Custo aproximado (gpt-4o-mini): ~US$0,15/1M in + US$0,60/1M out → centavos.
    const usage = data.usage ?? {};
    const costCents = Math.max(
      1,
      Math.round(((usage.prompt_tokens ?? 0) * 0.015 + (usage.completion_tokens ?? 0) * 0.06) / 100),
    );
    return { ok: true, fields, model, costCents };
  } catch (e) {
    return { ok: false, reason: `error:${(e as Error).message?.slice(0, 60)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Sanitiza a resposta da IA no shape restrito (nunca confia cru). */
function normalizeFields(raw: Record<string, unknown>): AIClassifiedFields {
  const out: AIClassifiedFields = {};
  const dt = String(raw.documentType ?? "").toUpperCase();
  if (DOC_TYPES.includes(dt)) out.documentType = dt as AIClassifiedFields["documentType"];
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title) out.title = title.slice(0, 240);
  const inst = typeof raw.institutionName === "string" ? raw.institutionName.trim() : "";
  if (inst) out.institutionName = inst.slice(0, 240);
  const year = Number(raw.year);
  if (Number.isInteger(year) && year >= 1900 && year <= 2100) out.year = year;
  const ch = Number(raw.cargaHoraria);
  if (Number.isFinite(ch) && ch > 0 && ch < 100_000) out.cargaHoraria = Math.round(ch);
  const ev = typeof raw.eventName === "string" ? raw.eventName.trim() : "";
  if (ev) out.eventName = ev.slice(0, 240);
  return out;
}
