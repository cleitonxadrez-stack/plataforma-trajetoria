"use client";

// src/components/UploadForm.tsx
// Envio de documento para o Cofre. Chama a server action `uploadDocument`,
// que salva o original em R2 (bucket frio) + registra em `documents` com um
// código PLT-AAAA-XXXX-XXXX e enfileira a extração.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { uploadDocument, type UploadResult } from "@/lib/domain/actions/upload";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff,.doc,.docx";
const MAX_MB = 50;

export function UploadForm() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<UploadResult, { ok: true }> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione um arquivo.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Arquivo acima de ${MAX_MB} MB.`);
      return;
    }
    startTransition(async () => {
      const res = await uploadDocument(formData);
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
    });
  }

  // ── Tela de sucesso ────────────────────────────────────────────
  if (result) {
    const isDup = result.status === "DUPLICADO";
    return (
      <div className="card" style={{ borderColor: "#c5dcd0", background: "#e6f2ec" }}>
        <p className="serif text-lg text-accent mb-1">
          {isDup ? "Documento já estava no cofre" : "Documento enviado!"}
        </p>
        <p className="text-sm text-muted mb-4">
          {isDup
            ? "Detectamos que este arquivo já foi enviado antes (mesmo conteúdo)."
            : "Salvo com segurança. A extração vai rodar em segundo plano."}
        </p>
        <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-[.12em] text-soft mb-1">Código de verificação</p>
          <p className="font-mono text-lg text-primary">{result.registryCode}</p>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => { setResult(null); setFileName(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="btn-primary"
          >
            Enviar outro
          </button>
          <Link href="/documentos" className="btn-secondary">Voltar ao cofre</Link>
        </div>
      </div>
    );
  }

  // ── Formulário ─────────────────────────────────────────────────
  return (
    <form action={onSubmit} className="space-y-5">
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white px-6 py-12 text-center transition-colors hover:border-info hover:bg-[#f2f7fc]"
      >
        <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-[#EAF2FF] text-info">
          ↑
        </span>
        <span className="serif text-lg text-primary">
          {fileName ?? "Escolher arquivo"}
        </span>
        <span className="mt-1 text-sm text-muted">
          PDF, imagem (JPG/PNG/HEIC/TIFF) ou Word · até {MAX_MB} MB
        </span>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      {error && (
        <div className="rounded-lg border border-[#e6c6c0] px-4 py-3 text-sm text-danger" style={{ background: "#f7e9e6" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !fileName} className="btn-primary disabled:opacity-50">
          {pending ? "Enviando…" : "Enviar documento"}
        </button>
        <Link href="/documentos" className="btn-secondary">Cancelar</Link>
      </div>

      <p className="text-xs text-soft">
        Seu arquivo é privado por padrão. Cada documento recebe um código público de
        verificação — mas o conteúdo só você vê.
      </p>
    </form>
  );
}
