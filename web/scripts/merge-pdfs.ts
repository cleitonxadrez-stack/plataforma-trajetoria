// scripts/merge-pdfs.ts
// Junta vários PDFs do Google Drive (links públicos) em um único PDF, com
// capa e páginas divisórias por seção. Remove duplicatas exatas (sha256).
//
// USO: npx tsx scripts/merge-pdfs.ts <manifest.json> <saida.pdf>
//
// manifest.json = { title, subtitle, sections: [{ name, files: [{driveId, label}] }] }

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface FileRef { driveId: string; label: string; }
interface Section { name: string; files: FileRef[]; }
interface Manifest { title: string; subtitle?: string; sections: Section[]; }

const manifest: Manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outPath = process.argv[3] ?? "/tmp/dossie.pdf";

const A4: [number, number] = [595.28, 841.89];

function download(driveId: string): Buffer | null {
  const tmp = `/tmp/merge-${driveId}.pdf`;
  try {
    execFileSync("curl", ["-sL", "--max-time", "120",
      `https://drive.google.com/uc?export=download&id=${driveId}`, "-o", tmp], { stdio: "ignore" });
    const buf = readFileSync(tmp);
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
    return buf;
  } catch { return null; }
}

// remove caracteres fora do WinAnsi (pdf-lib Helvetica) pra não quebrar drawText
function safe(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
          .replace(/[–—]/g, "-").replace(/[^\x00-\xFF]/g, "");
}

async function main() {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const seen = new Set<string>();
  let included = 0, skippedDup = 0, failed = 0;
  const failedLabels: string[] = [];
  const indexLines: string[] = [];

  // capa (preenchida no fim com contagem) — reservamos referência
  const cover = out.addPage(A4);

  for (let si = 0; si < manifest.sections.length; si++) {
    const sec = manifest.sections[si];
    let sectionCount = 0;
    // página divisória
    const div = out.addPage(A4);
    div.drawRectangle({ x: 0, y: 741, width: A4[0], height: 100, color: rgb(0.12, 0.36, 0.57) });
    div.drawText(safe(`SEÇÃO ${si + 1}`), { x: 48, y: 792, size: 12, font: bold, color: rgb(1, 1, 1) });
    div.drawText(safe(sec.name), { x: 48, y: 762, size: 20, font: bold, color: rgb(1, 1, 1) });

    for (const f of sec.files) {
      const buf = download(f.driveId);
      if (!buf) { failed++; failedLabels.push(f.label); continue; }
      const h = createHash("sha256").update(buf).digest("hex");
      if (seen.has(h)) { skippedDup++; continue; }
      seen.add(h);
      try {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        included++; sectionCount++;
      } catch { failed++; failedLabels.push(f.label); }
    }
    indexLines.push(`${String(si + 1).padStart(2, " ")}. ${sec.name}  (${sectionCount} doc.)`);
  }

  // capa
  cover.drawRectangle({ x: 0, y: 620, width: A4[0], height: 222, color: rgb(0.12, 0.36, 0.57) });
  cover.drawText(safe(manifest.title), { x: 48, y: 770, size: 26, font: bold, color: rgb(1, 1, 1) });
  if (manifest.subtitle)
    cover.drawText(safe(manifest.subtitle), { x: 48, y: 742, size: 13, font, color: rgb(0.9, 0.95, 1) });
  cover.drawText(safe(`${included} documentos comprobatórios`), { x: 48, y: 662, size: 12, font: bold, color: rgb(1, 1, 1) });

  cover.drawText("SUMÁRIO", { x: 48, y: 560, size: 14, font: bold, color: rgb(0.12, 0.36, 0.57) });
  let y = 532;
  for (const line of indexLines) {
    cover.drawText(safe(line), { x: 48, y, size: 12, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 22;
  }
  cover.drawText(safe("Gerado por Trajetória360 · Cleiton Marino Santana"),
    { x: 48, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  const bytes = await out.save();
  writeFileSync(outPath, bytes);

  console.log(`\n✓ PDF gerado: ${outPath}`);
  console.log(`  Incluídos: ${included} · Duplicatas removidas: ${skippedDup} · Falhas: ${failed}`);
  console.log(`  Tamanho: ${(bytes.length / 1024 / 1024).toFixed(1)} MB · Páginas: ${out.getPageCount()}`);
  if (failedLabels.length) console.log("  Falharam:", failedLabels.join(" | "));
}

main().catch((e) => { console.error(e); process.exit(1); });
