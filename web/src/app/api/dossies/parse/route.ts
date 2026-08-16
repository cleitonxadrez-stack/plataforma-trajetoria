// app/api/dossies/parse/route.ts
// Recebe PDF de edital, extrai texto via pdf-parse, e devolve proposta de metodologia.
//
// Em produção: este endpoint FIQUE LIGADO AO JOB pg-boss "parse-edital"
// (architecture §10 / 05-fluxos Fluxo 4). Aqui agora é implementação
// direta com pdf-parse. Retorna Mesma assinatura de parseEdital().

import { NextResponse } from "next/server";
import { parseEdital } from "@/lib/domain/methodology";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Segurança: só usuários autenticados podem processar PDFs (evita abuso/DoS).
    const sb = await createClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    }

    const ct = req.headers.get("content-type") ?? "";
    if (!ct.startsWith("multipart/form-data")) {
      return NextResponse.json({ error: "esperado multipart/form-data" }, { status: 415 });
    }
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "arquivo > 50MB" }, { status: 413 });
    }
    if (!file.type.includes("pdf")) {
      return NextResponse.json({ error: "somente PDF" }, { status: 415 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let text = "";
    try {
      // pdf-parse é dep opcional. Se não estiver instalado, dynamic import
      // retorna null e o parse cai em texto vazio (não quebra o build).
      const mod = await import("pdf-parse" as string).catch(() => null) as { default?: (b: Buffer) => Promise<{ text?: string }> } | null;
      if (mod?.default) {
        const parsed = await mod.default(buf);
        text = parsed.text ?? "";
      } else {
        text = buf.toString("utf8");
      }
    } catch (e) {
      return NextResponse.json({ error: `falha na extração de texto: ${String(e)}` }, { status: 422 });
    }

    const nameFromFile = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 80);
    const result = parseEdital(text, { name: nameFromFile });
    return NextResponse.json({
      title: nameFromFile,
      status: result.status,
      windowYears: result.method.windowYears,
      applyCaps: result.method.applyCaps,
      coauthorRule: result.method.coauthorRule,
      rules: result.rules,
      diagnostics: result.diagnostics,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
