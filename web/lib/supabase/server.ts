// lib/supabase/server.ts
// Cliente Supabase para SERVER COMPONENTS, SERVER ACTIONS e ROUTE HANDLERS.
// ⚠️ NUNCA importar em arquivos "use client".
// Usa o padrão cookies.getAll / cookies.setAll exigido pelo @supabase/ssr atual.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component não pode escrever cookies;
            // o middleware faz isso (vide middleware.ts).
          }
        },
      },
    },
  );
}
