// src/app/pendencias/page.tsx
// BLOCO 6 — Tela de recuperação assistida.
//
// Lista itens SEM comprovante (ou PARCIAL), agrupados por instituição,
// e permite ao usuário gerar/baixar/copiar/enviar cartas.
//
// Política de fallback (lib/ui/data-source.ts):
//   - PRODUÇÃO + DB vazio: empty-state com CTA para /importar.
//   - DEV + DB vazio: MOCK_* com aviso "modo demonstração".

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  groupByInstitution, generateLetter,
  type RecoveryItemInput, type RecoveryInstitutionInput,
} from "@/lib/domain/recovery";
import { RecoveryLetterPreview } from "@/components/RecoveryLetterPreview";
import { chooseDataSource, FALLBACK_BADGE } from "@/lib/ui/data-source";

export const metadata = { title: "Pendências — [NOME DA PLATAFORMA]" };
export const dynamic = "force-dynamic";

interface ItemRow {
  id: string;
  item_type: string;
  title: string;
  year: number | null;
  evidence_status: string;
}
interface InstRow {
  id: string;
  name: string;
  contact_channels: Record<string, string | undefined> | null;
}
interface UserRow {
  id: string;
  full_name: string;
  lattes_id: string | null;
  orcid: string | null;
}

const ALLOWED_EVIDENCE = ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"];

async function loadDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const [user, items, insts] = await Promise.all([
    supabase.from("users").select("id,full_name,lattes_id,orcid")
      .eq("id", userId).maybeSingle<UserRow>(),
    supabase.from("academic_items").select("id,item_type,title,year,evidence_status")
      .eq("user_id", userId).is("deleted_at", null),
    supabase.from("institutions").select("id,name,contact_channels").is("deleted_at", null),
  ]);

  const pendings: RecoveryItemInput[] = (items.data ?? [])
    .filter((r: ItemRow) => ALLOWED_EVIDENCE.includes(r.evidence_status) && r.evidence_status !== "COMPROVADO")
    .map((r: ItemRow) => ({
      id: r.id,
      title: r.title,
      year: r.year ?? 0,
      itemType: r.item_type,
      institutionName: r.item_type === "DIPLOMA" || r.item_type === "CERTIFICADO"
        ? (user.data?.full_name ?? "—")
        : (insts.data?.[0]?.name ?? "—"),
      evidenceStatus: r.evidence_status as RecoveryItemInput["evidenceStatus"],
    }));

  const institutions: RecoveryInstitutionInput[] = (insts.data ?? []).map((r: InstRow) => ({
    id: r.id, name: r.name, contactChannels: r.contact_channels ?? {},
  }));

  return { user: user.data ?? null, pendings, institutions };
}

// ─── MOCK fallback (DB vazio, só em DEV) ───────────────────────────
const MOCK_USER = { id: "demo", full_name: "Cleiton Marino Santana", lattes_id: "K4000001P5", orcid: "0000-0000-0000-0001" };
const MOCK_INSTITUTIONS: RecoveryInstitutionInput[] = [
  { id: "i-unipar", name: "Universidade Paranaense — UNIPAR",
    contactChannels: { secretariaAcademica: "secretaria@unipar.br", biblioteca: "bib@unipar.br" } },
  { id: "i-ufmg", name: "Universidade Federal de Minas Gerais",
    contactChannels: { proReitoriaExtensao: "proex@ufmg.br" } },
  { id: "i-ufop", name: "Universidade Federal de Ouro Preto",
    contactChannels: { secretariaAcademica: "sec@ufop.br" } },
];
const MOCK_PENDINGS: RecoveryItemInput[] = [
  { id: "u1", title: "Monitoria de Cálculo I", year: 2022, itemType: "CERTIFICADO", institutionName: "UNIPAR", evidenceStatus: "SEM_COMPROVANTE" },
  { id: "u2", title: "Participação Semana Acadêmica", year: 2023, itemType: "CERTIFICADO", institutionName: "UNIPAR", evidenceStatus: "SEM_COMPROVANTE" },
  { id: "u3", title: "Apresentação de trabalho — SIC", year: 2023, itemType: "CERTIFICADO", institutionName: "UNIPAR", evidenceStatus: "COM_COMPROVANTE_PARCIAL" },
  { id: "u4", title: "Estágio docência", year: 2024, itemType: "CERTIFICADO", institutionName: "UFMG", evidenceStatus: "SEM_COMPROVANTE" },
  { id: "u5", title: "Projeto de Extensão — Inclusão", year: 2022, itemType: "CERTIFICADO", institutionName: "UFMG", evidenceStatus: "SEM_COMPROVANTE" },
  { id: "u6", title: "Disciplina cursada — Topologia", year: 2019, itemType: "CERTIFICADO", institutionName: "UFOP", evidenceStatus: "COM_COMPROVANTE_PARCIAL" },
  { id: "u7", title: "TCC aprovado com distinção", year: 2021, itemType: "DIPLOMA", institutionName: "UFOP", evidenceStatus: "SEM_COMPROVANTE" },
];

export default async function PendenciasPage() {
  const supabase = await createClient();
  const { data: sess, error } = await supabase.auth.getUser();
  if (error || !sess.user) redirect("/entrar?redirect=/pendencias");

  const dbData = await loadDashboard(supabase, sess.user.id);
  // Gate DCE-friendly (Sprint 1 Item 4): em produção IS_DEV é false, e o
  // webpack/Next stripem o ramo IS_DEV abaixo durante o build.
  const IS_DEV = process.env.NODE_ENV !== "production";
  const isProd = !IS_DEV;

  const decision = chooseDataSource({
    profileFound: !!dbData.user,
    itemsFound: dbData.pendings.length > 0,
    interruptionsFound: false,
    institutionsFound: dbData.institutions.length > 0,
    fromDb: {
      user: dbData.user,
      pendings: dbData.pendings,
      institutions: dbData.institutions,
    },
    fallback: {
      user: dbData.user ?? (IS_DEV ? MOCK_USER : null),
      pendings: dbData.pendings.length > 0
        ? dbData.pendings
        : (IS_DEV ? MOCK_PENDINGS : []),
      institutions: dbData.institutions.length > 0
        ? dbData.institutions
        : (IS_DEV ? MOCK_INSTITUTIONS : []),
    },
  });
  const { user, pendings, institutions } = decision.data;

  // PRODUÇÃO sem nada para mostrar.
  if (decision.isEmpty && !user) {
    return <EmptyPendencias />;
  }

  const plan = groupByInstitution({
    items: pendings,
    institutions,
    consentTextVersion: "v1.0",
    now: new Date().toISOString(),
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Recuperação assistida</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-1">Pendências por instituição</h1>
      <p className="text-stone-600 max-w-2xl mt-2">
        Itens sem comprovante (ou com evidência parcial), agrupados por instituição.
        Clique numa instituição para gerar a carta pronta para enviar pelo canal sugerido.
      </p>

      {decision.usingMock && (
        <p className="mt-4 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-2">
          ⚠ {FALLBACK_BADGE}
        </p>
      )}

      <section className="grid sm:grid-cols-3 gap-3 mt-8" aria-label="Resumo">
        <StatCard label="Instituições" value={plan.totals.institutions} accent />
        <StatCard label="Itens sem comprovante" value={plan.totals.items} />
        <StatCard label="No universo" value={plan.totals.pendingItems} muted />
      </section>

      <section style={{ marginTop: 32 }}>
        {plan.groups.length === 0 && (
          <p className="card" style={{ background: "#d9ece4", color: "#0d6b52" }}>
            <strong>Nada para solicitar.</strong> Todos os itens já têm evidência
            útil ou foram confirmados via outra via.
          </p>
        )}

        {plan.groups.map((g) => {
          const fullItems = pendings.filter((p) => g.itemIds.includes(p.id));
          if (!user) return null;
          const letter = generateLetter({
            userFullName: user.full_name,
            userLattesId: user.lattes_id,
            userORCID: user.orcid,
            group: g,
            items: fullItems,
            consentTextVersion: "v1.0",
          });
          return (
            <section key={g.institutionId} style={{ marginBottom: 24 }}>
              <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <h2 className="serif text-2xl text-[#0f2942]">{g.institutionName}</h2>
                <span className="text-stone-500 text-sm">
                  {g.itemIds.length} {g.itemIds.length === 1 ? "item" : "itens"}
                </span>
                <span style={{ flex: 1, height: 1, background: "#e4dfd3", display: "inline-block" }} />
                {g.partialCoverageRatio > 0 && (
                  <span className="text-xs" style={{
                    background: "#f3e3cd", color: "#a15a13",
                    padding: "2px 8px", borderRadius: 6,
                  }}>
                    {Math.round(g.partialCoverageRatio * 100)}% com parcial
                  </span>
                )}
              </header>
              <RecoveryLetterPreview letter={letter} />
            </section>
          );
        })}
      </section>

      <p className="text-xs text-stone-500 mt-12" style={{ background: "#f1ede4", padding: 12, borderRadius: 8 }}>
        ⓘ Após 30 dias sem resposta, o sistema sugere um follow-up pelo mesmo
        canal. O agendamento é feito pelo job <code style={{ fontFamily: "monospace" }}>follow-up-requests</code>
        (Bloco 7). <strong>O sistema nunca envia e-mail sozinho</strong> — você
        sempre decide quando enviar.
      </p>
    </main>
  );
}

function EmptyPendencias() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Recuperação assistida</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-3">Nenhuma pendência por enquanto</h1>
      <p className="text-stone-700 max-w-2xl">
        Você ainda não tem itens marcados como sem evidência. Importe seu
        currículo Lattes para popular sua trajetória — o painel listará aqui as
        instituições com pendências.
      </p>
      <div className="mt-6">
        <Link href="/importar" className="btn-primary">Importar currículo Lattes</Link>
      </div>
    </main>
  );
}

function StatCard({ label, value, accent, muted }: {
  label: string; value: number; accent?: boolean; muted?: boolean;
}) {
  return (
    <div className="card" style={{
      background: accent ? "#f3e3cd" : muted ? "#e9e6dd" : "#fff",
    }}>
      <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">{label}</p>
      <p className="serif text-3xl text-[#0f2942]">{value}</p>
    </div>
  );
}
