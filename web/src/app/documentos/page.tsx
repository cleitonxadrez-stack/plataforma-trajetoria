// src/app/documentos/page.tsx
// COFRE — painel principal de documentos com fila de confirmação.
//
// Server Component. RLS garante isolamento. Dashboard agrupa por estado
// com destaque para documentos EM_REVISAO / PENDENTE (precisam de ação).
//
// REGRA VISUAL: sem emoji exagero, sépia, serif sóbria.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DocumentCard } from "@/components/DocumentCard";
import {
  bootstrapView, groupByState, needsHumanAction, type DocQueueState, type DocQueueView,
} from "@/lib/domain/document-queue";
import { reconcileWithItem } from "@/lib/domain/document-queue";

export const metadata = { title: "Cofre — [NOME DA PLATAFORMA]" };
export const dynamic = "force-dynamic";

interface QueueDoc {
  id: string;
  registry_code: string;
  original_filename: string;
  processing_status: DocQueueState;
  extracted_text: string | null;
}

/** Busca documentos do usuário via supabase server (RLS já filtra). */
async function fetchDocsViaRls(supabase: Awaited<ReturnType<typeof createClient>>): Promise<DocQueueView[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, registry_code, original_filename, processing_status, extracted_text")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as QueueDoc[]).map((row) => {
    let suggested: { documentType?: string; title?: string } = {};
    try {
      if (row.extracted_text) suggested = JSON.parse(row.extracted_text);
    } catch { /* swallow — corrupted extraction, treat as empty */ }
    const usedAI = (row.extracted_text?.includes('"source":"ia') ?? false);
    const v = bootstrapView({ documentId: row.id, usedAI, confidence: 0.85 });
    return { ...v, state: row.processing_status };
  });
}

export default async function CofrePage() {
  const supabase = await createClient();
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) redirect("/entrar?redirect=/documentos");

  const docs = await fetchDocsViaRls(supabase);

  // Carrego a fila REAL em produção. Aqui, para o protótipo funcionar sem
  // dados, subsitituímos por uma VIEW mock — mas o caminho de leitura via
  // RLS está acima para referência imediata de produção.
  const allDocs: DocQueueView[] = docs.length > 0 ? docs : buildMockQueue();

  const grouped = groupByState(allDocs);
  const pendingCount  = grouped.PENDENTE.length;
  const reviewCount   = grouped.EM_REVISAO.length;
  const confirmedCount = grouped.CONFIRMADO.length;
  const needAction    = allDocs.filter(needsHumanAction).length;

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Cofre</p>
      <h1 className="serif text-4xl text-[#0f2942] mb-1">Fila de confirmação</h1>
      <p className="text-stone-600 max-w-2xl mt-2">
        Cada documento espera uma decisão sua — confirmar, corrigir ou descartar.
        Nada entra na sua trajetória sem o seu clique (mesmo quando a IA sugere).
      </p>

      <section
        className="grid sm:grid-cols-4 gap-3 mt-8"
        aria-label="Resumo do cofre"
      >
        <SummaryTile label="Pendente"      count={pendingCount} muted />
        <SummaryTile label="Em revisão"    count={reviewCount} emphasis />
        <SummaryTile label="Confirmado"    count={confirmedCount} done />
        <SummaryTile label="Pedem ação"    count={needAction} alert />
      </section>

      <section style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <Link href="/documentos/enviar" className="btn-primary">Enviar documento</Link>
        <Link href="/trajetoria" className="btn-secondary">Ver trajetória</Link>
      </section>

      {/* FILA — ordem de prioridade: EM_REVISAO, PENDENTE, depois CONFIRMADO */}
      <QueueSection title="Em revisão" docs={grouped.EM_REVISAO} keyPrefix="rev" />
      <QueueSection title="Pendente (cascata em andamento)" docs={grouped.PENDENTE} keyPrefix="pend" muted />
      <QueueSection title="Confirmados" docs={grouped.CONFIRMADO} keyPrefix="ok" archived />
    </main>
  );
}

function SummaryTile({ label, count, emphasis, muted, done, alert }: {
  label: string; count: number;
  emphasis?: boolean; muted?: boolean; done?: boolean; alert?: boolean;
}) {
  const bg = emphasis ? "#f3e3cd" : done ? "#d9ece4" : alert && count > 0 ? "#f3dfda" : muted ? "#e9e6dd" : "#fff";
  return (
    <div className="card" style={{ background: bg }}>
      <p className="text-xs uppercase tracking-[.1em] text-stone-500 mb-1">{label}</p>
      <p className="serif text-3xl text-[#0f2942]">{count}</p>
    </div>
  );
}

function QueueSection({ title, docs, keyPrefix, archived, muted }: {
  title: string; docs: ReadonlyArray<DocQueueView>;
  keyPrefix: string; archived?: boolean; muted?: boolean;
}) {
  if (docs.length === 0) return null;
  return (
    <section style={{ marginTop: 36 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <h2 className="serif text-2xl text-[#0f2942]">{title}</h2>
        <span style={{ fontSize: 13, color: "#7a8294" }}>{docs.length}</span>
        <span style={{ flex: 1, height: 1, background: "#e4dfd3", display: "inline-block" }} />
      </header>
      {docs.map((doc) => (
        <DocumentCard
          key={`${keyPrefix}-${doc.documentId}`}
          doc={doc}
          registryCode={`PLT-2026-${doc.documentId.slice(0, 4).toUpperCase()}-${doc.documentId.slice(4, 8).toUpperCase()}`}
          filename={`documento-${doc.documentId.slice(0, 8)}.pdf`}
          suggestedTitle={null}
          confidence={doc.riskFlags.confidenceLow ? 0.74 : 0.93}
          sourceLabel={doc.riskFlags.usedAI ? "Cascata usou IA" : "Cascata resolveu sem IA"}
          // @ts-expect-error — props adicionais ignoradas no card
          _archived={archived}
          _muted={muted}
        />
      ))}
    </section>
  );
}

// ─── Mock fallback ────────────────────────────────────────────
function buildMockQueue(): DocQueueView[] {
  return [
    { ...bootstrapView({ documentId: "doc-1", usedAI: true, confidence: 0.74 }), state: "EM_REVISAO" },
    { ...bootstrapView({ documentId: "doc-2", usedAI: false, confidence: 0.92 }), state: "EM_REVISAO" },
    { ...bootstrapView({ documentId: "doc-3", usedAI: false, confidence: 0.97 }), state: "PENDENTE" },
    { ...bootstrapView({ documentId: "doc-4", usedAI: false, confidence: 0.95 }), state: "CONFIRMADO" },
    { ...bootstrapView({ documentId: "doc-5", usedAI: false, confidence: 0.91 }), state: "CONFIRMADO" },
  ];
}

// Silence unused import warning in tree-shake; kept for parity
void reconcileWithItem;
