// src/app/api/_diag/route.ts
// TEMPORÁRIO — diagnóstico de caracteres não-ASCII nas env vars (o bug do
// ByteString). Reporta comprimento e posições de qualquer char >255.
// NÃO expõe valores sensíveis (só posições/códigos). Remover depois.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function analyze(val: string | undefined) {
  if (val == null) return { present: false };
  const bad: Array<{ index: number; code: number }> = [];
  for (let i = 0; i < val.length; i++) {
    const c = val.charCodeAt(i);
    if (c > 255) bad.push({ index: i, code: c });
  }
  return { present: true, length: val.length, nonAscii: bad };
}

export async function GET() {
  const vars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_FRIO",
    "R2_BUCKET_QUENTE",
    "DATABASE_URL",
    "IA_EXTRACTION_API_KEY",
    "EMAIL_FROM",
  ];
  const out: Record<string, unknown> = {};
  for (const v of vars) out[v] = analyze(process.env[v]);
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
