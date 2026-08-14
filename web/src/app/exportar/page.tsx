// src/app/exportar/page.tsx
// Central de exportação: currículo (estilo Lattes), PDF com todos os
// documentos, e dados pessoais para cadastros.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Exportar — Trajetória360" };
export const dynamic = "force-dynamic";

export default async function ExportarPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar");

  const [{ count: itens }, { count: docs }] = await Promise.all([
    sb.from("academic_items").select("id", { count: "exact", head: true })
      .eq("user_id", u.user.id).is("deleted_at", null),
    sb.from("documents").select("id", { count: "exact", head: true })
      .eq("user_id", u.user.id).is("deleted_at", null),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/trajetoria" className="back-link">← Voltar para a Trajetória</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-1">Exportar</p>
      <h1 className="serif text-4xl text-[#102A43] mb-2">Gerar currículo e documentos</h1>
      <p className="text-stone-600 max-w-2xl">
        Puxe tudo o que já está organizado aqui — {itens ?? 0} itens e {docs ?? 0} documentos —
        e exporte no formato que precisar.
      </p>

      <section className="grid sm:grid-cols-2 gap-4 mt-8">
        <Link href="/exportar/curriculo" className="card block hover:shadow-md transition">
          <div className="text-2xl mb-2">📄</div>
          <h2 className="serif text-xl text-[#102A43] mb-1">Currículo (estilo Lattes)</h2>
          <p className="text-sm text-stone-600">
            Currículo aberto, área por área, com a descrição de cada item e marcadores
            <strong> R</strong> (registro/comprovante) e <strong>P</strong> (publicação). Imprima ou salve em PDF.
          </p>
        </Link>

        <a href="/api/curriculo/documentos" target="_blank" rel="noopener noreferrer"
           className="card block hover:shadow-md transition">
          <div className="text-2xl mb-2">📎</div>
          <h2 className="serif text-xl text-[#102A43] mb-1">PDF com todos os documentos</h2>
          <p className="text-sm text-stone-600">
            Junta todos os {docs ?? 0} comprovantes anexados num único PDF, com capa — pronto para anexar em editais.
          </p>
        </a>

        <Link href="/exportar/dados" className="card block hover:shadow-md transition">
          <div className="text-2xl mb-2">🪪</div>
          <h2 className="serif text-xl text-[#102A43] mb-1">Dados pessoais</h2>
          <p className="text-sm text-stone-600">
            Nome, CPF, RG, endereço, título de eleitor… salvos uma vez e com botão de <strong>copiar</strong> para
            preencher cadastros rapidinho.
          </p>
        </Link>

        <Link href="/dossies" className="card block hover:shadow-md transition">
          <div className="text-2xl mb-2">🗂️</div>
          <h2 className="serif text-xl text-[#102A43] mb-1">Dossiê por edital (pontuado)</h2>
          <p className="text-sm text-stone-600">
            Monta um dossiê selecionando itens e pontuando pela metodologia — para editais com barema.
          </p>
        </Link>
      </section>

      <p className="mt-8 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-3">
        Os arquivos são gerados a partir dos seus itens e documentos privados. Confira sempre antes de enviar.
      </p>
    </main>
  );
}
