"use client";

// src/components/SignupForm.tsx
// Cadastro: email + senha + nome.
// ⚠️ Por regra do projeto (CLAUDE.md / docs/06) o cadastro NÃO pergunta
// visibilidade nem ranking — vai depois, contextual. Nada de perk de marketing aqui.

import { useState, useTransition } from "react";
import { signUpWithPassword } from "@/lib/domain/auth";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await signUpWithPassword(formData);
      if (!res.ok) { setError(res.error); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="card bg-[#E7F7EF] border-[#c5dcd0]">
        <p className="serif text-lg text-[#168553] mb-2">Verifique seu e-mail</p>
        <p className="text-sm text-stone-700">
          Enviamos um link de confirmação para o endereço informado.
          Clique nele para ativar sua conta.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Nome completo</label>
        <input className="input" name="fullName" required
               placeholder="Como aparece em documentos oficiais" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Nome de citação (opcional)</label>
        <input className="input" name="citationName" placeholder="Santana, C. M." />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Lattes ID (opcional)</label>
        <input className="input font-mono" name="lattesId" placeholder="K4000001P5" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">E-mail</label>
        <input className="input" type="email" name="email" autoComplete="email" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Senha (mínimo 8)</label>
        <input className="input" type="password" name="password"
               autoComplete="new-password" minLength={8} required />
      </div>
      {error && (
        <p className="text-sm text-[#B4413C] bg-[#FBE7E7] border border-[#FBE7E7] rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Criando…" : "Criar conta"}
      </button>
    </form>
  );
}
