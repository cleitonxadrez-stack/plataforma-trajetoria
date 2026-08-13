"use client";

// src/components/LattesImporter.tsx
// Componente client do upload de XML — UI interativa.
// Submete via fetch para /api/lattes/import.
// Resumo do parser puro é exibido ANTES do upload (simulação local).

import { useState } from "react";
// O parser é PURO (regex, sem deps de servidor) → roda no client para a
// pré-visualização. NÃO pode ser passado como prop (função não serializável
// de Server → Client Component; era a causa do "Application error").
import { planLattesImport, type ParsedLattesImport } from "../../lib/domain/lattes-import";

export interface LattesImporterProps {
  endpoint: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "preview"; plan: ParsedLattesImport; filename: string }
  | { kind: "uploading"; filename: string }
  | { kind: "done"; imported: number; deduped: number; sensitiveIgnored: number; jobId: string | null }
  | { kind: "error"; message: string };

export function LattesImporter({ endpoint }: LattesImporterProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onFile(file: File) {
    setStatus({ kind: "uploading", filename: file.name });

    // Preview local ANTES do upload — lê como text (XML é texto, não binário).
    try {
      const text = await file.text();

      // Mock userId localmente — o `plan` é determinístico e a planilha
      // pura não usa o id. O id real é o do servidor, injetado pela API.
      const dummyId = "00000000-0000-0000-0000-000000000000";
      const plan = planLattesImport(text, dummyId);
      setStatus({ kind: "preview", plan, filename: file.name });
    } catch (e) {
      setStatus({ kind: "error", message: `Falha ao ler arquivo: ${(e as Error).message}` });
      return;
    }

    // POST real para a API
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus({ kind: "error", message: body?.error ?? `HTTP ${res.status}` });
      return;
    }
    const j = await res.json() as {
      imported: number; deduped: number; sensitiveIgnored: number; jobId: string | null;
    };
    setStatus({ kind: "done", imported: j.imported, deduped: j.deduped, sensitiveIgnored: j.sensitiveIgnored, jobId: j.jobId });
  }

  return (
    <div data-testid="lattes-importer">
      <label
        htmlFor="lattes-file"
        className="btn-primary inline-block cursor-pointer mb-3"
      >
        Escolher arquivo XML…
      </label>
      <input
        id="lattes-file"
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {status.kind === "uploading" && (
        <p className="text-sm text-stone-600">Enviando <span className="font-mono">{status.filename}</span>…</p>
      )}

      {status.kind === "preview" && (
        <section className="bg-[#f3f0eb] border rounded p-4 mt-4">
          <p className="text-sm text-[#0f2942]">
            Pré-visualização: <strong>{status.plan.rows.length}</strong> itens serão inseridos,
            <strong className="ml-1"> {status.plan.sensitiveIgnored}</strong> campos sensíveis foram
            sanitizados, e <strong>{status.plan.categoryFallbackCount}</strong> categorias fora
            do mapeamento caíram em "OUTROS".
          </p>
          {status.plan.fullName && (
            <p className="text-xs text-stone-500 mt-2">
              Titular: <span className="font-mono">{status.plan.fullName}</span>
            </p>
          )}
        </section>
      )}

      {status.kind === "done" && (
        <section className="bg-[#e3efe9] border border-[#0d6b52]/40 rounded p-4 mt-4">
          <p className="text-sm text-[#0d6b52]">
            ✓ Importação concluída — <strong>{status.imported}</strong> novos itens,
            <strong className="ml-1"> {status.deduped}</strong> já existentes (dedupe),
            <strong className="ml-1"> {status.sensitiveIgnored}</strong> campos sensíveis
            protegidos.
          </p>
          {status.jobId && (
            <p className="text-xs text-stone-500 mt-1 font-mono">job: {status.jobId.slice(0, 8)}</p>
          )}
        </section>
      )}

      {status.kind === "error" && (
        <section className="bg-[#fbeae0] border border-[#8a2a1f]/40 rounded p-4 mt-4">
          <p className="text-sm text-[#8a2a1f]">✗ {status.message}</p>
        </section>
      )}
    </div>
  );
}
