import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  // Sessão resolvida no servidor (cookies SSR-aware).
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/painel");

  return (
    <main className="max-w-3xl mx-auto px-6 py-24">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-4">
        Plataforma acadêmica de trajetória
      </p>
      <h1 className="serif text-5xl leading-tight text-[#0f2942] max-w-2xl">
        Transforme seu currículo de declaração em trajetória verificável.
      </h1>
      <p className="text-lg text-stone-600 mt-6 max-w-2xl">
        Reúna certificados, diplomas e declarações espalhados em HDs, e-mails e nuvens.
        Organize-os em uma cadeia documental única e gere dossiês para editais.
      </p>
      <div className="mt-10 flex gap-3">
        <Link href="/cadastrar" className="btn-primary">Criar conta gratuita</Link>
        <Link href="/entrar" className="btn-secondary">Já tenho conta</Link>
      </div>
      <div className="card mt-12 max-w-xl">
        <p className="text-xs uppercase tracking-[.12em] text-stone-500 mb-2">
          Verificação pública
        </p>
        <p className="serif text-lg text-[#0f2942] mb-2">
          Todo documento recebe um código PLT-AAAA-XXXX-XXXX.
        </p>
        <p className="text-sm text-stone-600">
          Qualquer pessoa consulta em <code className="font-mono text-[#0f2942]">/verificar/[codigo]</code>{" "}
          sem login e sem paywall.
        </p>
      </div>
    </main>
  );
}
