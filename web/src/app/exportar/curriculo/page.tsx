// src/app/exportar/curriculo/page.tsx
// Currículo — visualização de PLATAFORMA (moderna/interativa, via CurriculoView)
// + versão impressa/A4 (controlada por @media print). Puxa academic_items,
// comprovantes (evidences→documents) e dados pessoais.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CurriculoView, type CvViewSection, type CvProfile, type CvStats } from "@/components/CurriculoView";
import { groupIntoCvSections, cvSeal, cvMarkers, type CvItem } from "@/lib/domain/cv-sections";

export const metadata = { title: "Currículo — Trajetória360" };
export const dynamic = "force-dynamic";

interface Row {
  id: string; title: string; year: number | null; item_type: string;
  natureza: string | null; origin: string; verification_level: string;
  evidence_status: string; doi: string | null; isbn: string | null; issn: string | null;
}

function normLangs(v: unknown): { lang: string; detail: string }[] {
  if (Array.isArray(v)) return v as { lang: string; detail: string }[];
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}

export default async function CurriculoPage() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/entrar?redirect=/exportar/curriculo");

  const [{ data: pdata }, { data: rows }] = await Promise.all([
    sb.from("personal_data").select("*").eq("user_id", u.user.id).maybeSingle(),
    sb.from("academic_items")
      .select("id,title,year,item_type,natureza,origin,verification_level,evidence_status,doi,isbn,issn")
      .eq("user_id", u.user.id).is("deleted_at", null).order("year", { ascending: false }),
  ]);

  const list = (rows ?? []) as Row[];

  // evidências → documento principal por item (RLS já limita ao usuário; sem
  // `.in(ids)` para não estourar o tamanho da URL do PostgREST com 400+ ids).
  const docByItem = new Map<string, string>();
  const evCount = new Map<string, number>();
  const { data: evs } = await sb
    .from("evidences").select("item_id, document_id").is("deleted_at", null);
  for (const e of (evs ?? []) as { item_id: string; document_id: string }[]) {
    evCount.set(e.item_id, (evCount.get(e.item_id) ?? 0) + 1);
    if (!docByItem.has(e.item_id)) docByItem.set(e.item_id, e.document_id);
  }

  const items: CvItem[] = list.map((r) => ({
    id: r.id, title: r.title, year: r.year, itemType: r.item_type, natureza: r.natureza,
    origin: r.origin, verificationLevel: r.verification_level, evidenceStatus: r.evidence_status,
    evidenceCount: evCount.get(r.id) ?? 0, doi: r.doi, isbn: r.isbn, issn: r.issn,
    docId: docByItem.get(r.id) ?? null, docName: null,
  }));

  const grouped = groupIntoCvSections(items); // já aplica a dedup geral do site
  const deduped = grouped.flatMap((s) => s.items);
  const isDoc = (it: CvItem) => ["comprovado", "validado"].includes(cvSeal(it).tone);

  const sections: CvViewSection[] = grouped.map((s) => ({
    key: s.key, label: s.label,
    documented: s.items.filter(isDoc).length,
    items: s.items.map((it) => {
      const seal = cvSeal(it);
      return {
        id: it.id, year: it.year, title: it.title, natureza: it.natureza,
        sealLabel: seal.label, sealTone: seal.tone,
        docId: it.docId,
        isPublication: cvMarkers(it).some((m) => m.code === "P"),
      };
    }),
  }));

  // estatísticas
  const years = deduped.map((i) => i.year).filter((y): y is number => !!y);
  const stats: CvStats = {
    total: deduped.length,
    comprovados: deduped.filter((i) => ["comprovado", "validado"].includes(cvSeal(i).tone)).length,
    anos: years.length ? Math.max(...years) - Math.min(...years) : 0,
    formacoes: grouped.find((s) => s.key === "FORMACAO")?.items.length ?? 0,
  };

  // áreas de atuação (a partir dos itens)
  const areas = Array.from(new Set(
    items.filter((i) => (i.natureza ?? "").toLowerCase().includes("área de atua")).map((i) => i.title),
  )).slice(0, 6);

  // foto de perfil (documento pessoal categoria FOTO)
  const { data: fotoRow } = await sb
    .from("personal_documents").select("document_id").eq("category", "FOTO").limit(1).maybeSingle<{ document_id: string }>();
  const photoUrl = fotoRow?.document_id ? `/api/documentos/${fotoRow.document_id}` : null;

  // tratamento pela maior titulação (Escolaridade)
  const edu = ((pdata as Record<string, string | null> | null)?.education ?? "").toLowerCase();
  const treatment = /doutor/.test(edu) ? "Dr." : /mestr/.test(edu) ? "Mestre" : /especial/.test(edu) ? "Esp." : "Prof.";

  const p = pdata as Record<string, unknown> | null;
  const fullName = (p?.full_name as string) ?? (u.user.email ?? "").split("@")[0];
  const profile: CvProfile = {
    name: fullName,
    firstName: fullName.split(/\s+/)[0] ?? fullName,
    treatment,
    role: (p?.job_title as string) ?? null,
    title: "Professor · Pesquisador · Gestor Público",
    location: "Cuiabá — Mato Grosso, Brasil",
    citation: (p?.citation_name as string) ?? null,
    lattes: (p?.lattes_id as string) ?? null,
    orcid: (p?.orcid as string) ?? null,
    email: (p?.email as string) ?? null,
    emailProf: (p?.email_prof as string) ?? null,
    website: (p?.website as string) ?? null,
    linkedin: (p?.linkedin as string) ?? null,
    instagram: (p?.instagram as string) ?? null,
    institution: "SECITECI — Ciência, Tecnologia e Inovação (MT)",
    areas,
    languages: normLangs(p?.languages),
    photoUrl,
    birth: [p?.birth_date, p?.birth_place].filter(Boolean).join(" — ") || null,
    phone: (p?.phone as string) ?? null,
    address: (p?.address as string) ?? null,
  };

  return <CurriculoView profile={profile} sections={sections} stats={stats} />;
}
