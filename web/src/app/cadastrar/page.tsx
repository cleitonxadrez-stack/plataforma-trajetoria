import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";

export const metadata = { title: "Criar conta — Trajetória360" };

export default function CadastrarPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">Cadastro</p>
      <h1 className="serif text-3xl text-[#0B2341] mb-2">Criar conta gratuita</h1>
      <p className="text-sm text-stone-600 mb-6">
        Sem cartão. 500 documentos no plano inicial. Exportar tudo quando quiser.
      </p>

      <div className="card">
        <SignupForm />
      </div>

      <div className="card mt-4 bg-[#e7edf4] border-[#c8d2e1]">
        <p className="text-sm text-stone-700">
          <strong>Consentimento vem depois.</strong> O cadastro não pergunta visibilidade nem
          ranking — esse pedido aparece quando você já tem trajetória registrada.
          (Regra de produto: <Link href="/sobre" className="underline">/sobre</Link>.)
        </p>
      </div>

      <p className="text-sm text-center mt-6">
        Já tem conta? <Link href="/entrar" className="text-[#0B2341] hover:underline">Entrar →</Link>
      </p>
    </main>
  );
}
