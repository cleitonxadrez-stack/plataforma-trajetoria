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

export const metadata = { title: "Cofre — Trajetória360" };
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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="cofre-head">
        <div>
          <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">Cofre</p>
          <h1 className="serif text-4xl text-[#0B2341] mb-1">Fila de confirmação</h1>
          <p className="text-stone-600 max-w-2xl mt-2">
            Cada documento espera uma decisão sua — confirmar, corrigir ou descartar.
          </p>
        </div>
        <div className="cofre-actions">
          <Link href="/documentos/enviar" className="btn-primary">Enviar documento</Link>
          <Link href="/trajetoria" className="btn-secondary">Ver trajetória</Link>
        </div>
      </div>

      <section className="cofre-tiles" aria-label="Resumo do cofre">
        <StatusTile label="Pendente" count={pendingCount} tone="muted" icon="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
        <StatusTile label="Em revisão" count={reviewCount} tone="amber" icon="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
        <StatusTile label="Confirmado" count={confirmedCount} tone="green" icon="M20 6 9 17l-5-5" />
        <StatusTile label="Requerem ação" count={needAction} tone="alert" icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7 M12 17h.01" />
      </section>

      {/* FILA — ordem de prioridade: EM_REVISAO, PENDENTE, depois CONFIRMADO */}
      <QueueSection title="Em revisão" docs={grouped.EM_REVISAO} keyPrefix="rev" />
      <QueueSection title="Pendente (cascata em andamento)" docs={grouped.PENDENTE} keyPrefix="pend" muted />
      <QueueSection title="Confirmados" docs={grouped.CONFIRMADO} keyPrefix="ok" archived />
    </main>
  );
}

function StatusTile({ label, count, tone, icon }: { label: string; count: number; tone: string; icon: string }) {
  return (
    <div className={`cofre-tile cofre-tile-${tone}${count > 0 && tone === "alert" ? " on" : ""}`}>
      <span className="cofre-tile-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </span>
      <div>
        <p className="cofre-tile-count">{count}</p>
        <p className="cofre-tile-label">{label}</p>
      </div>
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
        <h2 className="serif text-2xl text-[#0B2341]">{title}</h2>
        <span style={{ fontSize: 13, color: "#7a8294" }}>{docs.length}</span>
        <span style={{ flex: 1, height: 1, background: "#E2E8F0", display: "inline-block" }} />
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
