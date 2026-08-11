// app/api/verificar/[codigo]/route.ts
// API pública de verificação — mesma consulta da página, mas em JSON.
// Útil para integrações / bots / scripts de comissão de avaliação.

import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { isValidRegistryCode } from "../../../../lib/domain/registry";
import {
  buildVerificationView,
  NOT_FOUND_DISCLAIMER,
  AUTHENTICITY_DISCLAIMER,
} from "../../../../lib/domain/verificar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const code = (codigo ?? "").toUpperCase();

  if (!isValidRegistryCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        registryCode: code,
        error: "FORMATO_INVALIDO",
        message: "Código fora do padrão PLT-AAAA-XXXX-XXXX.",
        disclaimer: AUTHENTICITY_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const sb = await createClient();
  const { data: row } = await sb
    .from("documents")
    .select("registry_code, visibility, original_filename, mime_type, created_at, sha256")
    .eq("registry_code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      {
        ok: false,
        registryCode: code,
        error: "NAO_ENCONTRADO",
        message: NOT_FOUND_DISCLAIMER,
        disclaimer: AUTHENTICITY_DISCLAIMER,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const view = buildVerificationView({
    registryCode: String(row.registry_code),
    visibility: ((row.visibility ?? "PRIVADO") as "PRIVADO" | "PUBLICO"),
    originalFilename: row.original_filename ?? null,
    mimeType: row.mime_type ?? null,
    registeredAt: String(row.created_at),
    sha256: row.sha256 ?? null,
  });

  return NextResponse.json(
    {
      ok: view.ok,
      registryCode: view.registryCode,
      filename: view.filename,
      category: view.category,
      registeredAtBR: view.registeredAtBR,
      fingerprint: view.fingerprint,
      disclaimer: view.authenticityStatement,
      error: view.error ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        // Permite que esta rota seja consultada por qualquer origem
        // (bots, integrações). É uma API pública por design.
      },
    },
  );
}
