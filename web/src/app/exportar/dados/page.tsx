// src/app/exportar/dados/page.tsx
// Dados pessoais — cofre para cadastros. Cada BLOCO tem um botão que copia a
// seção inteira. Futuro: anexar RG, CPF, comprovante de endereço, título…

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DadosVault, type VaultBlock } from "@/components/DadosVault";
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

  const F = (label: string, value: string | null | undefined) => ({ label, value: (value ?? "").trim() });
  const blocks: VaultBlock[] = [
    { key: "id", title: "Identificação", fields: [
      F("Nome completo", p.full_name), F("Nome em citações", p.citation_name),
      F("Nascimento", [p.birth_date, p.birth_place].filter(Boolean).join(" — ")),
      F("Sexo", p.gender), F("Estado civil", p.marital_status), F("Escolaridade", p.education), F("Matrícula", p.matricula),
    ] },
    { key: "fil", title: "Filiação", fields: [F("Nome do pai", p.father_name), F("Nome da mãe", p.mother_name)] },
    { key: "doc", title: "Documentos", fields: [
      F("CPF", p.cpf), F("RG", p.rg), F("Título de eleitor", p.voter_id), F("CNH", p.cnh),
      F("Documento militar", p.military_doc), F("Lattes ID", p.lattes_id), F("ORCID", p.orcid),
    ] },
    { key: "con", title: "Contato", fields: [
      F("E-mail", p.email), F("E-mail profissional", p.email_prof), F("E-mail alternativo", p.email_alt),
      F("Telefone / Celular", p.phone), F("Ramal", p.ramal),
      F("Site", p.website), F("LinkedIn", p.linkedin), F("Instagram", p.instagram),
    ] },
    { key: "end", title: "Endereço", fields: [F("Endereço residencial", p.address), F("Endereço profissional", p.address_prof)] },
    { key: "soc", title: "Dados sociais e bancários", fields: [F("PIS/PASEP", p.pis), F("Dados bancários", p.bank)] },
    { key: "idi", title: "Idiomas", fields: langs.map((l) => F(l.lang, l.detail)) },
  ].map((b) => ({ ...b, fields: b.fields.filter((f) => f.value) }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/exportar" className="back-link">← Voltar para Exportar</Link>
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-1">Dados pessoais</p>
      <h1 className="serif text-4xl text-[#102A43] mb-2">Seus dados para cadastros</h1>
      <p className="text-stone-600 max-w-2xl mb-6">
        Salvos uma vez, prontos para reutilizar. Cada bloco tem um botão <strong>Copiar bloco</strong> que
        copia a seção inteira de uma vez.
      </p>

      {data
        ? <DadosVault blocks={blocks} />
        : <section className="pd-block"><p className="text-stone-700">Ainda não há dados cadastrados.</p></section>}

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
