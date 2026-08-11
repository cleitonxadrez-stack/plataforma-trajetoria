// lib/domain/auth.ts
// Server Actions da Autenticação — Bloco 1 §1.2 do backlog.
//
// Regras:
//  - signup cria auth.users → trigger handle_new_user cria public.users
//  - signin usa email+senha (signInWithPassword)
//  - signout limpa sessão
//  - recoverPassword dispara e-mail de reset
//
// Validação com Zod-like (Zod não instalado no protótipo; validamos inline).

"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export type AuthResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithPassword(
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "E-mail inválido" };
  if (!password || password.length < 8) return { ok: false, error: "Senha deve ter ≥ 8 caracteres" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  const redirectTo = String(formData.get("redirect") ?? "/painel");
  redirect(redirectTo || "/painel");
}

export async function signUpWithPassword(
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const citationName = String(formData.get("citationName") ?? "").trim() || undefined;
  const lattesId = String(formData.get("lattesId") ?? "").trim() || undefined;

  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "E-mail inválido" };
  if (!password || password.length < 8) return { ok: false, error: "Senha deve ter ≥ 8 caracteres" };
  if (!fullName) return { ok: false, error: "Nome completo obrigatório" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, citation_name: citationName, lattes_id: lattesId },
      // Em produção, apontar para URL próprio de callback de verificação de e-mail.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });
  if (error) return { ok: false, error: error.message };

  // ⚠️ Regra do projeto: NO cadastro NÃO se pergunta visibilidade nem
  // ranking — vai depois, contextual. (CLAUDE.md / docs/06).
  // O trigger handle_new_user cria public.users com level=FORA (default).
  return { ok: true };
}

export async function recoverPassword(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "E-mail inválido" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/entrar`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Após server action de signOut, redirect invalida cookie no servidor.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  redirect(`${proto}://${host}/`);
}
