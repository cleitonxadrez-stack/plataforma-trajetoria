// middleware.ts
// GATE de rotas — Bloco 1 §1.2 do backlog.
// Roda em /painel e demais rotas autenticadas; deixa passar
// rotas públicas (/, /verificar, /entrar, /cadastrar, /auth/*, /termos).

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Rotas que exigem sessão autenticada
const PROTECTED_PREFIXES = ["/painel", "/trajetoria", "/documentos", "/dossies",
                            "/pendencias", "/importar", "/config"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (isProtected(request.nextUrl.pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/entrar";
      url.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica em tudo EXCETO:
     *   - _next/static, _next/image
     *   - favicon.ico
     *   - arquivos de imagem, svg
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
