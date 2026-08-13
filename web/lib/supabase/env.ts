// lib/supabase/env.ts
// URL e anon key do Supabase são PÚBLICAS (ficam embutidas no bundle do
// browser e são protegidas por RLS no banco). Por isso podem viver no código.
//
// Contexto: colar essas envs no painel da Vercel corrompeu a anon key com um
// caractere não-ASCII ('•' U+2022) que quebrava o runtime Edge ("Cannot convert
// argument to a ByteString"). Para não depender mais da colagem/cache de build,
// mantemos o valor correto AQUI e só usamos a env quando ela vier 100% limpa.

// Valores canônicos (públicos) do projeto Supabase `havezwwpihfvhdeorjgt`.
const DEFAULT_URL = "https://havezwwpihfvhdeorjgt.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdmV6d3dwaWhmdmhkZW9yamd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzA5NjgsImV4cCI6MjEwMjAwNjk2OH0.IzzJT03IFt9ub6MGB6rvbnJUiJWLLeugFQDf32008XY";

/** Remove qualquer char fora de ASCII imprimível (o '•' que quebra headers). */
export function cleanEnv(v: string | undefined | null): string {
  return (v ?? "").replace(/[^\x20-\x7E]/g, "").trim();
}

/** Usa a env só se ela estiver íntegra (nada foi removido na limpeza e não é
 *  vazia). Se a env veio corrompida (limpeza mudou o tamanho), cai no default
 *  canônico — evitando anon key "curta"/inválida por corrupção. */
function preferEnv(raw: string | undefined, fallback: string): string {
  const original = raw ?? "";
  const cleaned = cleanEnv(original);
  const intact = cleaned.length > 0 && cleaned.length === original.trim().length;
  return intact ? cleaned : fallback;
}

export const SUPABASE_URL = preferEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_URL);
export const SUPABASE_ANON_KEY = preferEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_ANON_KEY);
