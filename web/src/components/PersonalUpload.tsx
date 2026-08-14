"use client";

import { useRef, useState } from "react";
import { uploadPersonalDoc } from "@/lib/domain/actions/personal-upload";

export function PersonalUpload({
  category, title, desc, icon, accept = ".pdf,image/*", preview,
}: {
  category: string; title: string; desc: string; icon: string;
  accept?: string; preview?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(f: File) {
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("file", f); fd.append("category", category); fd.append("label", title);
    const r = await uploadPersonalDoc(fd);
    setBusy(false);
    if (!r.ok) setErr(r.error); else window.location.reload();
  }

  const isImg = category === "FOTO" || category === "ASSINATURA";

  return (
    <div className="pd-upload-card">
      {isImg && preview ? (
        <img className="pd-upload-preview" src={preview} alt={title} />
      ) : (
        <div className="pd-upload-icon">{icon}</div>
      )}
      <div style={{ minWidth: 0 }}>
        <p className="pd-upload-title">{title}</p>
        <p className="pd-upload-desc">{err ? <span style={{ color: "#b91c1c" }}>{err}</span> : desc}</p>
      </div>
      <button type="button" className="pd-copy" style={{ marginLeft: "auto" }}
        disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Enviando…" : preview ? "Trocar" : "Enviar"}
      </button>
      <input ref={ref} type="file" accept={accept} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
    </div>
  );
}
