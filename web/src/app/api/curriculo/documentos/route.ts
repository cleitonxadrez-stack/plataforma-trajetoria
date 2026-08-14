// src/app/api/curriculo/documentos/route.ts
// GET — junta TODOS os documentos (PDFs) do usuário num único PDF, com capa.
// Reaproveita R2 (getObject) + pdf-lib. Somente PDFs entram na mesclagem;
// imagens/outros formatos são listados na capa mas não mesclados (v1).

import { createClient } from "@/lib/supabase/server";
import { getObject } from "@/lib/storage/r2";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A4: [number, number] = [595.28, 841.89];

function safe(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x00-\xFF]/g, "");
}

export async function GET() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new Response("Não autenticado.", { status: 401 });

  const { data: rows } = await sb
    .from("documents")
    .select("id, original_filename, storage_key_original, mime_type, registered_at")
    .eq("user_id", u.user.id)
    .is("deleted_at", null)
    .order("registered_at", { ascending: true });

  const docs = (rows ?? []).filter((d: { storage_key_original: string }) => !!d.storage_key_original) as Array<{
    id: string; original_filename: string; storage_key_original: string; mime_type: string;
  }>;

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const cover = out.addPage(A4);
  cover.drawRectangle({ x: 0, y: 700, width: A4[0], height: 142, color: rgb(0.06, 0.16, 0.26) });
  cover.drawText("Documentos comprobatorios", { x: 48, y: 772, size: 22, font: bold, color: rgb(1, 1, 1) });
  const nome = (u.user.email ?? "").split("@")[0].replace(/[._]/g, " ");
  cover.drawText(safe(nome), { x: 48, y: 746, size: 13, font, color: rgb(0.85, 0.9, 0.96) });

  let merged = 0, failed = 0;
  let y = 660;
  cover.drawText("Indice", { x: 48, y: 680, size: 13, font: bold, color: rgb(0.06, 0.16, 0.26) });

  for (const d of docs) {
    const isPdf = (d.mime_type ?? "").includes("pdf") ||
      d.storage_key_original.toLowerCase().endsWith(".pdf") ||
      d.original_filename.toLowerCase().endsWith(".pdf");
    let label = `• ${d.original_filename}`;
    if (isPdf) {
      try {
        const buf = await getObject({ bucket: "frio", key: d.storage_key_original });
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        merged++;
      } catch {
        failed++;
        label += " (falha ao anexar)";
      }
    } else {
      label += " (nao-PDF: nao mesclado)";
    }
    if (y > 60) {
      cover.drawText(safe(label.slice(0, 92)), { x: 48, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
    }
  }

  cover.drawText(safe(`${merged} documentos mesclados${failed ? ` · ${failed} com falha` : ""}`),
    { x: 48, y: 40, size: 10, font: bold, color: rgb(0.06, 0.16, 0.26) });

  const bytes = await out.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="documentos-trajetoria360.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
