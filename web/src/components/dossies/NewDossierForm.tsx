"use client";
// src/components/dossies/NewDossierForm.tsx
// Upload de PDF de edital -> preview da metodologia proposta -> confirmar.

import { useState, useRef } from "react";

type Status = "idle" | "upload" | "parse" | "review" | "saving" | "saved" | "error";

interface ParsedRule {
  categoryLabel: string;
  itemType: string;
  qualisStratum: string | null;
  points: number;
  capPerYear: number | null;
  capPerCategory: number | null;
  capTotal: number | null;
  orderIndex: number;
}

interface ParseResult {
  title: string;
  status: "OK" | "PARCIAL" | "INSUFICIENTE";
  windowYears: number | null;
  applyCaps: boolean;
  coauthorRule: { threshold: number; factor: number } | null;
  rules: ParsedRule[];
  diagnostics: string[];
}

export function NewDossierForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [purpose, setPurpose] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!file) { setError("Selecione um PDF primeiro."); return; }
    setError(null);
    setStatus("upload");
    try {
      // 1. POST /api/dossies/parse — recebe a mesma assinatura do parseEdital().
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/dossies/parse", { method: "POST", body: fd });
      if (!r.ok) throw new Error(`Falha ao parsear edital (HTTP ${r.status})`);
      const result = await r.json() as ParseResult;
      setParsed(result);
      setTitle(result.title || file.name.replace(/\.pdf$/i, ""));
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function saveDossier() {
    if (!parsed) return;
    setStatus("saving");
    try {
      const r = await fetch("/api/dossies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          methodId: parsed.title.includes("Trajetória") ? "tray-v1" : undefined,
          title, purpose, method: parsed,
        }),
      });
      if (!r.ok) throw new Error(`Falha ao salvar (HTTP ${r.status})`);
      const j = await r.json() as { id: string };
      window.location.href = `/dossies/${j.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="edital-form">
      <label className="block">
        <span className="text-sm font-medium">PDF do edital</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:btn-secondary file:mr-3 file:py-2 file:px-4"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Título do dossiê</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder="Progressão UFMT 2026"
          className="mt-1 block w-full border border-[#102A43]/20 rounded p-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Finalidade (opcional)</span>
        <input
          type="text"
          value={purpose}
          onChange={(e) => setPurpose(e.currentTarget.value)}
          placeholder="Ex.: progressão de classe"
          className="mt-1 block w-full border border-[#102A43]/20 rounded p-2"
        />
      </label>

      <button
        type="submit"
        disabled={status === "upload" || !file}
        className="btn-primary disabled:opacity-50"
      >
        {status === "upload" ? "Processando…" : "Importar edital"}
      </button>

      {error && (
        <p className="text-sm text-[#8a2a1f] bg-[#f3dfda] border border-[#8a2a1f]/30 rounded p-2">
          {error}
        </p>
      )}

      {parsed && (
        <section className="mt-6 space-y-4" data-testid="edital-preview">
          <div className="border-l-4 border-[#102A43] pl-3">
            <p className="text-xs uppercase tracking-widest text-[#102A43]/70">Prévia</p>
            <h3 className="serif text-xl">Identificamos estas regras. Confirme ou edite.</h3>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Janela" value={parsed.windowYears ? `${parsed.windowYears} anos` : "vida inteira"} />
            <Field label="Tetos" value={parsed.applyCaps ? "aplicados" : "não"} />
            <Field label="Coautoria" value={parsed.coauthorRule ? `> ${parsed.coauthorRule.threshold} autores, fator ${parsed.coauthorRule.factor}` : "sem regra"} />
            <Field label="Status" value={parsed.status} />
          </dl>

          <details className="bg-[#F1F5F9] rounded p-3">
            <summary className="cursor-pointer text-sm font-medium">Diagnóstico ({parsed.diagnostics.length})</summary>
            <ul className="text-xs space-y-1 mt-2 font-mono">
              {parsed.diagnostics.map((d, i) => <li key={i}>· {d}</li>)}
            </ul>
          </details>

          {parsed.rules.length > 0 ? (
            <table className="w-full text-sm border-collapse border border-[#102A43]/15">
              <thead className="bg-[#F1F5F9] text-left">
                <tr>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Qualis</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">Pontos</th>
                  <th className="p-2">Teto</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rules.map((r, i) => (
                  <tr key={i} className="border-t border-[#102A43]/10">
                    <td className="p-2 font-mono">{r.itemType}</td>
                    <td className="p-2 font-mono">{r.qualisStratum ?? "—"}</td>
                    <td className="p-2">{r.categoryLabel}</td>
                    <td className="p-2 font-medium">{r.points}</td>
                    <td className="p-2 text-xs text-[#102A43]/70">
                      {r.capPerYear ? `${r.capPerYear}/ano` : ""}
                      {r.capPerCategory ? `, ${r.capPerCategory}/cat` : ""}
                      {r.capTotal ? `, total ${r.capTotal}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[#a15a13] bg-[#f3e3cd] border border-[#a15a13]/40 rounded p-3">
              Nenhuma regra extraída automaticamente. Recomenda-se revisão manual.
            </p>
          )}

          <button
            type="button"
            onClick={saveDossier}
            disabled={status === "saving"}
            className="btn-primary disabled:opacity-50"
          >
            {status === "saving" ? "Salvando…" : "Salvar dossiê"}
          </button>
        </section>
      )}
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#102A43]/10 rounded p-2">
      <dt className="text-xs text-[#102A43]/70">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
