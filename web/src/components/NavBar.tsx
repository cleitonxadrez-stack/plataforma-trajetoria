"use client";

// src/components/NavBar.tsx — barra de navegação premium (client): estado ativo
// via usePathname + avatar do usuário (foto ou iniciais).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "/trajetoria", label: "Trajetória" },
  { href: "/documentos", label: "Documentos" },
  { href: "/dossies", label: "Dossiês" },
];

export function NavBar({ authed, photoUrl, initials }: { authed: boolean; photoUrl: string | null; initials: string }) {
  const path = usePathname() || "";
  const active = (h: string) => path === h || path.startsWith(h + "/");

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href={authed ? "/painel" : "/"} className="site-nav-brand" aria-label="Início">
          <Logo size={26} />
        </Link>
        {authed ? (
          <div className="site-nav-right">
            <nav className="site-nav-links" aria-label="Navegação principal">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className={active(l.href) ? "is-active" : ""} aria-current={active(l.href) ? "page" : undefined}>
                  {l.label}
                </Link>
              ))}
              <Link href="/exportar" className={`site-nav-cta ${active("/exportar") ? "is-active" : ""}`}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 0 4 4m-4-4-4 4M5 21h14" /></svg>
                Exportar
              </Link>
            </nav>
            <Link href="/exportar/dados" className="site-nav-avatar" aria-label="Meu perfil">
              {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
            </Link>
          </div>
        ) : (
          <nav className="site-nav-links" aria-label="Navegação principal">
            <Link href="/sobre" className={active("/sobre") ? "is-active" : ""}>Sobre</Link>
            <Link href="/entrar" className="site-nav-cta">Entrar</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
