// src/app/trajetoria/page.tsx
// Tela de TRAJETÓRIA — Bloco 3 do backlog, item 18 §3.
//
// Server Component. Lê academic_items via Supabase com RLS.
//
// Política de fallback (lib/ui/data-source.ts):
//   - PRODUÇÃO + DB vazio: empty-state com CTA ("importe seu Lattes").
//   - DEV + DB vazio: MOCK_ITEMS com badge "modo demonstração".

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { countByState, groupByYear, reconcile, type ItemView, type ItemType, type ItemState, type ItemNature, type EvidenceStatus } from "@/lib/domain/items";
import { MOCK_ITEMS } from "@/mocks/extraction-fixtures";
import { SeloComprovacao } from "@/components/SeloComprovacao";
import { chooseDataSource, FALLBACK_BADGE } from "@/lib/ui/data-source";

export const metadata = { title: "Trajetória — Trajetória360" };
export const dynamic = "force-dynamic";

interface RawItemRow {
  id: string;
  item_type: string;
  title: string;
  title_en: string | null;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  issn: string | null;
  visibilidade?: string | null;
  visibility: string;
  natureza: string | null;
  verification_level: string;
  evidence_status: string;
  flagged_innovation: boolean | null;
  flagged_lattes: boolean | null;
}

const ALLOWED_TYPES = ["ARTIGO", "CAPITULO", "CERTIFICADO", "DIPLOMA", "CAPA_FICHA", "OUTROS"];
const ALLOWED_NATURE = ["TRABALHO_COMPLETO", "APRESENTACAO", "FORMACAO", "CAPITULO", "ATIVIDADE_ENSINO", "OUTROS"];
const ALLOWED_STATES = ["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"];
const ALLOWED_EVIDENCE = ["SEM_COMPROVANTE", "COM_COMPROVANTE_PARCIAL", "COMPROVADO"];

/** Mapeia academic_items (raw) → ItemView (domínio). */
function toItemView(r: RawItemRow, evidenceCount: number): ItemView {
  return {
    id: r.id,
    title: r.title,
    titleEn: r.title_en ?? null,
    itemType: (ALLOWED_TYPES.includes(r.item_type) ? r.item_type : "OUTROS") as ItemType,
    year: r.year ?? 0,
    doi: r.doi ?? null,
    nature: (ALLOWED_NATURE.includes(r.natureza ?? "") ? r.natureza : "OUTROS") as ItemNature,
    state: (ALLOWED_STATES.includes(r.verification_level) ? r.verification_level : "AUTODECLARADO") as ItemState,
    evidenceStatus: (ALLOWED_EVIDENCE.includes(r.evidence_status) ? r.evidence_status : "SEM_COMPROVANTE") as EvidenceStatus,
    evidenceCount,
    citationCount: 0,
    flaggedInnovation: !!r.flagged_innovation,
    flaggedLattes: !!r.flagged_lattes,
    needsReview: false,
    visibility: (r.visibility === "PUBLICO" ? "PUBLICO" : "PRIVADO") as ItemView["visibility"],
  };
}

const STATE_LABEL: Record<ItemView["state"], string> = {
  AUTODECLARADO: "Autodeclarado",
  CONFIRMADO: "Confirmado",
  DOCUMENTADO: "Documentado",
  VALIDADO: "Validado",
};

function ItemCard({ item }: { item: ItemView }) {
  const r = reconcile({ state: item.state, evidenceCount: item.evidenceCount });
  const doiBadge = item.doi ? (
    <span title={item.doi}
          style={{ fontFamily: "monospace", fontSize: 12, color: "#205b80" }}>
      DOI · {item.doi.length > 24 ? item.doi.slice(0, 24) + "…" : item.doi}
    </span>
  ) : null;

  return (
    <article className="card" style={{ marginBottom: 14 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">
            {item.itemType} · {item.year}
          </p>
          <h3 className="serif text-[22px] text-[#0f2942] leading-snug">{item.title}</h3>
          {item.titleEn && (
            <p className="text-sm italic text-stone-600 mt-1">{item.titleEn}</p>
          )}
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <SeloComprovacao status={r.evidenceStatus} />
          <span className="text-xs text-stone-500">{STATE_LABEL[item.state]}</span>
        </div>
      </header>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {doiBadge}
        {item.flaggedInnovation && (
          <span title="FLAG-POTENCIAL-INOVACAO=SIM (Lattes)"
            style={{
              padding: "2px 8px", fontSize: 11, letterSpacing: ".08em",
              textTransform: "uppercase", color: "#0d6b52",
              background: "#e3efe9", borderRadius: 6,
            }}>
            Inovação
          </span>
        )}
        {item.flaggedLattes && (
          <span title="Importado do XML Lattes"
            style={{
              padding: "2px 8px", fontSize: 11, letterSpacing: ".08em",
              textTransform: "uppercase", color: "#205b80",
              background: "#e1ecf5", borderRadius: 6,
            }}>
            Lattes
          </span>
        )}
        {item.evidenceCount > 0 && (
          <span className="text-xs text-stone-500">
            · {item.evidenceCount} {item.evidenceCount === 1 ? "evidência" : "evidências"}
          </span>
        )}
      </div>

      {r.needsReview && (
        <p className="text-xs text-[#a15a13] mt-3"
           style={{ background: "#f3e3cd", padding: 8, borderRadius: 6 }}>
          Requer revisão humana: confirme ou edite.
        </p>
      )}
    </article>
  );
}

export default async function TrajetoriaPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/entrar?redirect=/trajetoria");

  // ── 1. SELECT academic_items via RLS ────────────────────────────
  const { data: rawRows, error: aiErr } = await supabase
    .from("academic_items")
    .select("id,item_type,title,title_en,year,doi,isbn,issn,natureza,verification_level,evidence_status,visibility,flagged_innovation,flagged_lattes")
    .eq("user_id", data.user.id)
    .is("deleted_at", null)
    .order("year", { ascending: false });
  if (aiErr) {
    return <ErrorTrajetoria message={aiErr.message} />;
  }

  // ── 2. Contagem de evidências por item (sub-query agregada) ──────
  const itemIds = (rawRows ?? []).map((r: RawItemRow) => r.id);
  let evidenceCount = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: evidences } = await supabase
      .from("evidences")
      .select("academic_item_id")
      .in("academic_item_id", itemIds)
      .is("deleted_at", null);
    for (const e of (evidences ?? []) as Array<{ academic_item_id: string }>) {
      evidenceCount.set(e.academic_item_id, (evidenceCount.get(e.academic_item_id) ?? 0) + 1);
    }
  }

  // ── 3. Mapear para ItemView ─────────────────────────────────────
  const itemsFromDb: ItemView[] = ((rawRows ?? []) as RawItemRow[])
    .map((r) => toItemView(r, evidenceCount.get(r.id) ?? 0))
    .map((it) => {
      const r = reconcile({ state: it.state, evidenceCount: it.evidenceCount });
      return { ...it, evidenceStatus: r.evidenceStatus, needsReview: r.needsReview };
    });

  const decision = chooseDataSource({
    profileFound: false,
    itemsFound: itemsFromDb.length > 0,
    interruptionsFound: false,
    institutionsFound: false,
    fromDb: { items: itemsFromDb },
    fallback: {
      items: process.env.NODE_ENV !== "production" ? MOCK_ITEMS : [],
    },
  });
  const items = decision.data.items;

  // PRODUÇÃO sem dados.
  if (decision.isEmpty) {
    return <EmptyTrajetoria />;
  }

  const totals = countByState(items);
  const groups = groupByYear(items);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Trajetória</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-1">Sua linha do tempo intelectual</h1>
      <p className="text-stone-600 max-w-2xl mt-2">
        Cada item começa como <strong>autodeclarado</strong> e só passa a <strong>validado</strong> depois que
        você confirma e vincula um documento. Sem gamificação, sem ranking.
      </p>

      {decision.usingMock && (
        <p className="mt-4 text-xs text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-2">
          ⚠ {FALLBACK_BADGE}
        </p>
      )}

      <section
        className="grid sm:grid-cols-4 gap-3 mt-8"
        aria-label="Distribuição por estado"
      >
        {(["AUTODECLARADO", "CONFIRMADO", "DOCUMENTADO", "VALIDADO"] as const).map((s) => (
          <div key={s} className="card">
            <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">{STATE_LABEL[s]}</p>
            <p className="serif text-3xl text-[#0f2942]">{totals[s]}</p>
          </div>
        ))}
      </section>

      {groups.map(({ year, items }) => (
        <section key={year} style={{ marginTop: 36 }}>
          <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <h2 className="serif text-2xl text-[#0f2942]">{year}</h2>
            <span className="text-stone-500 text-sm">{items.length} {items.length === 1 ? "item" : "itens"}</span>
            <span style={{ flex: 1, height: 1, background: "#cddcec", display: "inline-block" }} />
          </header>
          {items.map((it) => <ItemCard key={it.id} item={it} />)}
        </section>
      ))}

      <footer className="card mt-10 bg-stone-50">
        <p className="text-sm text-stone-700">
          <strong>Próximo passo:</strong> adicione itens via{" "}
          <Link href="/importar" className="text-[#0d6b52] underline">/importar</Link>{" "}
          (Lattes) ou{" "}
          <Link href="/trajetoria/novo" className="text-[#0d6b52] underline">/trajetoria/novo</Link>
          (manual). Cada item entra como <em>AUTODECLARADO</em> até você confirmar.
        </p>
      </footer>
    </main>
  );
}

function EmptyTrajetoria() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Trajetória</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-3">Sua linha do tempo está vazia</h1>
      <p className="text-stone-700 max-w-2xl">
        Importe seu currículo Lattes e seus indicadores pessoais aparecem aqui
        imediatamente, organizados por ano. Cada item começa como
        <em>autodeclarado</em> até você confirmar manualmente.
      </p>
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link href="/importar" className="btn-primary">Importar currículo Lattes</Link>
        <Link href="/trajetoria/novo" className="btn-secondary">Adicionar manualmente</Link>
      </div>
    </main>
  );
}

function ErrorTrajetoria({ message }: { message: string }) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Trajetória</p>
      <h1 className="serif text-3xl text-[#8a2a1f] mb-3">Não foi possível carregar sua trajetória</h1>
      <p className="text-sm text-stone-700">Erro: {message}</p>
      <p className="text-xs text-stone-500 mt-4">
        Tente recarregar a página. Se persistir, contate o suporte.
      </p>
    </main>
  );
}
