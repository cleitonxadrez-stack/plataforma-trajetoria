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

  // Série acumulada por ano (DADOS REAIS) para o gráfico de evolução.
  const validYears = items
    .map((i) => i.year)
    .filter((y): y is number => Number.isFinite(y) && y > 0);
  const perYear = new Map<number, number>();
  for (const yr of validYears) perYear.set(yr, (perYear.get(yr) ?? 0) + 1);
  const chartPoints: { label: string; value: number }[] = [];
  if (validYears.length) {
    const minY = Math.min(...validYears);
    const maxY = Math.max(...validYears);
    let cum = 0;
    for (let yr = minY; yr <= maxY; yr++) {
      cum += perYear.get(yr) ?? 0;
      chartPoints.push({ label: String(yr), value: cum });
    }
  }

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "você";
  const quotaUsed = profile?.doc_quota_used ?? 0;
  const quotaLimit = profile?.doc_quota_limit ?? 500;
  const quotaPct = quotaLimit > 0 ? Math.min(1, quotaUsed / quotaLimit) : 0;

  // Barras (razões reais, 0–1) — o número exibido continua sendo o valor real.
  const barCobertura = ind.coveragePct / 100;
  const barAmplitude = ind.amplitudeTypes / 6; // 6 tipos canônicos
  const barContinuidade = ind.continuityYears / Math.max(1, ind.amplitudeYears);
  const barCarreira = ind.careerYearsAdjusted > 0 ? Math.min(1, ind.careerYearsAdjusted / 30) : 0;

  const STEPS = [
    { href: "/documentos/enviar", icon: "M12 16V4m0 0 4 4m-4-4-4 4M4 20h16", title: "Enviar documento", sub: "Adicione novos comprovantes" },
    { href: "/documentos", icon: "M5 7h14v13H5zM8 7V5a4 4 0 0 1 8 0v2", title: "Meu cofre", sub: "Acesse seus documentos" },
    { href: "/importar", icon: "M12 3 2 8l10 5 10-5-10-5ZM6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5", title: "Importar Lattes", sub: "Sincronize sua produção" },
    { href: "/trajetoria", icon: "M3 12h4l3 8 4-16 3 8h4", title: "Ver trajetória", sub: "Acompanhe sua evolução" },
  ];

  return (
    <main className="pnl">
      {/* HERO */}
      <section className="pnl-hero">
        <div className="pnl-hero-text">
          <p className="pnl-hero-kicker">Painel acadêmico</p>
          <h1 className="pnl-hero-title serif">Olá, {firstName}</h1>
          <p className="pnl-hero-sub">Sua trajetória acadêmica, organizada e verificável.</p>
          <div className="pnl-hero-actions">
            <Link href="/documentos/enviar" className="pnl-hero-btn pnl-hero-btn-blue">
              <Ic d="M12 5v14M5 12h14" size={18} /> Adicionar documento
            </Link>
            <Link href="/dossies/novo" className="pnl-hero-btn pnl-hero-btn-ghost">
              <Ic d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h4" size={18} /> Gerar dossiê
            </Link>
          </div>
        </div>
        <svg className="pnl-hero-art" viewBox="0 0 420 240" fill="none" aria-hidden="true">
          <g stroke="rgba(255,255,255,.16)" strokeWidth="1">
            <path d="M40 60 120 110 90 180M120 110 220 70 320 120 360 62M220 70 250 160 320 120" />
          </g>
          <g fill="rgba(255,255,255,.35)">
            <circle cx="40" cy="60" r="2.2" /><circle cx="120" cy="110" r="2.2" /><circle cx="90" cy="180" r="2.2" />
            <circle cx="220" cy="70" r="2.2" /><circle cx="320" cy="120" r="2.2" /><circle cx="360" cy="62" r="2.2" /><circle cx="250" cy="160" r="2.2" />
          </g>
          <g stroke="rgba(255,255,255,.5)" strokeWidth="1.6" fill="rgba(255,255,255,.05)">
            <rect x="150" y="66" width="72" height="92" rx="7" />
            <rect x="252" y="54" width="72" height="92" rx="7" />
          </g>
          <g stroke="rgba(255,255,255,.28)" strokeWidth="1.2">
            <path d="M166 90h40M166 104h30M166 120h40" />
            <path d="M268 78h40M268 92h30M268 108h40" />
          </g>
          <path d="M212 150l26 9v22c0 17-11 28-26 34-15-6-26-17-26-34v-22z" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.6)" strokeWidth="1.8" />
          <path d="M200 190l8 8 15-16" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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

      {/* GRÁFICO + PRÓXIMOS PASSOS */}
      <section className="pnl-mid">
        <div className="card pnl-chart">
          <h2 className="serif pnl-card-title">Evolução da trajetória</h2>
          <TrajectoryChart points={chartPoints} />
        </div>
        <div className="card pnl-steps">
          <h2 className="serif pnl-card-title">Próximos passos</h2>
          <div className="pnl-steps-list">
            {STEPS.map((s) => (
              <Link key={s.href} href={s.href} className="pnl-step">
                <span className="pnl-step-icon"><Ic d={s.icon} /></span>
                <span className="pnl-step-body">
                  <span className="pnl-step-title">{s.title}</span>
                  <span className="pnl-step-sub">{s.sub}</span>
                </span>
                <span className="pnl-step-chev"><Ic d="M9 6l6 6-6 6" size={18} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* RODAPÉ: plano / sessão / metodologia */}
      <section className="pnl-foot">
        <div className="card pnl-foot-card">
          <div className="pnl-foot-head">
            <span className="pnl-foot-icon pnl-foot-icon-gold"><Ic d="M12 3l3 5 5 .8-3.6 3.6.9 5.1L12 20l-4.5 2.5.9-5.1L4.8 8.8 10 8z" size={18} /></span>
            <p className="pnl-foot-label">Plano</p>
          </div>
          <p className="serif pnl-foot-value">{profile?.plan_tier ?? "FREE"}</p>
          <div className="ind-card-bar pnl-foot-bar"><span style={{ width: `${Math.round(quotaPct * 100)}%` }} /></div>
          <p className="pnl-foot-cap">{quotaUsed} / {quotaLimit} documentos</p>
        </div>

        <div className="card pnl-foot-card">
          <div className="pnl-foot-head">
            <span className="pnl-foot-icon"><Ic d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" size={18} /></span>
            <p className="pnl-foot-label">Sessão</p>
          </div>
          <p className="pnl-foot-mono">{profile?.email ?? sess.user.email}</p>
          <p className="pnl-foot-cap">ID: {sess.user.id.slice(0, 8)}…</p>
          <Link href="/auth/signout" className="pnl-foot-signout">Sair da conta</Link>
        </div>

        <details className="card pnl-collapse">
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
      </section>
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
