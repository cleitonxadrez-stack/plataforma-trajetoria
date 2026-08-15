// src/components/ReviewForm.tsx
// Formulário de revisão do documento — CONFIRMAR / CORRIGIR / DESCARTAR.
//
// REGRA (CLAUDE.md §"IA nunca decide sozinha"):
//   *Nada entra como CONFIRMADO sem ação humana*.
//   O formulário mostra os campos SUGERIDOS pela cascata, mas só persiste
//   após o usuário clicar. Toggle "Editar" libera os inputs.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewExtraction } from "@/lib/domain/actions/review";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import type { DocQueueState } from "@/lib/domain/document-queue";

export interface ReviewFormProps {
  documentId: string;
  currentState: DocQueueState;
  suggested: {
    documentType?: string;
    title?: string;
    institutionName?: string;
    year?: number;
    eventName?: string;
    cargaHoraria?: number;
    doi?: string;
  };
  registryCode: string;
  usedAI: boolean;
  confidence: number | null;
}

const DOC_TYPES = [
  ["CERTIFICADO", "Certificado"],
  ["DIPLOMA", "Diploma"],
  ["ATA", "Ata"],
  ["ARTIGO", "Artigo"],
  ["CAPA_FICHA", "Capa / Ficha"],
  ["OUTROS", "Outros"],
] as const;

export function ReviewForm(props: ReviewFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(props.suggested);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "CONFIRMED" | "DISCARDED">(null);

  if (done) {
    return (
      <div className="card" data-testid={`review-done-${done.toLowerCase()}`}
           style={{ background: done === "CONFIRMED" ? "#d9ece4" : "#f3dfda" }}>
        <p className="serif text-lg"
           style={{ color: done === "CONFIRMED" ? "#168553" : "#8a2a1f" }}>
          {done === "CONFIRMED"
            ? "Documento confirmado. Ele aparece agora na sua trajetória."
            : "Documento descartado. O original foi removido (soft-delete)."}
        </p>
        <button className="btn-secondary mt-4" type="button" onClick={() => router.push("/documentos")}>
          Voltar ao cofre
        </button>
      </div>
    );
  }

  function submit(action: "CONFIRMAR" | "CORRIGIR" | "DESCARTAR") {
    setError(null);
    startTransition(async () => {
      const r = await reviewExtraction({
        documentId: props.documentId,
        action,
        fields: action === "CORRIGIR" || action === "CONFIRMAR" ? fields : undefined,
      });
      if (!r.ok) { setError(r.error); return; }
      setDone(action === "DESCARTAR" ? "DISCARDED" : "CONFIRMED");
    });
  }

  const fieldsEdited =
    JSON.stringify(fields) !== JSON.stringify(props.suggested) ? 1 : 0;

  return (
    <form className="space-y-5" data-testid={`review-form-${props.documentId}`}>
      <header className="card" style={{ background: "#eaf1f7" }}>
        <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-1"
           style={{ fontFamily: "monospace" }}>{props.registryCode}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <DocumentStatusBadge state={props.currentState} />
          {props.usedAI && (
            <span style={{
              fontSize: 11, padding: "2px 8px",
              background: "#f3e3cd", color: "#a15a13",
              borderRadius: 6, letterSpacing: ".08em", textTransform: "uppercase",
            }}>
              IA sugeriu — confirme ou edite
            </span>
          )}
          {props.confidence != null && (
            <span style={{ fontSize: 12, color: "#4a5266" }}>
              Confiança: {Math.round(props.confidence * 100)}%
            </span>
          )}
        </div>
      </header>

      <fieldset className="card" disabled={!editing}>
        <legend style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px" }}>
          <span className="text-xs uppercase tracking-[.1em] text-stone-500">Campos sugeridos</span>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              data-testid="toggle-edit"
              checked={editing}
              onChange={(e) => setEditing(e.target.checked)}
            />{" "}
            Editar
          </label>
        </legend>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-stone-600 mb-1">Tipo</span>
            <select
              className="input"
              data-testid="field-documentType"
              value={fields.documentType ?? ""}
              onChange={(e) => setFields({ ...fields, documentType: e.target.value })}
            >
              <option value="">—</option>
              {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-stone-600 mb-1">Ano</span>
            <input
              type="number" min="1900" max="2100"
              className="input"
              data-testid="field-year"
              value={fields.year ?? ""}
              onChange={(e) => setFields({ ...fields, year: Number(e.target.value) || undefined })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-stone-600 mb-1">Título</span>
            <input
              type="text" className="input"
              data-testid="field-title"
              value={fields.title ?? ""}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-stone-600 mb-1">Instituição</span>
            <input
              type="text" className="input"
              data-testid="field-institutionName"
              value={fields.institutionName ?? ""}
              onChange={(e) => setFields({ ...fields, institutionName: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-stone-600 mb-1">Evento (se aplicável)</span>
            <input
              type="text" className="input"
              data-testid="field-eventName"
              value={fields.eventName ?? ""}
              onChange={(e) => setFields({ ...fields, eventName: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-stone-600 mb-1">Carga horária</span>
            <input
              type="number" min="0" className="input"
              data-testid="field-cargaHoraria"
              value={fields.cargaHoraria ?? ""}
              onChange={(e) => setFields({ ...fields, cargaHoraria: Number(e.target.value) || undefined })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-stone-600 mb-1">DOI</span>
            <input
              type="text" className="input" style={{ fontFamily: "monospace" }}
              data-testid="field-doi"
              value={fields.doi ?? ""}
              onChange={(e) => setFields({ ...fields, doi: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      {error && (
        <p className="text-sm text-[#8a2a1f] bg-[#f3dfda] border border-[#f3dfda] rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          data-testid="action-confirmar"
          disabled={pending || props.currentState === "CONFIRMADO"}
          onClick={() => submit(editing && fieldsEdited > 0 ? "CORRIGIR" : "CONFIRMAR")}
        >
          {pending ? "Salvando…" : (editing && fieldsEdited > 0 ? "Salvar correção" : "Confirmar")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="action-descartar"
          disabled={pending}
          onClick={() => submit("DESCARTAR")}
        >
          Descartar
        </button>
        <span style={{ flex: 1 }} />
        {editing && fieldsEdited > 0 && (
          <span style={{ fontSize: 12, color: "#1F5EFF", alignSelf: "center" }}>
            {fieldsEdited} campo{fieldsEdited > 1 ? "s" : ""} editado
          </span>
        )}
      </div>

      <p className="text-xs text-stone-500" style={{ background: "#dce8f6", padding: 10, borderRadius: 8 }}>
        ⚠ Esta ação é <strong>manual e humana</strong>. A IA apenas sugeriu os campos acima
        (Backlog §2.4 — "Confirme ou edite").
      </p>
    </form>
  );
}
