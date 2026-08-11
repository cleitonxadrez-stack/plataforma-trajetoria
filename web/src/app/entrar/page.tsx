import Link from "next/link";
import { EntrarForm } from "@/components/EntrarForm";
import { Suspense } from "react";

export const metadata = { title: "Entrar — Plataforma Trajetória" };

export default function EntrarPage() {
  return (
    <main className="max-w-sm mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Acesso</p>
      <h1 className="serif text-3xl text-[#0f2942] mb-2">Entrar na plataforma</h1>
      <p className="text-sm text-stone-600 mb-6">
        Use o e-mail cadastrado. Não armazenamos senhas em texto.
      </p>

      <div className="card">
        <Suspense fallback={<p className="text-sm text-stone-500">Carregando…</p>}>
          <EntrarForm />
        </Suspense>
      </div>

      <p className="text-sm text-center mt-6">
        <Link href="/recuperar" className="text-[#0f2942] hover:underline">Esqueci a senha</Link>
      </p>
      <p className="text-sm text-center mt-2">
        Não tem conta? <Link href="/cadastrar" className="text-[#0f2942] hover:underline">Criar agora →</Link>
      </p>
    </main>
  );
}
