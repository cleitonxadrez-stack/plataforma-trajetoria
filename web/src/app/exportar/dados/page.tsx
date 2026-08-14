// src/app/exportar/dados/page.tsx
// Dados pessoais — cofre para cadastros. Cada BLOCO tem um botão que copia a
// seção inteira. Futuro: anexar RG, CPF, comprovante de endereço, título…

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyBlock } from "@/components/CopyBlock";
import { PersonalUpload } from "@/components/PersonalUpload";

export const metadata = { title: "Dados pessoais — Trajetória360" };
export const dynamic = "force-dynamic";

function normLangs(v: unknown): { lang: string; detail: string }[] {
  if (Array.isArray(v)) return v as { lang: string; detail: string }[];
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}

export default async function DadosPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/dados");

  const { data } = await sb.from("personal_data").select("*").eq("user_id", u.user.id).maybeSingle();
  const p = (data ?? {}) as Record<string, string | null>;
  const langs = normLangs(p.languages);

  const { data: pdocs } = await sb
    .from("personal_documents").select("id, category, label, document_id").order("category");
  const docs = (pdocs ?? []) as { id: string; category: string; label: string; document_id: string }[];
  const DOC_GROUPS: { key: string; title: string }[] = [
    { key: "IDENTIDADE", title: "Documentos de identidade" },
    { key: "IMPOSTO_RENDA", title: "Imposto de Renda" },
    { key: "ARMAS", title: "Documentos de armas (CR)" },
  ];
  const fotoDoc = docs.find((d) => d.category === "FOTO");
  const assinaturaDoc = docs.find((d) => d.category === "ASSINATURA");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-1">Dados pessoais</p>
      <h1 className="serif text-4xl text-[#102A43] mb-2">Seus dados para cadastros</h1>
      <p className="text-stone-600 max-w-2xl mb-6">
        Salvos uma vez, prontos para reutilizar. Cada bloco tem um botão <strong>Copiar bloco</strong> que
        copia a seção inteira de uma vez.
      </p>

      {!data ? (
        <section className="pd-block"><p className="text-stone-700">Ainda não há dados cadastrados.</p></section>
      ) : (
        <div className="space-y-4">
          <CopyBlock title="Identificação" fields={[
            { label: "Nome completo", value: p.full_name },
            { label: "Nome em citações", value: p.citation_name },
            { label: "Nascimento", value: [p.birth_date, p.birth_place].filter(Boolean).join(" — ") },
            { label: "Sexo", value: p.gender },
            { label: "Estado civil", value: p.marital_status },
            { label: "Escolaridade", value: p.education },
            { label: "Matrícula", value: p.matricula },
          ]} />

          <CopyBlock title="Filiação" fields={[
            { label: "Nome do pai", value: p.father_name },
            { label: "Nome da mãe", value: p.mother_name },
          ]} />

          <CopyBlock title="Documentos" fields={[
            { label: "CPF", value: p.cpf },
            { label: "RG", value: p.rg },
            { label: "Título de eleitor", value: p.voter_id },
            { label: "CNH", value: p.cnh },
            { label: "Documento militar", value: p.military_doc },
            { label: "Lattes ID", value: p.lattes_id },
            { label: "ORCID", value: p.orcid },
          ]} />

          <CopyBlock title="Contato" fields={[
            { label: "E-mail", value: p.email },
            { label: "E-mail alternativo", value: p.email_alt },
            { label: "Telefone / Celular", value: p.phone },
            { label: "Ramal", value: p.ramal },
          ]} />

          <CopyBlock title="Endereço" fields={[
            { label: "Endereço residencial", value: p.address },
            { label: "Endereço profissional", value: p.address_prof },
          ]} />

          <CopyBlock title="Dados sociais e bancários" fields={[
            { label: "PIS/PASEP", value: p.pis },
            { label: "Dados bancários", value: p.bank },
          ]} />

          {langs.length > 0 && (
            <CopyBlock title="Idiomas" fields={langs.map((l) => ({ label: l.lang, value: l.detail }))} />
          )}
        </div>
      )}

      {/* Documentos anexados — com link de download ao lado de cada um */}
      <h2 className="serif text-2xl text-[#102A43] mt-10 mb-3">Documentos anexados</h2>
      <div className="space-y-4">
        {DOC_GROUPS.map((g) => {
          const items = docs.filter((d) => d.category === g.key);
          if (!items.length) return null;
          return (
            <section key={g.key} className="pd-block">
              <h3 className="serif text-lg text-[#102A43] mb-2">{g.title}</h3>
              {items.map((d) => (
                <div key={d.id} className="pd-doc-row">
                  <span className="pd-doc-name">{d.label}</span>
                  <a className="pd-doc-link" href={`/api/documentos/${d.document_id}`} target="_blank" rel="noopener noreferrer">
                    Ver / baixar →
                  </a>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {/* Espaços para anexar/atualizar (upload real) */}
      <h2 className="serif text-2xl text-[#102A43] mt-10 mb-3">Anexar / atualizar</h2>
      <div className="pd-uploads">
        <PersonalUpload category="FOTO" title="Foto de perfil" icon="🪪"
          desc="Aparece no seu perfil e currículo." accept="image/*"
          preview={fotoDoc ? `/api/documentos/${fotoDoc.document_id}` : null} />
        <PersonalUpload category="ASSINATURA" title="Assinatura" icon="✍️"
          desc="Modelo da sua assinatura para reutilizar." accept="image/*,.pdf"
          preview={assinaturaDoc ? `/api/documentos/${assinaturaDoc.document_id}` : null} />
        <PersonalUpload category="IMPOSTO_RENDA" title="Imposto de Renda" icon="🧾"
          desc="Novas declarações e recibos (PDF)." />
        <PersonalUpload category="ARMAS" title="Documentos de armas" icon="🔫"
          desc="CR, guias, SINAR e notas fiscais (PDF)." />
        <PersonalUpload category="IDENTIDADE" title="Documento de identidade" icon="🪪"
          desc="RG, CNH, certidões, comprovantes (PDF/imagem)." />
      </div>
    </main>
  );
}
