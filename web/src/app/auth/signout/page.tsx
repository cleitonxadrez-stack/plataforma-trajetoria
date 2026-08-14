// src/app/auth/signout/page.tsx
// Página de logout. Confirma + executa server action; redireciona para /.

import { signOut } from "@/lib/domain/auth";

export const metadata = { title: "Sair — Trajetória360" };

export default function SignOutPage() {
  async function action() { "use server"; await signOut(); }
  return (
    <main className="max-w-sm mx-auto px-6 py-16 text-center">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-3">Sessão</p>
      <h1 className="serif text-3xl text-[#102A43] mb-4">Encerrar sessão</h1>
      <p className="text-sm text-stone-600 mb-6">
        Confirme abaixo para sair da sua conta neste navegador.
      </p>
      <form action={action}>
        <button type="submit" className="btn-primary w-full justify-center">
          Sair
        </button>
      </form>
    </main>
  );
}
