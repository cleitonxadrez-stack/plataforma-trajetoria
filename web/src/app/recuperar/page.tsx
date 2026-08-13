import Link from "next/link";
import { RecoveryForm } from "@/components/RecoveryForm";

export const metadata = { title: "Recuperar senha — Trajetória360" };

export default function RecuperarPage() {
  return (
    <main className="max-w-sm mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Acesso</p>
      <h1 className="serif text-3xl text-[#0f2942] mb-2">Recuperar senha</h1>
      <p className="text-sm text-stone-600 mb-6">
        Informe o e-mail cadastrado. Enviaremos um link de redefinição.
      </p>

      <div className="card">
        <RecoveryForm />
      </div>

      <p className="text-sm text-center mt-6">
        <Link href="/entrar" className="text-[#0f2942] hover:underline">← Voltar ao login</Link>
      </p>
    </main>
  );
}
