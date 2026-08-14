// src/components/NavHeader.tsx
// Cabeçalho de navegação global (server component, ciente de auth).
// Logado: Trajetória · Documentos · Dossiês · Exportar.
// Deslogado: Sobre · Entrar. Oculto na impressão (@media print em globals.css).

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export async function NavHeader() {
  let authed = false;
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    authed = !!data.user;
  } catch {
    authed = false;
  }

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href={authed ? "/trajetoria" : "/"} className="site-nav-brand" aria-label="Início">
          <Logo size={26} />
        </Link>
        {authed ? (
          <nav className="site-nav-links" aria-label="Navegação principal">
            <Link href="/trajetoria">Trajetória</Link>
            <Link href="/documentos">Documentos</Link>
            <Link href="/dossies">Dossiês</Link>
            <Link href="/exportar" className="site-nav-cta">Exportar</Link>
          </nav>
        ) : (
          <nav className="site-nav-links" aria-label="Navegação principal">
            <Link href="/sobre">Sobre</Link>
            <Link href="/entrar" className="site-nav-cta">Entrar</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
