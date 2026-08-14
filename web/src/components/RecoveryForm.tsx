"use client";

// src/components/RecoveryForm.tsx
// Recuperação de senha: dispara e-mail com link de reset via Supabase.

import { useState, useTransition } from "react";
import { recoverPassword } from "@/lib/domain/auth";

export function RecoveryForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await recoverPassword(formData);
      if (!res.ok) { setError(res.error); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="card bg-[#e7edf4] border-[#c8d2e1]">
        <p className="serif text-lg text-[#102A43] mb-2">E-mail enviado</p>
        <p className="text-sm text-stone-700">
          Se o endereço estiver cadastrado, você receberá um link para redefinir sua senha.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">E-mail</label>
        <input className="input" type="email" name="email" required />
      </div>
      {error && (
        <p className="text-sm text-[#8a2a1f] bg-[#f3dfda] border border-[#f3dfda] rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de recuperação"}
      </button>
    </form>
  );
}
