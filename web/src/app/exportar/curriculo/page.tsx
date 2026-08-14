// src/app/exportar/curriculo/page.tsx
// Currículo ABERTO estilo Lattes — puxa academic_items da plataforma, agrupa
// área por área e mostra a descrição de cada item com marcadores R (registro)
// e P (publicação) ao lado. Imprimível como PDF (window.print()).

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { groupIntoCvSections, cvMarkers, type CvItem } from "@/lib/domain/cv-sections";

export const metadata = { title: "Currículo — Trajetória360" };
export const dynamic = "force-dynamic";

interface Row {
  id: string; title: string; year: number | null; item_type: string;
  natureza: string | null; origin: string; verification_level: string;
  doi: string | null; isbn: string | null; issn: string | null;
}

export default async function CurriculoPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/curriculo");

  const { data: pdata } = await sb
    .from("personal_data")
    .select("full_name,citation_name,birth_date,birth_place,lattes_id,orcid,email,phone,address,address_prof,languages")
    .eq("user_id", u.user.id)
    .maybeSingle<{
      full_name: string | null; citation_name: string | null; birth_date: string | null;
      birth_place: string | null; lattes_id: string | null; orcid: string | null;
      email: string | null; phone: string | null; address: string | null;
      address_prof: string | null; languages: { lang: string; detail: string }[] | null;
    }>();

  const { data: rows } = await sb
    .from("academic_items")
    .select("id,title,year,item_type,natureza,origin,verification_level,doi,isbn,issn")
    .eq("user_id", u.user.id)
    .is("deleted_at", null)
    .order("year", { ascending: false });

  const list = (rows ?? []) as Row[];

  // contagem de evidências por item (coluna correta: item_id)
  const ids = list.map((r) => r.id);
  const evCount = new Map<string, number>();
  if (ids.length) {
    const { data: evs } = await sb
      .from("evidences").select("item_id").in("item_id", ids).is("deleted_at", null);
    for (const e of (evs ?? []) as { item_id: string }[])
      evCount.set(e.item_id, (evCount.get(e.item_id) ?? 0) + 1);
  }

  const items: CvItem[] = list.map((r) => ({
    id: r.id, title: r.title, year: r.year, itemType: r.item_type,
    natureza: r.natureza, origin: r.origin, verificationLevel: r.verification_level,
    evidenceCount: evCount.get(r.id) ?? 0,
    doi: r.doi, isbn: r.isbn, issn: r.issn,
  }));

  const sections = groupIntoCvSections(items);
  const total = items.length;
  const comprovados = items.filter((i) => cvMarkers(i).some((m) => m.code === "R")).length;
  const nome =
    pdata?.full_name ??
    (u.user.user_metadata?.full_name as string | undefined) ??
    (u.user.email ?? "").split("@")[0];
  const nascimento = [pdata?.birth_date, pdata?.birth_place].filter(Boolean).join(" — ");
  const cvLangs: { lang: string; detail: string }[] = Array.isArray(pdata?.languages)
    ? pdata!.languages
    : typeof pdata?.languages === "string"
      ? (() => { try { const a = JSON.parse(pdata!.languages as unknown as string); return Array.isArray(a) ? a : []; } catch { return []; } })()
      : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Barra de ações — não sai na impressão */}
      <div className="no-print flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
        <div className="flex gap-2">
          <a href="/api/curriculo/documentos" className="btn-secondary" target="_blank" rel="noopener noreferrer">
            📎 PDF com todos os documentos
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Documento do currículo */}
      <article className="cv-paper card">
        <header className="cv-head">
          <h1 className="serif" style={{ fontSize: 28, color: "#0f2942" }}>{nome}</h1>
          <p className="text-sm text-stone-600">Currículo acadêmico — gerado pelo Trajetória360</p>
          <div className="cv-id">
            {nascimento && <div className="cv-id-row"><b>Nascimento:</b> {nascimento}</div>}
            {pdata?.citation_name && <div className="cv-id-row"><b>Citações:</b> {pdata.citation_name}</div>}
            {pdata?.lattes_id && <div className="cv-id-row"><b>Lattes:</b> {pdata.lattes_id}</div>}
            {pdata?.orcid && <div className="cv-id-row"><b>ORCID:</b> {pdata.orcid.replace("https://orcid.org/", "")}</div>}
            {pdata?.email && <div className="cv-id-row"><b>E-mail:</b> {pdata.email}</div>}
            {pdata?.phone && <div className="cv-id-row"><b>Telefone:</b> {pdata.phone}</div>}
            {pdata?.address && <div className="cv-id-row"><b>Endereço:</b> {pdata.address}</div>}
            {cvLangs.length > 0 && (
              <div className="cv-id-row"><b>Idiomas:</b> {cvLangs.map((l) => l.lang).join(", ")}</div>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            {total} itens · {comprovados} com registro/comprovante
          </p>
          <p className="cv-legend text-xs text-stone-500 mt-2">
            Legenda: <strong>R</strong> = há registro/comprovante anexado (documento, ISBN…) ·{" "}
            <strong>P</strong> = publicação
          </p>
        </header>

        {sections.length === 0 && (
          <p className="text-stone-600 mt-6">
            Nenhum item ainda. <Link href="/importar" className="underline text-[#0d6b52]">Importe seu Lattes</Link> ou envie documentos.
          </p>
        )}

        {sections.map((sec) => (
          <section key={sec.key} className="cv-section">
            <h2 className="cv-section-title serif">{sec.label} <span className="cv-count">({sec.items.length})</span></h2>
            <ul className="cv-list">
              {sec.items.map((it) => {
                const marks = cvMarkers(it);
                return (
                  <li key={it.id} className="cv-item">
                    <span className="cv-year">{it.year || "—"}</span>
                    <span className="cv-desc">
                      {it.title}
                      {it.natureza && <span className="cv-nature"> · {it.natureza}</span>}
                    </span>
                    <span className="cv-marks">
                      {marks.map((m) => (
                        <span key={m.code} className={`cv-mark cv-mark-${m.code}`} title={m.title}>{m.code}</span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}
