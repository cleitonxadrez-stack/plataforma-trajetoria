"use client";

// src/components/LoginForm.tsx
// Form de login com Server Action.
// Erros retornados pelo server action são exibidos inline (não navegam em erros).

import { useState, useTransition } from "react";
import { signInWithPassword } from "@/lib/domain/auth";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    if (redirectTo) formData.set("redirect", redirectTo);
    startTransition(async () => {
      const res = await signInWithPassword(formData);
      if (res && res.ok === false) setError(res.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">E-mail</label>
        <input className="input" type="email" name="email" autoComplete="email" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Senha</label>
        <input className="input" type="password" name="password"
               autoComplete="current-password" minLength={8} required />
      </div>
      {error && (
        <p className="text-sm text-[#8a2a1f] bg-[#f3dfda] border border-[#f3dfda] rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
