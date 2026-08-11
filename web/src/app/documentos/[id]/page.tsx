// src/app/documentos/[id]/page.tsx
// Detalhe do documento — vê resumo + audit trail completo.

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { bootstrapView, type DocQueueState } from "@/lib/domain/document-queue";
import { DocumentStatusBadge } from "@/components/DocumentStatusBadge";

export const metadata = { title: "Documento — Cofre" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

interface DocRow {
  id: string;
  registry_code: string;
  original_filename: string;
  processing_status: DocQueueState;
  mime_type: string;
  size_original: number;
  sha256: string;
  created_at: string;
  extracted_text: string | null;
}

export default async function DocumentoDetalhe({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) redirect(`/entrar?redirect=/documentos/${id}`);

  const { data: row } = await supabase
    .from("documents")
    .select("id, registry_code, original_filename, processing_status, mime_type, size_original, sha256, created_at, extracted_text")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<DocRow>();

  if (!row) notFound();

  const view = bootstrapView({
    documentId: row.id,
    usedAI: (row.extracted_text?.includes('"source":"ia') ?? false),
    confidence: 0.85,
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">
        <Link href="/documentos" className="hover:underline">← Cofre</Link>
      </p>
      <h1 className="serif text-3xl text-[#0f2942] mb-1" style={{ wordBreak: "break-word" }}>
        {row.original_filename}
      </h1>
      <p className="text-xs text-stone-500 mb-6" style={{ fontFamily: "monospace" }}>
        {row.registry_code}
      </p>

      <section className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <DocumentStatusBadge state={row.processing_status} />
          {view.riskFlags.usedAI && (
            <span style={{
              fontSize: 11, padding: "2px 8px",
              background: "#f3e3cd", color: "#a15a13",
              borderRadius: 6, letterSpacing: ".08em", textTransform: "uppercase",
            }}>
              IA foi usada no passo 6
            </span>
          )}
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px 16px", fontSize: 14 }}>
          <dt style={{ color: "#7a8294" }}>MIME</dt><dd style={{ fontFamily: "monospace" }}>{row.mime_type}</dd>
          <dt style={{ color: "#7a8294" }}>Tamanho</dt><dd>{(row.size_original / 1024).toFixed(1)} KiB</dd>
          <dt style={{ color: "#7a8294" }}>SHA-256</dt><dd style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{row.sha256.slice(0, 16)}…</dd>
          <dt style={{ color: "#7a8294" }}>Recebido em</dt><dd>{new Date(row.created_at).toLocaleString("pt-BR")}</dd>
        </dl>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="serif text-xl text-[#0f2942] mb-2">Histórico (audit)</h2>
        <ol className="card" style={{ listStyle: "none", padding: 0 }}>
          {view.audit.map((ev, i) => (
            <li key={i}
                style={{ padding: "12px 22px", borderBottom: i === view.audit.length - 1 ? "none" : "1px solid #e4dfd3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontFamily: "monospace", color: "#205b80" }}>{ev.action}</span>
                <span style={{ color: "#7a8294" }}>{ev.at}</span>
              </div>
              <div style={{ fontSize: 12, color: "#4a5266", marginTop: 4 }}>
                Origem: <strong>{ev.by}</strong>{ev.notes ? ` · ${ev.notes}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div style={{ marginTop: 24 }}>
        <Link href={`/documentos/revisar?doc=${id}`} className="btn-primary">
          Revisar agora
        </Link>
      </div>
    </main>
  );
}
