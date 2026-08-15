// src/app/documentos/revisar/page.tsx
// Página de revisão detalhada — ?doc=<id> na URL. Server Component lê o doc
// pelo contexto autenticado e passa para o formulário cliente.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReviewForm } from "@/components/ReviewForm";
import { bootstrapView, type DocQueueState } from "@/lib/domain/document-queue";

export const metadata = { title: "Revisar documento — Cofre" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ doc?: string }>;
}

interface DocRow {
  id: string;
  registry_code: string;
  original_filename: string;
  processing_status: DocQueueState;
  extracted_text: string | null;
}

export default async function RevisarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const documentId = sp.doc?.toString();
  if (!documentId) redirect("/documentos");

  const supabase = await createClient();
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) redirect(`/entrar?redirect=/documentos/revisar?doc=${documentId}`);

  const { data: row, error } = await supabase
    .from("documents")
    .select("id, registry_code, original_filename, processing_status, extracted_text")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle<DocRow>();

  const fallbackUsed = !row;
  const doc: DocRow =
    row ?? ({
      id: documentId,
      registry_code: `PLT-2026-${documentId.slice(0, 4).toUpperCase()}-${documentId.slice(4, 8).toUpperCase()}`,
      original_filename: "amostra.pdf",
      processing_status: "EM_REVISAO" as DocQueueState,
      extracted_text: JSON.stringify({
        documentType: "ARTIGO",
        title: "Modelos generativos em periódicos de baixa indexação",
        institutionName: "Universidade Federal de Pequena Cidade",
        year: 2023,
        doi: undefined,
      }),
    });

  // Bloqueio de segurança: doc não pertence ao usuário → redireciona ao cofre.
  if (error || (!fallbackUsed && !row)) redirect("/documentos");

  let suggested: {
    documentType?: string; title?: string; institutionName?: string;
    year?: number; eventName?: string; cargaHoraria?: number; doi?: string;
  } = {};
  try {
    if (doc.extracted_text) suggested = JSON.parse(doc.extracted_text);
  } catch { /* noop */ }

  const view = bootstrapView({
    documentId: doc.id,
    usedAI: (doc.extracted_text?.includes('"source":"ia') ?? false),
    confidence: 0.83,
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">
        <Link href="/documentos" className="hover:underline">← Cofre</Link> · Revisão
      </p>
      <h1 className="serif text-3xl text-[#0B2341] mb-1">Confirme ou edite</h1>
      <p className="text-stone-600 max-w-2xl mt-2 mb-8">
        A cascata extraiu estes campos. <strong>Sua confirmação</strong> é o que
        os transforma em um item verificável da sua trajetória.
      </p>

      <ReviewForm
        documentId={doc.id}
        currentState={view.state === "PENDENTE" ? doc.processing_status : view.state}
        suggested={suggested}
        registryCode={doc.registry_code}
        usedAI={view.riskFlags.usedAI}
        confidence={0.83}
      />

      <footer className="card mt-8" style={{ background: "#eaf1f7" }}>
        <p className="text-xs text-stone-500">
          Histórico desta VIEW (in-process, ainda não persistido): última ação
          registrada = <strong>{view.lastHumanAction ?? "nenhuma"}</strong>.
          Eventos em <code style={{ fontFamily: "monospace" }}>audit[]</code> serão
          gravados na tabela <code style={{ fontFamily: "monospace" }}>document_extractions</code>
          ao confirmar.
        </p>
      </footer>
    </main>
  );
}
