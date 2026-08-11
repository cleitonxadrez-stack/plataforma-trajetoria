// lib/supabase/proxy.ts
// Helpers de atualização de sessão — chamado pelo middleware.
// Renomeie para "proxy.ts" apenas se migrar para Next.js >= 15.1 (docs supabase).
// Mantemos export chamado `updateSession` para casar com a documentação oficial.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida o token contra o servidor Auth (não confia só no cookie).
  // ⚠️ IMPORTANTE: nunca troque por getSession() aqui — getSession() lê
  // do cookie sem verificar e pode carregar JWT revogado/expirado.
  // (vide https://supabase.com/docs/guides/auth/server-side/nextjs)
  const { data, error } = await supabase.auth.getUser();

  // Refresh defensivo: se houver erro de token, limpa cookies.
  if (error || !data?.user) {
    // Não redireciona aqui — middleware.ts decide com base no matcher.
    return { response, user: null };
  }

  return { response, user: data.user };
}
