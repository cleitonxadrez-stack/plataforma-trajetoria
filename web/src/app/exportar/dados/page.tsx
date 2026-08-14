// src/app/exportar/dados/page.tsx
// Dados pessoais — base para cadastros. Cada campo tem botão de copiar.
// Futuro: anexar RG, CPF, comprovante de endereço, título de eleitor (cofre pessoal).

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyField } from "@/components/CopyField";

export const metadata = { title: "Dados pessoais — Trajetória360" };
export const dynamic = "force-dynamic";

interface PData {
  full_name: string | null; citation_name: string | null; birth_date: string | null;
  birth_place: string | null; lattes_id: string | null; orcid: string | null;
  cpf: string | null; rg: string | null; voter_id: string | null;
  email: string | null; email_alt: string | null; phone: string | null;
  address: string | null; address_prof: string | null;
  facebook: string | null; linkedin: string | null;
  languages: { lang: string; detail: string }[] | null;
}

function normLangs(v: unknown): { lang: string; detail: string }[] {
  if (Array.isArray(v)) return v as { lang: string; detail: string }[];
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}

export default async function DadosPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/dados");

  const { data } = await sb
    .from("personal_data")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle<PData>();

  const p = data;
  const langs = normLangs(p?.languages);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-1">Dados pessoais</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-2">Seus dados para cadastros</h1>
      <p className="text-stone-600 max-w-2xl mb-6">
        Salvos uma vez, prontos para copiar sempre que um edital ou cadastro pedir. Clique em <strong>Copiar</strong> em cada campo.
      </p>

      {!p ? (
        <section className="card">
          <p className="text-stone-700">Ainda não há dados cadastrados.</p>
        </section>
      ) : (
        <>
          <section className="card mb-4">
            <h2 className="serif text-lg text-[#0f2942] mb-3">Identificação</h2>
            <CopyField label="Nome completo" value={p.full_name} />
            <CopyField label="Nome em citações" value={p.citation_name} />
            <CopyField label="Nascimento" value={[p.birth_date, p.birth_place].filter(Boolean).join(" — ") || null} />
            <CopyField label="CPF" value={p.cpf} />
            <CopyField label="RG" value={p.rg} />
            <CopyField label="Título de eleitor" value={p.voter_id} />
            <CopyField label="Lattes ID" value={p.lattes_id} />
            <CopyField label="ORCID" value={p.orcid} />
          </section>

          <section className="card mb-4">
            <h2 className="serif text-lg text-[#0f2942] mb-3">Contato</h2>
            <CopyField label="E-mail" value={p.email} />
            <CopyField label="E-mail alternativo" value={p.email_alt} />
            <CopyField label="Telefone / Celular" value={p.phone} />
            <CopyField label="Endereço residencial" value={p.address} />
            <CopyField label="Endereço profissional" value={p.address_prof} />
            <CopyField label="Facebook" value={p.facebook} />
            <CopyField label="LinkedIn" value={p.linkedin} />
          </section>

          {langs.length > 0 && (
            <section className="card mb-4">
              <h2 className="serif text-lg text-[#0f2942] mb-3">Idiomas</h2>
              {langs.map((l) => (
                <CopyField key={l.lang} label={l.lang} value={l.detail} />
              ))}
            </section>
          )}
        </>
      )}

      <section className="card bg-stone-50">
        <h2 className="serif text-lg text-[#0f2942] mb-1">Em breve</h2>
        <p className="text-sm text-stone-600">
          Anexar os documentos (RG, CPF, comprovante de endereço, título de eleitor) e editar os campos por aqui —
          virando o cofre único dos seus documentos pessoais.
        </p>
      </section>
    </main>
  );
}
