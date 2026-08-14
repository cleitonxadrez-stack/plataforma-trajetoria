// src/app/api/documentos/[id]/route.ts
// GET /api/documentos/[id] — baixar/abrir o comprovante do próprio usuário.
// Gera uma presigned URL curta no R2 (bucket frio) e redireciona (302).
// RLS garante que só o dono acessa o documento.

import { createClient } from "@/lib/supabase/server";
import { presignedUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new Response("Não autenticado.", { status: 401 });

  const { data: doc } = await sb
    .from("documents")
    .select("id, storage_key_original")
    .eq("id", id)
    .eq("user_id", u.user.id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; storage_key_original: string }>();

  if (!doc?.storage_key_original) {
    return new Response("Documento não encontrado.", { status: 404 });
  }

  const url = await presignedUrl({ bucket: "frio", key: doc.storage_key_original, expiresInSec: 300 });
  return Response.redirect(url, 302);
}
