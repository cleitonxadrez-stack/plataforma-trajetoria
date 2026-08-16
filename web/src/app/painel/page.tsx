// src/app/painel/page.tsx
// Bloco 5 — PAINEL PESSOAL com indicadores de trajetória.
//
// Server Component. Lê dados via supabase (RLS já filtra por usuário).
//
// Política de fallback centralizada em `lib/ui/data-source.ts`:
//   - PRODUÇÃO: nunca MOCK_*. Se DB vazio, mostra empty-state com CTA.
//   - DEV: MOCK_* seguro com badge "modo demonstração".

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IndicatorCard } from "@/components/IndicatorCard";
import { TrajectoryChart } from "@/components/TrajectoryChart";
import {
  computeAllIndicators,
  type IndicatorInputItem, type IndicatorInputCareerInterruption,
} from "@/lib/domain/indicators";
import { chooseDataSource, FALLBACK_BADGE } from "@/lib/ui/data-source";

export const metadata = { title: "Painel — Trajetória360" };
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  citation_name: string | null;
  plan_tier: string;
  doc_quota_used: number;
  doc_quota_limit: number;
  career_start_date: string | null;
}

interface ItemsRow {
  id: string;
  item_type: string;
  year: number | null;
  evidence_status: string;
  verification_level: string;
  visibility: string;
}

interface InterruptionRow {
  type: "MATERNIDADE" | "PATERNIDADE" | "ADOCAO" | "SAUDE" | "OUTRO";
  start_date: string;
  end_date: string | null;
}

const ALLOWED_ITEM_TYPES = ["ARTIGO", "CAPITULO", "CERTIFICADO", "DIPLOMA", "CAPA_FICHA", "OUTROS"];
const ALLOWED_STATES = ["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"];
const ALLOWED_EVIDENCE = ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"];

async function fetchDashboardData(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<{
  profile: ProfileRow | null;
  items: IndicatorInputItem[];
  interruptions: IndicatorInputCareerInterruption[];
  hasAnyData: boolean;
}> {
  const [profileRes, itemsRes, intsRes] = await Promise.all([
    supabase.from("users")
      .select("id,email,full_name,citation_name,plan_tier,doc_quota_used,doc_quota_limit,career_start_date")
      .eq("id", userId).maybeSingle<ProfileRow>(),
    supabase.from("academic_items")
      .select("id,item_type,year,evidence_status,verification_level,visibility")
      .eq("user_id", userId).is("deleted_at", null),
    supabase.from("career_interruptions")
      .select("type,start_date,end_date")
      .eq("user_id", userId).is("deleted_at", null),
  ]);

  const profile: ProfileRow | null = profileRes.data ?? null;
  const items: IndicatorInputItem[] = (itemsRes.data ?? []).map((r: ItemsRow) => ({
    itemType: (ALLOWED_ITEM_TYPES.includes(r.item_type) ? r.item_type : "OUTROS") as IndicatorInputItem["itemType"],
    // Ano inválido (null OU 0/negativo, sentinela de "sem ano") NÃO define
    // span/continuidade — é filtrado por Number.isFinite lá no cálculo.
    year: typeof r.year === "number" && r.year > 0 ? r.year : NaN,
    state: (ALLOWED_STATES.includes(r.verification_level) ? r.verification_level : "AUTODECLARADO") as IndicatorInputItem["state"],
    evidenceStatus: (ALLOWED_EVIDENCE.includes(r.evidence_status) ? r.evidence_status : "SEM_COMPROVANTE") as IndicatorInputItem["evidenceStatus"],
  }));
  const interruptions: IndicatorInputCareerInterruption[] = (intsRes.data ?? []).map((r: InterruptionRow) => ({
    type: r.type, startDate: r.start_date, endDate: r.end_date,
  }));

  return {
    profile,
    items,
    interruptions,
    hasAnyData: !!profile || items.length > 0 || interruptions.length > 0,
  };
}

// Gate DCE-friendly: em produção NODE_ENV é "production" → IS_DEV=false →
// webpack/Next stripem todo o ramo IS_DEV abaixo (Sprint 1 Item 4).
const IS_DEV = process.env.NODE_ENV !== "production";

const MOCK_PROFILE: ProfileRow = {
  id: "demo",
  email: "demo@local",
  full_name: "Cleiton Marino Santana",
  citation_name: "Santana, C. M.",
  plan_tier: "PRO",
  doc_quota_used: 37,
  doc_quota_limit: 500,
  career_start_date: "2010-08-09",
};
// Fixture de dev (gate IS_DEV, consumida abaixo) — nunca em produção.
const MOCK_ITEMS: IndicatorInputItem[] = [
  { itemType: "ARTIGO", year: 2022, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "ARTIGO", year: 2023, state: "DOCUMENTADO", evidenceStatus: "COM_COMPROVANTE_PARCIAL" },
  { itemType: "ARTIGO", year: 2024, state: "DOCUMENTADO", evidenceStatus: "COMPROVADO" },
  { itemType: "CAPITULO", year: 2022, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "CERTIFICADO", year: 2023, state: "AUTODECLARADO", evidenceStatus: "SEM_COMPROVANTE" },
  { itemType: "DIPLOMA", year: 2010, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "DIPLOMA", year: 2014, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
];
// Fixture de dev (gate IS_DEV, consumida abaixo) — nunca em produção.
const MOCK_INTERRUPTIONS: IndicatorInputCareerInterruption[] = [
  { type: "MATERNIDADE", startDate: "2020-01-01", endDate: "2021-01-01" },
];

function Ic({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

function normLangs(v: unknown): { lang: string; detail: string }[] {
  if (Array.isArray(v)) return v as { lang: string; detail: string }[];
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}
function withProto(u: string | null): string | null {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export default async function PainelPage() {
  const supabase = await createClient();
  const { data: sess, error } = await supabase.auth.getUser();
  if (error || !sess.user) redirect("/entrar?redirect=/painel");

  const db = await fetchDashboardData(supabase, sess.user.id);

  const decision = chooseDataSource({
    profileFound: !!db.profile,
    itemsFound: db.items.length > 0,
    interruptionsFound: db.interruptions.length > 0,
    institutionsFound: false, // painel não usa instituições
    fromDb: { profile: db.profile, items: db.items, interruptions: db.interruptions },
    fallback: {
      profile: db.profile ?? (IS_DEV ? MOCK_PROFILE : null),
      items: db.items.length > 0 ? db.items : (IS_DEV ? MOCK_ITEMS : []),
      interruptions: db.interruptions.length > 0
        ? db.interruptions
        : (IS_DEV ? MOCK_INTERRUPTIONS : []),
    },
  });
  const { profile, items, interruptions } = decision.data;

  // PRODUÇÃO + DB vazio: empty-state antes de computar (sem indicadores vazios).
  if (decision.isEmpty && !profile) {
    return <EmptyPainel />;
  }

  const careerStart = profile?.career_start_date
    ? new Date(profile.career_start_date + "T00:00:00Z")
    : null;

  const ind = computeAllIndicators({
    userId: sess.user.id,
    now: new Date(),
    careerStartDate: careerStart,
    interruptions,
    items,
  });

  // Volume de produção POR ANO (dados reais) para o gráfico de barras.
  const validYears = items
    .map((i) => i.year)
    .filter((y): y is number => Number.isFinite(y) && y > 0);
  const perYear = new Map<number, number>();
  for (const yr of validYears) perYear.set(yr, (perYear.get(yr) ?? 0) + 1);
  const chartPoints: { label: string; value: number }[] = [];
  if (validYears.length) {
    const minY = Math.min(...validYears);
    const maxY = Math.max(...validYears);
    for (let yr = minY; yr <= maxY; yr++) {
      chartPoints.push({ label: String(yr), value: perYear.get(yr) ?? 0 });
    }
  }
  const peakYear = chartPoints.reduce((a, b) => (b.value > a.value ? b : a), { label: "—", value: 0 });

  // Contagem de documentos anexados (para os cards de exportação).
  const { count: docsCount } = await supabase
    .from("documents").select("id", { count: "exact", head: true })
    .eq("user_id", sess.user.id).is("deleted_at", null);
  const docsN = docsCount ?? 0;

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "você";
  const planTier = profile?.plan_tier ?? "FREE";

  // Perfil acadêmico (dados reais) para a "capa" do painel.
  const { data: pdata } = await supabase
    .from("personal_data").select("*").eq("user_id", sess.user.id).maybeSingle();
  const pd = pdata as Record<string, unknown> | null;
  const { data: fotoRow } = await supabase
    .from("personal_documents").select("document_id").eq("category", "FOTO").limit(1)
    .maybeSingle<{ document_id: string }>();
  const { data: areaRows } = await supabase
    .from("academic_items").select("title, natureza").eq("user_id", sess.user.id).is("deleted_at", null);
  const prof = {
    name: (pd?.full_name as string) ?? profile?.full_name ?? firstName,
    title: "Professor · Pesquisador · Gestor Público",
    role: (pd?.job_title as string) ?? null,
    location: "Cuiabá — Mato Grosso, Brasil",
    institution: "SECITECI — Ciência, Tecnologia e Inovação (MT)",
    lattes: (pd?.lattes_id as string) || null,
    orcid: (pd?.orcid as string) || null,
    website: withProto((pd?.website as string) || null),
    linkedin: withProto((pd?.linkedin as string) || null),
    instagram: withProto((pd?.instagram as string) || null),
    email: (pd?.email as string) || null,
    emailProf: (pd?.email_prof as string) || null,
    areas: Array.from(new Set(
      (areaRows ?? [])
        .filter((r) => ((r as { natureza: string | null }).natureza ?? "").toLowerCase().includes("área de atua"))
        .map((r) => (r as { title: string }).title),
    )).slice(0, 6),
    langs: normLangs(pd?.languages),
    photoUrl: fotoRow?.document_id ? `/api/documentos/${fotoRow.document_id}` : null,
    initials: ((pd?.full_name as string) ?? firstName).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
  };
  const PROF_LINKS = [
    prof.lattes && { label: "Lattes", href: `http://lattes.cnpq.br/${prof.lattes}` },
    prof.orcid && { label: "ORCID", href: withProto(prof.orcid)! },
    prof.website && { label: "Site", href: prof.website },
    prof.linkedin && { label: "LinkedIn", href: prof.linkedin },
    prof.instagram && { label: "Instagram", href: prof.instagram },
  ].filter(Boolean) as { label: string; href: string }[];

  // Barras (razões reais, 0–1) — o número exibido continua sendo o valor real.
  const barCobertura = ind.coveragePct / 100;
  const barAmplitude = ind.amplitudeTypes / 6; // 6 tipos canônicos
  const barContinuidade = ind.continuityYears / Math.max(1, ind.amplitudeYears);
  const barCarreira = ind.careerYearsAdjusted > 0 ? Math.min(1, ind.careerYearsAdjusted / 30) : 0;

  return (
    <main className="pnl">
      {/* HERO */}
      <section className="pnl-hero">
        <div className="pnl-hero-plan">
          <span className="pnl-plan-label">Plano <strong>{planTier}</strong></span>
          <span className="pnl-plan-dot">·</span>
          <Link href="/sobre" className="pnl-plan-link">Atualizar plano</Link>
          <span className="pnl-plan-dot">·</span>
          <Link href="/auth/signout" className="pnl-plan-link">Sair</Link>
        </div>
        {prof.photoUrl
          ? <img className="pnl-prof-photo" src={prof.photoUrl} alt={prof.name} />
          : <span className="pnl-prof-photo pnl-prof-photo-ph">{prof.initials}</span>}
        <div className="pnl-prof">
          <p className="pnl-hero-kicker">Painel acadêmico</p>
          <h1 className="pnl-prof-name serif">{prof.name}</h1>
          <p className="pnl-prof-title">{prof.title}</p>
          {prof.role && <p className="pnl-prof-role">{prof.role}</p>}
          <p className="pnl-prof-loc">{prof.location} · {prof.institution}</p>
          {PROF_LINKS.length > 0 && (
            <div className="pnl-prof-links">
              {PROF_LINKS.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="pnl-prof-link">{l.label}</a>
              ))}
            </div>
          )}
          {(prof.email || prof.emailProf) && (
            <div className="pnl-prof-emails">
              {prof.email && <a href={`mailto:${prof.email}`}>{prof.email}</a>}
              {prof.emailProf && <a href={`mailto:${prof.emailProf}`}>{prof.emailProf}</a>}
            </div>
          )}
          {prof.areas.length > 0 && <p className="pnl-prof-meta"><strong>Áreas:</strong> {prof.areas.join(" · ")}</p>}
          {prof.langs.length > 0 && <p className="pnl-prof-meta"><strong>Idiomas:</strong> {prof.langs.map((l) => l.lang).join(", ")}</p>}
        </div>
      </section>

      {decision.usingMock && <p className="pnl-mock">{FALLBACK_BADGE}</p>}

      {/* INDICADORES */}
      <section className="pnl-metrics" aria-label="Indicadores pessoais">
        <IndicatorCard
          label="Cobertura" value={ind.coveragePct.toFixed(1).replace(".", ",")} unit="%"
          icon="M21 12a9 9 0 1 1-9-9v9h9Z" progress={barCobertura}
          caption={`${items.length} ${items.length === 1 ? "item" : "itens"} ao todo`}
        />
        <IndicatorCard
          label="Amplitude" value={ind.amplitudeYears.toString()} unit="anos"
          icon="M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" progress={barAmplitude}
          caption={`${ind.amplitudeTypes} ${ind.amplitudeTypes === 1 ? "tipo" : "tipos"} distintos`}
        />
        <IndicatorCard
          label="Continuidade" value={ind.continuityYears.toString()} unit={ind.continuityYears === 1 ? "ano" : "anos"}
          icon="M8 2v4M16 2v4M3 9h18M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
          tone="positive" progress={barContinuidade} caption="Trajetória documentada"
        />
        <IndicatorCard
          label="Carreira" value={ind.careerYearsAdjusted.toFixed(1).replace(".", ",")} unit="anos"
          icon="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" progress={barCarreira}
          caption={
            ind.interruptedDays > 0
              ? `${ind.interruptedDays} ${ind.interruptedDays === 1 ? "dia descontado" : "dias descontados"} por interrupção`
              : "Sem interrupções registradas"
          }
          hint={ind.rawCareerYears !== ind.careerYearsAdjusted
            ? `Bruto: ${ind.rawCareerYears.toFixed(1)} anos`
            : undefined}
        />
      </section>

      {/* GRÁFICO — volume de produção por ano */}
      <section className="card pnl-chart">
        <div className="pnl-chart-head">
          <div>
            <h2 className="serif pnl-card-title">Evolução da trajetória</h2>
            <p className="pnl-chart-sub">
              Volume de produção registrado por ano — cada barra é a quantidade de itens
              (artigos, capítulos, certificados, formações…) daquele ano.
            </p>
          </div>
          {peakYear.value > 0 && (
            <span className="pnl-chart-peak">
              Pico: <strong>{peakYear.value}</strong> em {peakYear.label}
            </span>
          )}
        </div>
        <TrajectoryChart points={chartPoints} />
      </section>

      {/* ADICIONAR — entrada de conteúdo */}
      <section className="card pnl-quick">
        <div className="pnl-quick-text">
          <h2 className="serif">Adicionar à sua trajetória</h2>
          <p>Envie um comprovante ou sincronize sua produção do Lattes.</p>
        </div>
        <div className="pnl-quick-actions">
          <Link href="/documentos/enviar" className="btn-primary">Enviar documento</Link>
          <Link href="/importar" className="btn-secondary">Importar Lattes</Link>
        </div>
      </section>

      {/* AÇÕES — gerar e exportar (movido da página Exportar) */}
      <h2 className="pnl-section-title serif">Gerar e exportar</h2>
      <section className="exp-grid pnl-exp">
        <article className="exp-card exp-card-primary">
          <div className="exp-card-top">
            <span className="exp-card-icon"><Ic d="M3 6h18v12H3zM7 10h4M7 14h6M16 9a2 2 0 1 1-.01 4A2 2 0 0 1 16 9" size={22} /></span>
            <span className="exp-card-badge">Estilo Lattes</span>
          </div>
          <h3 className="serif">Currículo acadêmico</h3>
          <p>Currículo aberto, por área, com produção organizada e marcadores bibliográficos.</p>
          <div className="exp-card-foot"><span className="exp-card-note">PDF · Editável</span>
            <Link href="/exportar/curriculo" className="exp-btn exp-btn-blue">Gerar currículo</Link></div>
        </article>

        <article className="exp-card">
          <div className="exp-card-top"><span className="exp-card-icon"><Ic d="M21 11.5 12 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 9" size={22} /></span></div>
          <h3 className="serif">PDF de documentos</h3>
          <p>Escolha entre os {docsN} comprovantes e gere um único PDF (capa + índice) só com os selecionados.</p>
          <div className="exp-card-foot"><span className="exp-card-note">Seleção · PDF único</span>
            <Link href="/exportar/documentos" className="exp-btn exp-btn-outline">Selecionar e gerar</Link></div>
        </article>

        <article className="exp-card">
          <div className="exp-card-top"><span className="exp-card-icon"><Ic d="M3 6h18v12H3zM7 10h4M7 14h6M16 9a2 2 0 1 1-.01 4A2 2 0 0 1 16 9" size={22} /></span></div>
          <h3 className="serif">Dados pessoais</h3>
          <p>Consulte e exporte seus dados cadastrais para formulários e inscrições.</p>
          <div className="exp-card-foot"><span className="exp-card-note">Dados protegidos</span>
            <Link href="/exportar/dados" className="exp-btn exp-btn-outline">Visualizar dados</Link></div>
        </article>

        <article className="exp-card exp-card-gold">
          <div className="exp-card-top">
            <span className="exp-card-icon exp-card-icon-gold"><Ic d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" size={22} /></span>
            <span className="exp-card-badge exp-card-badge-gold">Pontuado</span>
          </div>
          <h3 className="serif">Dossiê por edital</h3>
          <p>Selecione itens e monte um dossiê organizado conforme os critérios do edital.</p>
          <div className="exp-card-foot"><span className="exp-card-note">PDF com barema</span>
            <Link href="/dossies" className="exp-btn exp-btn-navy">Montar dossiê</Link></div>
        </article>
      </section>

      {/* METODOLOGIA (recolhível) */}
      <details className="card pnl-collapse pnl-collapse-full">
        <summary className="pnl-collapse-sum">
          <span className="pnl-foot-icon"><Ic d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8h.01M11 12h1v4h1" size={18} /></span>
          <span className="pnl-collapse-title">Como estes indicadores são calculados</span>
          <span className="pnl-collapse-chev"><Ic d="M6 9l6 6 6-6" size={18} /></span>
        </summary>
        <div className="pnl-collapse-body">
          <ul>
            <li><strong>Cobertura:</strong> % de itens com evidência útil (PARCIAL ou COMPROVADO) sobre o total. Estados válidos: <code>COM_COMPROVANTE_PARCIAL | COMPROVADO</code>.</li>
            <li><strong>Amplitude:</strong> ano-span (inclusivo) do mais antigo ao mais recente, sem corte de janela. Tipos = # distintos de <code>item_type</code>.</li>
            <li><strong>Continuidade:</strong> # de anos com pelo menos 1 item em estado <code>DOCUMENTADO</code> ou <code>VALIDADO</code>. Itens autodeclarados não contam.</li>
            <li><strong>Carreira:</strong> anos entre <em>data de início</em> e <em>agora</em>, descontando intervalos de <code>career_interruptions</code> (maternidade, paternidade, adoção, saúde, outro).</li>
          </ul>
          <p className="pnl-collapse-note"><strong>Métrica padrão (§6.6):</strong> vida inteira, sem teto e sem janela. Estes indicadores são <em>seus</em> — nunca públicos sem o seu consentimento explícito.</p>
          <p className="pnl-collapse-note">Última leitura: <code>{ind.computedAt}</code></p>
        </div>
      </details>
    </main>
  );
}

function EmptyPainel() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Painel</p>
      <h1 className="serif text-4xl text-[#0B2341] mb-3">Sem dados ainda</h1>
      <p className="text-stone-700 max-w-2xl">
        Não encontramos itens na sua trajetória. Comece importando seu
        currículo Lattes — leva menos de 2 minutos e seus indicadores
        aparecem aqui imediatamente.
      </p>
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link href="/importar" className="btn-primary">Importar currículo Lattes</Link>
        <Link href="/documentos" className="btn-secondary">Subir primeiro documento</Link>
      </div>
      <p className="text-xs text-stone-500 mt-8">
        Tudo começa como <em>autodeclarado</em>. Você confirma cada item depois,
        vinculando o documento de evidência.
      </p>
    </main>
  );
}
