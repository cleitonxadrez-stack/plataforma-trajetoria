// src/app/importar/page.tsx
// ROTA PROTEGIDA — middleware em /importar exige auth (vide middleware.ts).
// UI do importador de XML Lattes da Plataforma CNPq / Lattes CNPq 2022.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LattesImporter } from "@/components/LattesImporter";

export const metadata = { title: "Importar Lattes — Trajetória360" };
export const dynamic = "force-dynamic";

interface MealItemLite {
  id: string;
  title: string;
  item_type: string;
  year: number;
  flagged_innovation: boolean;
}

export default async function ImportarPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/importar");

  // Pré-visualiza o que já está importado — UX de expectativa.
  const { data: existing } = await sb
    .from("academic_items")
    .select("id, title, item_type, year, flagged_innovation")
    .eq("user_id", u.user.id)
    .is("deleted_at", null)
    .order("year", { ascending: false })
    .limit(50);
  const existingList = (existing ?? []) as MealItemLite[];

  // Pré-render do plano: serve apenas para texto explicativo na UI.
  // A UI envia o arquivo separadamente para a API /api/lattes/import.
  const { data: lastJob } = await sb
    .from("processing_jobs")
    .select("id, job_type, status, error_message, created_at, finished_at")
    .eq("user_id", u.user.id)
    .eq("job_type", "lattes-import")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <p className="text-xs uppercase tracking-[.14em] text-[#102A43]/70 mb-2">
        Trajetória
      </p>
      <header className="mb-6">
        <h1 className="serif text-3xl text-[#102A43]">Importar currículo Lattes</h1>
        <p className="text-sm text-stone-600 mt-2">
          Faça upload do XML gerado pela Plataforma Lattes (CNPq). Os itens serão
          registrados como <strong>autodeclarados</strong>; você adiciona evidências
          individualmente depois.
        </p>
      </header>

      <section className="card mb-6">
        <h2 className="serif text-lg text-[#102A43] mb-2">Como obter seu XML</h2>
        <ol className="text-sm text-stone-700 space-y-2 list-decimal list-inside">
          <li>
            Abra seu currículo em <a className="underline text-[#102A43]" href="https://www.lattes.cnpq.br" target="_blank" rel="noopener noreferrer">lattes.cnpq.br</a> e
            clique no botão <strong>Exportar</strong> (ícone no topo).
          </li>
          <li>
            Na janela <em>“Exportar currículo para RTF ou XML”</em>, escolha
            <strong className="text-[#102A43]"> XML</strong> (⚠️ <strong>não</strong> RTF) e confirme.
          </li>
          <li>Descompacte o ZIP baixado e suba o arquivo <code className="font-mono">.xml</code> aqui (≤ 10 MB).</li>
        </ol>
        <p className="text-xs text-stone-500 mt-3">
          Por que XML? Ele é estruturado — importamos cada artigo, livro, curso e formação
          com título, ano e DOI. O RTF é só para impressão.
        </p>
      </section>

      <section className="card mb-6">
        <h2 className="serif text-lg text-[#102A43] mb-2">Upload do XML</h2>
        <LattesImporter endpoint="/api/lattes/import" />
      </section>

      {existingList.length > 0 && (
        <section className="card">
          <h2 className="serif text-lg text-[#102A43] mb-2">
            Já importados ({existingList.length} de até 50 mais recentes)
          </h2>
          <ul className="space-y-1">
            {existingList.map((it) => (
              <li key={it.id} className="text-sm flex justify-between">
                <span className="text-[#102A43] truncate">{it.title}</span>
                <span className="text-stone-500 text-xs whitespace-nowrap ml-3">
                  {it.item_type} · {it.year}
                  {it.flagged_innovation && <span className="ml-2 text-[#a15a13]">inovação</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link href="/trajetoria" className="text-sm text-[#102A43] underline">
              Ver trajetória completa →
            </Link>
          </p>
        </section>
      )}

      {lastJob && (
        <p className="mt-6 text-xs text-stone-500">
          Último processo de import Lattes: <span className="font-mono">{(lastJob as { id: string }).id.slice(0, 8)}</span>
          {" · "}
          <span className="font-mono">{(lastJob as { status: string }).status}</span>
          {((lastJob as { error_message?: string | null }).error_message ?? null) && (
            <span className="text-[#8a2a1f]"> — {(lastJob as { error_message: string }).error_message}</span>
          )}
        </p>
      )}
    </main>
  );
}
