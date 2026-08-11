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
import {
  computeAllIndicators,
  type IndicatorInputItem, type IndicatorInputCareerInterruption,
} from "@/lib/domain/indicators";
import { chooseDataSource, FALLBACK_BADGE } from "@/lib/ui/data-source";

export const metadata = { title: "Painel — Plataforma Trajetória" };
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
    year: r.year ?? 0,
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
const MOCK_ITEMS: IndicatorInputItem[] = [
  { itemType: "ARTIGO", year: 2022, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "ARTIGO", year: 2023, state: "DOCUMENTADO", evidenceStatus: "COM_COMPROVANTE_PARCIAL" },
  { itemType: "ARTIGO", year: 2024, state: "DOCUMENTADO", evidenceStatus: "COMPROVADO" },
  { itemType: "CAPITULO", year: 2022, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "CERTIFICADO", year: 2023, state: "AUTODECLARADO", evidenceStatus: "SEM_COMPROVANTE" },
  { itemType: "DIPLOMA", year: 2010, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
  { itemType: "DIPLOMA", year: 2014, state: "VALIDADO", evidenceStatus: "COMPROVADO" },
];
const MOCK_INTERRUPTIONS: IndicatorInputCareerInterruption[] = [
  { type: "MATERNIDADE", startDate: "2020-01-01", endDate: "2021-01-01" },
];

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

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Painel</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-1">
        {profile?.full_name ?? sess.user.email}
      </h1>
      {profile?.citation_name && (
        <p className="text-stone-600 italic mt-1">{profile.citation_name}</p>
      )}

      {decision.usingMock && (
        <p className="mt-4 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-2">
          ⚠ {FALLBACK_BADGE}
        </p>
      )}

      <section
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8"
        aria-label="Indicadores pessoais"
      >
        <IndicatorCard
          label="Cobertura"
          value={ind.coveragePct.toFixed(1)}
          unit="%"
          caption={`${items.length} ${items.length === 1 ? "item" : "itens"} ao todo`}
        />
        <IndicatorCard
          label="Amplitude"
          value={ind.amplitudeYears.toString()}
          unit="anos"
          caption={`${ind.amplitudeTypes} ${ind.amplitudeTypes === 1 ? "tipo" : "tipos"} distintos`}
        />
        <IndicatorCard
          label="Continuidade"
          value={ind.continuityYears.toString()}
          unit={ind.continuityYears === 1 ? "ano" : "anos"}
          caption="Com ≥1 item DOCUMENTADO ou VALIDADO"
        />
        <IndicatorCard
          label="Carreira"
          value={ind.careerYearsAdjusted.toFixed(1)}
          unit="anos"
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

      <section className="card mt-8" style={{ background: "#f7f5f0" }} aria-label="Metadologia do cálculo">
        <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">
          Como estes números foram calculados
        </p>
        <ul className="text-sm" style={{ color: "#4a5266", lineHeight: 1.7 }}>
          <li>
            <strong>Cobertura:</strong> % de itens com evidência útil
            (PARCIAL ou COMPROVADO) sobre o total. Estados válidos:
            <code style={{ fontFamily: "monospace", fontSize: 12 }}> COM_COMPROVANTE_PARCIAL | COMPROVADO</code>.
          </li>
          <li>
            <strong>Amplitude:</strong> ano-span (inclusivo) do mais antigo
            ao mais recente, sem corte de janela. Tipos = # distintos de
            <code style={{ fontFamily: "monospace", fontSize: 12 }}> item_type</code>.
          </li>
          <li>
            <strong>Continuidade:</strong> # de anos com pelo menos 1 item em
            estado <code style={{ fontFamily: "monospace", fontSize: 12 }}>DOCUMENTADO</code> ou
            <code style={{ fontFamily: "monospace", fontSize: 12 }}> VALIDADO</code>. Itens
            autodeclarados não contam — eles não provam existência.
          </li>
          <li>
            <strong>Carreira:</strong> anos entre <em>data de início</em> e
            <em> agora</em>, descontando intervalos coberto por
            <code style={{ fontFamily: "monospace", fontSize: 12 }}> career_interruptions</code>
            (maternidade, paternidade, adoção, saúde, outro).
          </li>
        </ul>
        <p className="text-xs text-stone-500 mt-4">
          <strong>Métrica padrão (§6.6):</strong> vida inteira, sem teto e sem
          janela. Zero filtros de ranking. Estes indicadores são <em>seus</em> —
          nunca públicos sem o seu consentimento explícito (Default: <code style={{ fontFamily: "monospace" }}>FORA</code>).
        </p>
        <p className="text-xs text-stone-500 mt-2">
          Última leitura: <code style={{ fontFamily: "monospace" }}>{ind.computedAt}</code>
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-4 mt-8">
        <div className="card">
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">Plano</p>
          <p className="serif text-2xl text-[#0f2942]">{profile?.plan_tier ?? "FREE"}</p>
          <p className="text-xs text-stone-500 mt-1">
            {profile?.doc_quota_used ?? 0} / {profile?.doc_quota_limit ?? 500} documentos
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">Sessão</p>
          <p className="text-sm font-mono text-[#0f2942]">{profile?.email ?? sess.user.email}</p>
          <p className="text-xs text-stone-500 mt-1">ID: {sess.user.id.slice(0, 8)}…</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">Próximos passos</p>
          <div className="flex flex-col gap-1">
            <Link href="/importar" className="text-sm underline" style={{ color: "#0d6b52" }}>
              Importar Lattes
            </Link>
            <Link href="/trajetoria" className="text-sm underline" style={{ color: "#0d6b52" }}>
              Ver trajetória
            </Link>
            <Link href="/auth/signout" className="text-sm underline" style={{ color: "#8a2a1f" }}>
              Sair
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function EmptyPainel() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Painel</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-3">Sem dados ainda</h1>
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
