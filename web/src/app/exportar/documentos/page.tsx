// src/app/exportar/documentos/page.tsx
// Seleção de documentos para o PDF único. Escolha só os comprovantes que
// quer imprimir; o PDF sai apenas com os selecionados (capa + índice).

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DocPdfSelector, type SelDoc } from "@/components/DocPdfSelector";

export const metadata = { title: "PDF de documentos — Trajetória360" };
export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export default async function ExportarDocumentosPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/documentos");

  const { data: rows } = await sb
    .from("documents")
    .select("id, registry_code, original_filename, storage_key_original, registered_at")
    .eq("user_id", u.user.id).is("deleted_at", null)
    .order("registered_at", { ascending: true });

  const docs: SelDoc[] = (rows ?? [])
    .filter((d) => !!(d as { storage_key_original: string | null }).storage_key_original)
    .map((d) => {
      const r = d as { id: string; registry_code: string | null; original_filename: string | null; registered_at: string | null };
      return {
        id: r.id,
        code: r.registry_code ?? `PLT-${r.id.slice(0, 8).toUpperCase()}`,
        filename: r.original_filename ?? `documento-${r.id.slice(0, 8)}.pdf`,
        date: fmtDate(r.registered_at),
      };
    });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Exportar</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-2">PDF de documentos</h1>
      <p className="text-stone-600 max-w-2xl mb-6">
        Marque apenas os comprovantes que deseja imprimir. Geramos um único PDF com
        <strong> capa e índice</strong>, contendo só os documentos selecionados.
      </p>

      {docs.length === 0
        ? <section className="pd-block"><p className="text-stone-700">Você ainda não tem documentos anexados. Envie comprovantes no Cofre para gerar o PDF.</p></section>
        : <DocPdfSelector docs={docs} />}
    </main>
  );
}
