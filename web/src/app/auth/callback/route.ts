// src/app/auth/callback/route.ts
// Endpoint usado por Supabase para:
//   (1) confirmação de e-mail após signup     → ?code=...
//   (2) redefinição de senha (recovery)      → ?code=...
//   (3) troca de e-mail                       → ?code=...
// O Supabase valida o `code` e atualiza os cookies de sessão automaticamente.

import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/painel";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
