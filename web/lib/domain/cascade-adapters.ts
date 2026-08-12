// lib/domain/cascade-adapters.ts
// Adapters da cascata de extração — ISOLADOS aqui para permitir
// `vi.mock("@/lib/domain/cascade-adapters", …)` nos testes determinísticos.
//
// Esta separação é a fronteira entre a regra de negócio (cascade.ts) e cada
// tecnologia concreta (pdf-parse, jsqr, crossref, ocr, ia). Trocar tecnologia
// NÃO exige mudar o orquestrador.
//
// REGRAS-FORTES:
//   1. Cada adapter é uma `Adapter` (input, prev) → CascadeStep.
//   2. Dependências OPCIONAIS (tesseract.js, jsqr) entram via dynamic
//      `await import(...)` em try/catch — se faltarem, o passo retorna
//      `reason: "dependency-missing"` e o orquestrador segue para o próximo.
//   3. Passo 6 (IA) é o ÚLTIMO — o orquestrador garante.

import type { CascadeInput, ExtractedFields } from "./cascade";

export interface CascadeStep {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  source: StepSource;
  succeeded: boolean;
  confidence?: number;
  fields?: Partial<ExtractedFields>;
  costCents?: number;
  reason?: string;
}

export type StepSource =
  | "pdf-parse" | "jsqr"
  | "crossref" | "google-books" | "portal-issn"
  | "ocr-tesseract"
  | "template"
  | "ia-default" | "ia-strong";

export type Adapter = (
  input: CascadeInput,
  prev?: Partial<ExtractedFields>,
) => Promise<CascadeStep>;

// ─────────────────────────────────────────────────────────────────────────
// Helpers compartilhados
// ─────────────────────────────────────────────────────────────────────────

const DOI_REGEX = /10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/i;
// Após o marcador "ISBN(-13)": captura dígitos com hífens/espaços internos.
const ISBN_MARKED = /ISBN(?:[-\s]?1[03])?[:\s]+([\d][\d\s-]{7,24}[\dXx])/i;
// Sequência nua: ISBN-13 (978/979 + 10) ou ISBN-10 (9 dígitos + verificador).
const ISBN_BARE = /\b(97[89]\d{10}|\d{9}[\dXx])\b/;
const ISSN_REGEX = /\b\d{4}-\d{3}[\dXx]\b/;

/** Extrai o ISBN, tolerando hífens/espaços (ex.: "978-85-123-4567-8"). */
function extractIsbn(text: string): string | null {
  const marked = text.match(ISBN_MARKED)?.[1];
  if (marked) {
    const digits = marked.replace(/[\s-]/g, "");
    if (digits.length === 13 || digits.length === 10) return digits;
  }
  return text.match(ISBN_BARE)?.[1] ?? null;
}

/** Extrai um identificador prioritário de um texto. Ordem: DOI → ISBN → ISSN. */
export function extractIdentifiers(text: string, _prev: unknown = null): { kind: "doi" | "isbn" | "issn" | null; value: string | null } {
  if (!text) return { kind: null, value: null };
  const doi = text.match(DOI_REGEX)?.[0];
  if (doi) return { kind: "doi", value: doi };
  const isbn = extractIsbn(text);
  if (isbn) return { kind: "isbn", value: isbn };
  const issn = text.match(ISSN_REGEX)?.[0];
  if (issn) return { kind: "issn", value: issn };
  return { kind: null, value: null };
}

async function safeFetch(url: string, ms = 4000): Promise<Response | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Plataforma-Trajetoria/1.0 (+cascade-step3)" } });
    clearTimeout(t);
    return r;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 1 — Texto embutido no PDF (pdf-parse, lazy)
// ─────────────────────────────────────────────────────────────────────────
export const pdfParse: Adapter = async (input) => {
  // Um MIME específico não-PDF (ex.: image/jpeg) é autoritativo: não é PDF.
  // O fallback por extensão .pdf só vale quando o MIME é genérico/ausente.
  const genericMime = !input.mimeType || input.mimeType === "application/octet-stream";
  const looksPdf = input.mimeType.includes("pdf") ||
    (genericMime && input.filename.toLowerCase().endsWith(".pdf"));
  if (!looksPdf) {
    return { step: 1, source: "pdf-parse", succeeded: false, reason: "not-pdf" };
  }
  try {
    // pdf-parse v2: classe `PDFParse` (named export), API `.getText()`.
    const mod = await import("pdf-parse" as string).catch(() => null) as {
      PDFParse?: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text?: string }> };
    } | null;
    if (!mod?.PDFParse) {
      return { step: 1, source: "pdf-parse", succeeded: false, reason: "dependency-missing" };
    }
    const parser = new mod.PDFParse({ data: input.buffer });
    const parsed = await parser.getText();
    const text = (parsed.text ?? "").trim();
    if (!text) {
      return { step: 1, source: "pdf-parse", succeeded: false, reason: "no-text-layer" };
    }
    // Tira primeiro identificador que aparecer.
    const id = extractIdentifiers(text);
    const fields: Partial<ExtractedFields> = { rawText: text.slice(0, 4000) };
    if (id.kind === "doi")  fields.doi  = id.value!;
    if (id.kind === "isbn") fields.isbn = id.value!;
    if (id.kind === "issn") fields.issn = id.value!;
    return { step: 1, source: "pdf-parse", succeeded: true, confidence: 0.90, fields, costCents: 0 };
  } catch {
    // PDF corrompido/ilegível ou sem texto: sem camada aproveitável — segue a cascata.
    return { step: 1, source: "pdf-parse", succeeded: false, reason: "no-text-layer" };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Passo 2 — QR code (jsQR, lazy). Decodifica imagens em buffer (PNG/JPEG).
// ─────────────────────────────────────────────────────────────────────────
export const qrReader: Adapter = async (input) => {
  try {
    const jsqrMod = await import("jsqr" as string).catch(() => null) as { default?: unknown; __default?: unknown } | null;
    const pngMod = await import("pngjs" as string).catch(() => null) as { PNG?: { sync: { read: (b: Buffer) => { width: number; height: number; data: Uint8Array } } } } | null;

    if (!jsqrMod || !pngMod?.PNG) {
      return { step: 2, source: "jsqr", succeeded: false, reason: "dependency-missing" };
    }
    // Cluster C — typings ausentes no ESM do jsqr; tratamos como um
    // callable `(data: Uint8ClampedArray, w: number, h: number) => { data: string } | null`.
    type JsQRFn = (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
    const jsQR: JsQRFn = ((jsqrMod.default ?? jsqrMod.__default) as unknown as JsQRFn);
    const png = pngMod.PNG.sync.read(input.buffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    if (!code) {
      return { step: 2, source: "jsqr", succeeded: false, reason: "no-qr-found" };
    }
    return {
      step: 2, source: "jsqr", succeeded: true, confidence: 0.99,
      fields: { qrPayload: code.data }, costCents: 0,
    };
  } catch {
    // Imagem indecodificável (ex.: não-PNG) ou jsQR falhou: para a cascata,
    // isso é simplesmente "nenhum QR encontrado" — o orquestrador segue.
    return { step: 2, source: "jsqr", succeeded: false, reason: "no-qr-found" };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Passo 3 — identificador (DOI / ISBN / ISSN)
// Estratégia: cada rede (crossref/portal-issn/google-books) é tentada;
// primeira que resolve vence. Sem chave de API — endpoints públicos.
// ─────────────────────────────────────────────────────────────────────────
async function resolveDoi(doi: string): Promise<Partial<ExtractedFields> | null> {
  const r = await safeFetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!r || !r.ok) return null;
  try {
    const body = await r.json() as { message?: { title?: string[]; issued?: { "date-parts"?: number[][] } } };
    const title = body.message?.title?.[0];
    const year  = body.message?.issued?.["date-parts"]?.[0]?.[0];
    const out: Partial<ExtractedFields> = { doi };
    if (title) out.title = title.slice(0, 240);
    if (typeof year === "number") out.year = year;
    return out;
  } catch { return null; }
}

async function resolveIssn(issn: string): Promise<Partial<ExtractedFields> | null> {
  const r = await safeFetch(`https://portal.issn.org/resource/issn/${encodeURIComponent(issn)}`);
  if (!r || !r.ok) return null;
  try {
    const html = await r.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    const fields: Partial<ExtractedFields> = { issn };
    if (title) fields.title = title.slice(0, 240);
    return fields;
  } catch { return null; }
}

async function resolveIsbn(isbn: string): Promise<Partial<ExtractedFields> | null> {
  const r = await safeFetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
  if (!r || !r.ok) return null;
  try {
    const body = await r.json() as { items?: Array<{ volumeInfo?: { title?: string; publishedDate?: string; authors?: string[] } }> };
    const first = body.items?.[0]?.volumeInfo;
    if (!first) return null;
    const fields: Partial<ExtractedFields> = { isbn };
    if (first.title) fields.title = first.title.slice(0, 240);
    if (first.publishedDate && /^\d{4}/.test(first.publishedDate)) {
      fields.year = Number(first.publishedDate.slice(0, 4));
    }
    return fields;
  } catch { return null; }
}

export const idResolver: Adapter = async (input) => {
  const haystack = (input.buffer?.toString("utf8") ?? "").slice(0, 64_000);
  const id = extractIdentifiers(haystack);
  if (id.kind === null) {
    return { step: 3, source: "crossref", succeeded: false, reason: "no-id" };
  }
  let fields: Partial<ExtractedFields> | null = null;
  let source: StepSource = "crossref";
  if (id.kind === "doi")  { fields = await resolveDoi(id.value!);  source = "crossref"; }
  if (id.kind === "issn") { fields = await resolveIssn(id.value!); source = "portal-issn"; }
  if (id.kind === "isbn") { fields = await resolveIsbn(id.value!); source = "google-books"; }
  if (!fields) {
    return { step: 3, source, succeeded: false, reason: `lookup-failed:${id.kind}`, costCents: 0 };
  }
  return { step: 3, source, succeeded: true, confidence: id.kind === "doi" ? 0.95 : 0.85, fields, costCents: 0 };
};

// ─────────────────────────────────────────────────────────────────────────
// Passo 4 — template aprendido (fingerprint por issuer+layout).
// Bloco 2 backlog — a v1 devolve succeeded=false; template real é Bloco 7.
// ─────────────────────────────────────────────────────────────────────────
export const templateMatch: Adapter = async () => ({
  step: 4, source: "template", succeeded: false, reason: "no-template-loaded",
});

// ─────────────────────────────────────────────────────────────────────────
// Passo 5 — OCR local (Tesseract)
// ─────────────────────────────────────────────────────────────────────────
export const ocrLocal: Adapter = async (input) => {
  // OCR só faz sentido em IMAGENS: tesseract não lê PDF direto (e crasharia).
  if (!input.mimeType.startsWith("image/")) {
    return { step: 5, source: "ocr-tesseract", succeeded: false, reason: "no-image-content" };
  }
  // Gate: o worker do tesseract.js emite erros assíncronos NÃO capturáveis por
  // try/catch que derrubam o processo inteiro. Só habilite (OCR_ENABLED=true)
  // com setup isolado (ex.: subprocess/serviço dedicado).
  if (process.env.OCR_ENABLED !== "true") {
    return { step: 5, source: "ocr-tesseract", succeeded: false, reason: "dependency-missing" };
  }
  try {
    const mod = await import("tesseract.js" as string).catch(() => null) as { createWorker?: (lang?: string) => Promise<{ recognize: (b: Buffer) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> } | null;
    if (!mod?.createWorker) {
      return { step: 5, source: "ocr-tesseract", succeeded: false, reason: "dependency-missing" };
    }
    const worker = await mod.createWorker("por");
    try {
      const { data } = await worker.recognize(input.buffer);
      const text = (data.text ?? "").trim();
      if (!text) return { step: 5, source: "ocr-tesseract", succeeded: false, reason: "low-confidence-empty" };
      const fields: Partial<ExtractedFields> = { rawText: text.slice(0, 4000) };
      const id = extractIdentifiers(text);
      if (id.kind === "doi")  fields.doi  = id.value!;
      if (id.kind === "isbn") fields.isbn = id.value!;
      if (id.kind === "issn") fields.issn = id.value!;
      const year = text.match(/\b(20\d{2}|19\d{2})\b/)?.[1];
      if (year) fields.year = Number(year);
      return { step: 5, source: "ocr-tesseract", succeeded: true, confidence: 0.78, fields, costCents: 0 };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch {
    // OCR falhou (imagem ilegível/truncada): trata como sem texto extraível —
    // o orquestrador segue para o próximo passo (IA).
    return { step: 5, source: "ocr-tesseract", succeeded: false, reason: "low-confidence-empty" };
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Passo 6 — IA
// ─────────────────────────────────────────────────────────────────────────
export const iaExtractor: Adapter = async (_input, prev) => {
  const key = process.env.IA_EXTRACTION_API_KEY;
  const model = process.env.IA_MODEL ?? "plataforma-default";
  if (!key) {
    // Sem chave: passo 6 devolve como "no-op" — orquestrador registra que NÃO
    // resolveu. Sem cústo. UI marca o documento como PENDENTE_REVISAO_HUMANA.
    return {
      step: 6, source: "ia-default", succeeded: false,
      reason: "NO_MODEL_CONFIGURED",
      fields: prev, costCents: 0,
    };
  }
  // Em produção isto chama OpenAI/Anthropic com `prev` como contexto para
  // economizar tokens. Aqui só estruturamos a interface.
  return {
    step: 6, source: "ia-strong", succeeded: true, confidence: 0.74,
    fields: prev, costCents: 12, model,
  };
};
