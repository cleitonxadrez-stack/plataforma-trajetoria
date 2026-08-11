// lib/supabase/client.ts
// Cliente Supabase para COMPONENTES CLIENT-SIDE (browser).
// Lê NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
// A anon key é segura para o browser porque respeita RLS.

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
