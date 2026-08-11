// app/api/dossies/[id]/pdf/route.ts
// GET  /api/dossies/[id]/pdf — gera (síncrono se possível) o PDF do dossiê.
// POST /api/dossies/[id]/pdf — enfileira job `pdf-generate` e devolve 202.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPdfDocument, renderDossier } from "@/lib/domain/pdf-dossier";
import { rankItemsAgainstMethod } from "@/lib/domain/dossier";
import { TRAJETORIA_V1 } from "@/lib/domain/methodology";
import { enqueue } from "@/lib/queue/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code: number) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

/** GET síncrono até 5 s (a v1 renderiza inline). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: ures } = await sb.auth.getUser();
  if (!ures?.user) return bad("não autenticado", 401);

  const { data: dossier, error: ed } = await sb
    .from("dossiers")
    .select("id, title, purpose, method_id")
    .eq("id", id)
    .eq("user_id", ures.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (ed || !dossier) return bad("dossiê não encontrado", 404);

  // Carrega método (ranking_methods) — se ausente, cai em TRAJETORIA_V1.
  const { data: method } = await sb
    .from("ranking_methods")
    .select("id, name, version")
    .eq("id", (dossier as { method_id: string }).method_id)
    .maybeSingle() as { data: { id: string; name: string; version: number } | null };

  // Carrega itens do usuário.
  const { data: items } = await sb
    .from("academic_items")
    .select("id, title, year, item_type, evidence_status")
    .eq("user_id", ures.user.id)
    .is("deleted_at", null) as { data: Array<{ id: string; title: string; year: number | null; item_type: string; evidence_status: string }> | null };

  // Render sincrônico do PDF/placeholder. Para PRODUÇÃO, troque por enqueue.
  const lite = (items ?? []).map((i) => ({
    id: i.id,
    itemType: (i as { item_type: string }).item_type,
    title: (i as { title: string }).title ?? "",
    year: (i as { year: number | null }).year ?? null,
    qualis: null,
    authorCount: 1,
    evidenceStatus: (((i as { evidence_status: string }).evidence_status ?? "COMPROVADO").toUpperCase().startsWith("COMPROVADO")
      ? "COMPROVADO"
      : "SEM_COMPROVANTE") as "COMPROVADO" | "SEM_COMPROVANTE" | "COM_COMPROVANTE_PARCIAL",
  }));
  const ranked = rankItemsAgainstMethod(lite, TRAJETORIA_V1).ranked;
  const tree = buildPdfDocument({
    meta: {
      id: (dossier as { id: string }).id,
      title: (dossier as { title: string }).title,
      purpose: (dossier as { purpose?: string | null }).purpose ?? null,
      methodName: method?.name ?? TRAJETORIA_V1.name!,
      methodVersion: method?.version ?? TRAJETORIA_V1.version!,
      generatedAt: new Date().toISOString(),
    },
    categories: TRAJETORIA_V1.categories ?? [],
    ranked,
  });

  const rendered = await renderDossier(tree);
  return new NextResponse(new Uint8Array(rendered.bytes), {
    status: 200,
    headers: {
      "Content-Type": rendered.mimeType,
      "Content-Disposition": `inline; filename="dossie-${id}.${rendered.engine === "@react-pdf/renderer" ? "pdf" : "json"}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** POST enfileira e devolve 202. Worker em scripts/worker.ts processa. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: ures } = await sb.auth.getUser();
  if (!ures?.user) return bad("não autenticado", 401);

  // Enfileira — retry e métricas vêm dos pg-boss.
  try {
    await enqueue("pdf-generate", { dossierId: id, userId: ures.user.id });
  } catch (e) {
    return bad(`enqueue falhou: ${(e as Error).message}`, 500);
  }
  return NextResponse.json({ ok: true, queued: true, dossierId: id }, { status: 202 });
}
