"use client";

// Botão que dispara a impressão do navegador (Salvar como PDF).
export function PrintButton({ label = "Imprimir / Salvar em PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      🖨 {label}
    </button>
  );
}
