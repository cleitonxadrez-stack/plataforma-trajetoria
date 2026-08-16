// src/app/exportar/documentos/page.tsx
// Seleção de documentos para o PDF único, AGRUPADOS POR ÁREA. Escolha só os
// comprovantes que quer imprimir; o PDF sai apenas com os selecionados.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DocPdfSelector, type SelDoc, type DocGroup } from "@/components/DocPdfSelector";
import { classifyCv, CV_SECTIONS, type CvSectionKey } from "@/lib/domain/cv-sections";

export const metadata = { title: "PDF de documentos — Trajetória360" };
export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

const AVULSOS = "AVULSOS";

export default async function ExportarDocumentosPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/documentos");

  const [{ data: docRows }, { data: evRows }, { data: itemRows }] = await Promise.all([
    sb.from("documents")
      .select("id, registry_code, original_filename, storage_key_original, registered_at")
      .eq("user_id", u.user.id).is("deleted_at", null)
      .order("registered_at", { ascending: true }),
    sb.from("evidences").select("item_id, document_id").is("deleted_at", null),
    sb.from("academic_items").select("id, title, item_type, natureza")
      .eq("user_id", u.user.id).is("deleted_at", null),
  ]);

  // document_id → item (primeiro vínculo) para classificar a área.
  const itemByDoc = new Map<string, string>();
  for (const e of (evRows ?? []) as { item_id: string; document_id: string }[])
    if (!itemByDoc.has(e.document_id)) itemByDoc.set(e.document_id, e.item_id);
  const itemById = new Map(
    ((itemRows ?? []) as { id: string; title: string; item_type: string; natureza: string | null }[])
      .map((i) => [i.id, i]),
  );

  function areaKey(docId: string): string {
    const it = itemById.get(itemByDoc.get(docId) ?? "");
    if (!it) return AVULSOS;
    return classifyCv({ title: it.title, itemType: it.item_type, natureza: it.natureza });
  }

  // Agrupa documentos por área, na ordem canônica do currículo.
  const byKey = new Map<string, SelDoc[]>();
  for (const d of (docRows ?? []) as { id: string; registry_code: string | null; original_filename: string | null; storage_key_original: string | null; registered_at: string | null }[]) {
    if (!d.storage_key_original) continue;
    const doc: SelDoc = {
      id: d.id,
      code: d.registry_code ?? `PLT-${d.id.slice(0, 8).toUpperCase()}`,
      filename: d.original_filename ?? `documento-${d.id.slice(0, 8)}.pdf`,
      date: fmtDate(d.registered_at),
    };
    const k = areaKey(d.id);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(doc);
  }

  const order: string[] = [...CV_SECTIONS.map((s) => s.key), AVULSOS];
  const labelOf = (k: string) =>
    CV_SECTIONS.find((s) => s.key === (k as CvSectionKey))?.label ?? "Documentos avulsos";
  const groups: DocGroup[] = order
    .filter((k) => byKey.has(k))
    .map((k) => ({ key: k, label: labelOf(k), docs: byKey.get(k)! }));

  const total = groups.reduce((n, g) => n + g.docs.length, 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Exportar</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-2">PDF de documentos</h1>
      <p className="text-stone-600 max-w-2xl mb-6">
        Organizados <strong>por área</strong>. Marque apenas os comprovantes que deseja imprimir —
        geramos um único PDF com <strong>capa e índice</strong>, só com os selecionados.
      </p>

      {total === 0
        ? <section className="pd-block"><p className="text-stone-700">Você ainda não tem documentos anexados. Envie comprovantes no Cofre para gerar o PDF.</p></section>
        : <DocPdfSelector groups={groups} />}
    </main>
  );
}
