// src/app/c/[user_id]/page.tsx
// ROTA PÚBLICA (sem auth) — perfil público opt-in em /c/[user_id].
//
// REGRA: paralela a /verificar/[codigo] — mesma lógica de privacidade:
//   - middleware não inclui "/c" em PROTECTED_PREFIXES.
//   - 404 quando public_profile_enabled = false.
//   - nunca expõe email, cpf, birth, planTier, quotas.

import { createClient } from "@/lib/supabase/server";
import {
  buildPublicProfileView,
  filterPublicItems,
  isValidUserIdOrSlug,
  PUBLIC_PROFILE_LIMIT,
} from "@/lib/domain/public-profile";
import { PUBLIC_DISCLAIMER } from "@/lib/domain/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil público — Trajetória360" };

interface UserRow {
  id: string;
  full_name: string;
  citation_name: string | null;
  lattes_id: string | null;
  orcid: string | null;
  public_slug: string | null;
  public_profile_enabled: boolean;
  public_profile_enabled_at: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  item_type: string;
  title: string;
  title_en: string | null;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  issn: string | null;
  qualis_stratum: string | null;
  flagged_lattes: boolean | null;
  flagged_innovation: boolean | null;
}

export default async function PublicProfilePage(props: {
  params: Promise<{ user_id: string }>;
}) {
  const { user_id } = await props.params;
  const query = (user_id ?? "").trim();

  if (!isValidUserIdOrSlug(query)) {
    return <NotFound />;
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
    .maybeSingle<UserRow>();

  if (!userRow || userRow.public_profile_enabled !== true) {
    return <NotFound />;
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
    ((rawItems ?? []) as ItemRow[]).map((r) => ({
      id: r.id,
      itemType: r.item_type,
      title: r.title,
      titleEn: r.title_en,
      year: r.year,
      doi: r.doi,
      isbn: r.isbn,
      issn: r.issn,
      qualisStratum: r.qualis_stratum,
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-stone-300 pb-6">
        <h1 className="font-serif text-3xl text-stone-900">
          {view.profile?.citationName ?? view.profile?.fullName}
        </h1>
        {view.profile?.lattesId ? (
          <p className="mt-2 text-sm text-stone-600">
            Lattes: <span className="font-mono">{view.profile.lattesId}</span>
          </p>
        ) : null}
        {view.profile?.orcid ? (
          <p className="text-sm text-stone-600">
            ORCID: <span className="font-mono">{view.profile.orcid}</span>
          </p>
        ) : null}
      </header>

      <p className="mt-6 text-xs italic text-stone-500">{view.disclaimer}</p>

      <section className="mt-8">
        <h2 className="font-serif text-xl text-stone-800">
          Trajetória ({items.length} {items.length === 1 ? "item" : "itens"})
        </h2>

        <ul className="mt-4 space-y-4">
          {(view.items ?? []).map((it) => (
            <li key={it.id} className="border-l-2 border-stone-300 pl-4">
              <p className="font-serif text-stone-900">
                {it.title}
                {it.titleEn ? (
                  <span className="ml-2 text-sm italic text-stone-500">
                    / {it.titleEn}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-stone-600">
                {it.year ?? "s/ ano"} · {it.itemType}
                {it.doi ? (
                  <span className="ml-2 rounded bg-stone-100 px-2 py-0.5 font-mono text-[10px]">
                    DOI
                  </span>
                ) : null}
                {it.qualisStratum ? (
                  <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                    Qualis {it.qualisStratum}
                  </span>
                ) : null}
                {it.flaggedLattes ? (
                  <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] text-blue-800">
                    Lattes
                  </span>
                ) : null}
                {it.flaggedInnovation ? (
                  <span className="ml-2 rounded bg-purple-50 px-2 py-0.5 text-[10px] text-purple-800">
                    Inovação
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
        {PUBLIC_DISCLAIMER}
        <br />
        <span className="font-mono">{view.generatedAt}</span>
      </footer>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-serif text-2xl text-stone-900">
        Página não disponível
      </h1>
      <p className="mt-4 text-sm italic text-stone-600">
        Esta página não está disponível. O perfil é privado ou não existe.
      </p>
    </main>
  );
}
