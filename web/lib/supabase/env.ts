// lib/supabase/env.ts
// Sanitiza valores de env usados como HEADER/URL nas chamadas ao Supabase.
// Um caractere não-ASCII (ex.: '•' U+2022) num header quebra o runtime Edge
// da Vercel com "Cannot convert argument to a ByteString". Origem típica:
// caractere invisível/torto que entra ao colar a variável no painel.
// Mantemos só ASCII imprimível — JWT (anon key) e URL só usam esses chars.

export function cleanEnv(v: string | undefined | null): string {
  return (v ?? "").replace(/[^\x20-\x7E]/g, "").trim();
}

export const SUPABASE_URL = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
