// app/api/c/[user_id]/route.ts
// API pública paralela a /api/verificar/[codigo].
// Cache-Control public, max-age=300 (snapshot curto, opt-in é raro).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildPublicProfileView,
  filterPublicItems,
  isValidUserIdOrSlug,
  PUBLIC_PROFILE_LIMIT,
} from "@/lib/domain/public-profile";
import { PUBLIC_DISCLAIMER } from "@/lib/domain/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ user_id: string }> }
) {
  const { user_id } = await ctx.params;
  const query = (user_id ?? "").trim();

  if (!isValidUserIdOrSlug(query)) {
    return NextResponse.json(
      {
        ok: false,
        error: "FORMATO_INVALIDO",
        message: "Identificador fora do padrão (UUID ou slug a-z0-9-).",
        disclaimer: PUBLIC_DISCLAIMER,
      },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const sb = await createClient();
  const isUuid = query.includes("-");

  const { data: userRow } = await sb
    .from("users")
    .select(
      "id, full_name, citation_name, lattes_id, orcid, public_slug, public_profile_enabled, public_profile_enabled_at, created_at"
    )
    .or(isUuid ? `id.eq.${query}` : `public_slug.eq.${query}`)
    .is("deleted_at", null)
    .maybeSingle();

  if (!userRow || userRow.public_profile_enabled !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "NAO_ENCONTRADO",
        notFoundMessage:
          "Esta página não está disponível. O perfil é privado ou não existe.",
        disclaimer: PUBLIC_DISCLAIMER,
      },
      { status: 404, headers: CACHE_HEADERS }
    );
  }

  const { data: rawItems } = await sb
    .from("academic_items")
    .select(
      "id, item_type, title, title_en, year, doi, isbn, issn, qualis_stratum, flagged_lattes, flagged_innovation"
    )
    .eq("user_id", userRow.id)
    .eq("visibility", "PUBLICO")
    .eq("verification_level", "VALIDADO")
    .is("deleted_at", null)
    .order("year", { ascending: false })
    .limit(PUBLIC_PROFILE_LIMIT);

  const items = filterPublicItems(
    ((rawItems ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      itemType: String(r.item_type),
      title: String(r.title),
      titleEn: (r.title_en as string | null) ?? null,
      year: (r.year as number | null) ?? null,
      doi: (r.doi as string | null) ?? null,
      isbn: (r.isbn as string | null) ?? null,
      issn: (r.issn as string | null) ?? null,
      qualisStratum: (r.qualis_stratum as string | null) ?? null,
      flaggedLattes: Boolean(r.flagged_lattes),
      flaggedInnovation: Boolean(r.flagged_innovation),
    }))
  );

  const view = buildPublicProfileView({
    user: {
      id: userRow.id,
      fullName: userRow.full_name,
      citationName: userRow.citation_name,
      lattesId: userRow.lattes_id,
      orcid: userRow.orcid,
      publicSlug: userRow.public_slug,
      publicProfileEnabled: Boolean(userRow.public_profile_enabled),
      publicProfileEnabledAt: userRow.public_profile_enabled_at,
      createdAt: userRow.created_at,
    },
    items,
  });

  return NextResponse.json(view, {
    status: 200,
    headers: CACHE_HEADERS,
  });
}
