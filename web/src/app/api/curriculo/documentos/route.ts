// src/app/api/curriculo/documentos/route.ts
// GET — junta TODOS os documentos (PDFs) do usuário num único PDF, com uma
// CAPA navy bonita + página de índice com o nome de todos os documentos.

import { createClient } from "@/lib/supabase/server";
import { getObject } from "@/lib/storage/r2";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.055, 0.117, 0.2);
const NAVY2 = rgb(0.09, 0.17, 0.28);
const BLUE = rgb(0.15, 0.4, 0.92);
const LIGHT = rgb(0.82, 0.88, 0.95);
const GRAY = rgb(0.62, 0.68, 0.76);

function safe(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x00-\xFF]/g, "");
}

export async function GET(req: Request) {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new Response("Não autenticado.", { status: 401 });

  // Seleção opcional: ?ids=a,b,c → gera só esses. Sem o parâmetro, gera todos.
  const idsParam = new URL(req.url).searchParams.get("ids");
  const idSet = idsParam ? new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  const [{ data: pd }, { data: rows }] = await Promise.all([
    sb.from("personal_data").select("full_name").eq("user_id", u.user.id).maybeSingle<{ full_name: string }>(),
    sb.from("documents").select("id, original_filename, storage_key_original, mime_type, registered_at")
      .eq("user_id", u.user.id).is("deleted_at", null).order("registered_at", { ascending: true }),
  ]);
  const name = pd?.full_name ?? (u.user.email ?? "").split("@")[0];
  const docs = (rows ?? []).filter((d: { id: string; storage_key_original: string }) =>
    !!d.storage_key_original && (!idSet || idSet.has(d.id))) as Array<{
    id: string; original_filename: string; storage_key_original: string; mime_type: string;
  }>;

  if (docs.length === 0) return new Response("Nenhum documento selecionado.", { status: 400 });

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const serif = await out.embedFont(StandardFonts.TimesRomanBold);

  // ── CAPA navy ────────────────────────────────────────────────
  const cover = out.addPage(A4);
  cover.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: NAVY });
  // círculo decorativo (sutil)
  cover.drawCircle({ x: 560, y: 720, size: 150, color: NAVY2 });
  cover.drawCircle({ x: 40, y: 120, size: 130, color: NAVY2 });
  // constelação (pontos + linhas)
  const stars: [number, number][] = [[420, 720], [470, 745], [500, 700], [455, 675], [520, 730], [490, 660]];
  for (let i = 0; i < stars.length - 1; i++)
    cover.drawLine({ start: { x: stars[i][0], y: stars[i][1] }, end: { x: stars[i + 1][0], y: stars[i + 1][1] }, thickness: 0.6, color: rgb(0.3, 0.45, 0.7) });
  for (const [x, y] of stars) cover.drawCircle({ x, y, size: 2.4, color: BLUE });
  // logo
  cover.drawRectangle({ x: 48, y: 760, width: 30, height: 30, color: BLUE });
  cover.drawText("+", { x: 57, y: 767, size: 20, font: bold, color: rgb(1, 1, 1) });
  cover.drawText("TRAJETORIA", { x: 88, y: 778, size: 12, font: bold, color: rgb(1, 1, 1) });
  cover.drawText("360", { x: 88, y: 764, size: 12, font: bold, color: BLUE });
  // kicker + nome
  cover.drawText("DOCUMENTOS COMPROBATORIOS", { x: 48, y: 500, size: 11, font: bold, color: BLUE });
  cover.drawRectangle({ x: 48, y: 492, width: 70, height: 2.5, color: BLUE });
  cover.drawText(safe(name), { x: 46, y: 440, size: 32, font: serif, color: rgb(1, 1, 1) });
  cover.drawText("Professor  -  Pesquisador  -  Gestor Publico", { x: 48, y: 412, size: 12, font, color: LIGHT });
  cover.drawText("Cuiaba  -  Mato Grosso  -  Brasil", { x: 48, y: 394, size: 11, font, color: GRAY });
  // cartão de stats
  cover.drawRectangle({ x: 48, y: 250, width: 500, height: 78, color: NAVY2 });
  const stat = (x: number, n: string, l: string) => {
    cover.drawText(n, { x, y: 292, size: 22, font: bold, color: rgb(1, 1, 1) });
    cover.drawText(l, { x, y: 272, size: 9, font: bold, color: GRAY });
  };
  stat(80, String(docs.length), "DOCUMENTOS");
  stat(300, "PDF", "FORMATO");
  // rodapé
  cover.drawLine({ start: { x: 48, y: 70 }, end: { x: 548, y: 70 }, thickness: 0.6, color: rgb(0.25, 0.35, 0.5) });
  cover.drawText("DOCUMENTO GERADO PELA PLATAFORMA TRAJETORIA360", { x: 48, y: 54, size: 8, font, color: GRAY });

  // ── ÍNDICE (nomes dos documentos) ────────────────────────────
  let idx = out.addPage(A4);
  const header = (page: PDFPage) => {
    page.drawText("Indice de documentos", { x: 48, y: 792, size: 20, font: bold, color: NAVY });
    page.drawLine({ start: { x: 48, y: 782 }, end: { x: 548, y: 782 }, thickness: 1.5, color: BLUE });
  };
  header(idx);
  let y = 758;
  const drawIdx = (i: number, label: string) => {
    if (y < 60) { idx = out.addPage(A4); header(idx); y = 758; }
    idx.drawText(`${String(i).padStart(2, "0")}.`, { x: 48, y, size: 11, font: bold, color: BLUE });
    idx.drawText(safe(label.slice(0, 88)), { x: 74, y, size: 11, font, color: rgb(0.15, 0.2, 0.28) });
    y -= 20;
  };

  // ── Passada 1: baixar + montar o índice (sem anexar corpos ainda) ──
  let merged = 0, failed = 0, n = 0;
  const loaded: PDFDocument[] = [];
  for (const d of docs) {
    n++;
    const isPdf = (d.mime_type ?? "").includes("pdf") || d.original_filename.toLowerCase().endsWith(".pdf") || d.storage_key_original.toLowerCase().endsWith(".pdf");
    let label = d.original_filename.replace(/\.pdf$/i, "");
    if (isPdf) {
      try {
        const buf = await getObject({ bucket: "frio", key: d.storage_key_original });
        loaded.push(await PDFDocument.load(buf, { ignoreEncryption: true }));
        merged++;
      } catch { failed++; label += " (falha)"; }
    } else { label += " (nao-PDF)"; }
    drawIdx(n, label);
  }
  idx.drawText(safe(`${merged} documentos anexados${failed ? ` - ${failed} com falha` : ""}`),
    { x: 48, y: Math.max(y - 10, 40), size: 10, font: bold, color: NAVY });

  // ── Passada 2: anexar os corpos (após todo o índice) ──
  for (const src of loaded) {
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  void font; void GRAY;

  const bytes = await out.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documentos-trajetoria360.pdf"`, "Cache-Control": "no-store" },
  });
}
