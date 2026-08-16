// src/components/SiteFooter.tsx
// Rodapé global (navy): descrição do site + navegação. Substitui os links do
// topo (barra superior fica clean). Server component: mostra a navegação
// completa quando logado, ou Sobre/Entrar quando visitante.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/access";

const PLATFORM = [
  { href: "/painel", label: "Painel" },
  { href: "/trajetoria", label: "Trajetória" },
  { href: "/documentos", label: "Documentos" },
  { href: "/dossies", label: "Dossiês" },
];
const GERAR = [
  { href: "/exportar", label: "Exportar" },
  { href: "/exportar/curriculo", label: "Currículo" },
  { href: "/exportar/dados", label: "Dados pessoais" },
];

export async function SiteFooter() {
  let authed = false;
  let admin = false;
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    authed = !!data.user;
    admin = isAdminEmail(data.user?.email);
  } catch { authed = false; }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-logo">Trajetória<span>360</span></span>
          <p className="site-footer-desc">
            Transforma o currículo acadêmico de declaração em <strong>trajetória documentada e verificável</strong> —
            cada conquista com comprovante, organizada por ano e pronta para editais, seleções e prestação de contas.
          </p>
        </div>

        {authed ? (
          <div className="site-footer-cols">
            <nav className="site-footer-col" aria-label="Plataforma">
              <p className="site-footer-col-title">Plataforma</p>
              {PLATFORM.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            </nav>
            <nav className="site-footer-col" aria-label="Gerar e conta">
              <p className="site-footer-col-title">Gerar & conta</p>
              {GERAR.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
              {admin && <Link href="/admin">Admin</Link>}
              <Link href="/auth/signout" className="site-footer-signout">Sair da conta</Link>
            </nav>
          </div>
        ) : (
          <nav className="site-footer-col" aria-label="Navegação">
            <p className="site-footer-col-title">Navegar</p>
            <Link href="/sobre">Sobre</Link>
            <Link href="/entrar">Entrar</Link>
            <Link href="/cadastrar">Criar conta</Link>
          </nav>
        )}
      </div>

      <div className="site-footer-bottom">
        <span>© 2026 Trajetória360</span>
        <span>Sua trajetória acadêmica, documentada e verificável.</span>
      </div>
    </footer>
  );
}
