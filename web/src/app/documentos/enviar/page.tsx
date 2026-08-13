// src/app/documentos/enviar/page.tsx
// Página de envio de documento para o Cofre. Server Component protegido —
// o formulário em si é o client component UploadForm.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";

export const metadata = { title: "Enviar documento — Trajetória360" };
export const dynamic = "force-dynamic";

export default async function EnviarDocumentoPage() {
  const supabase = await createClient();
  const { data: sess, error } = await supabase.auth.getUser();
  if (error || !sess.user) redirect("/entrar?redirect=/documentos/enviar");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="mb-2 text-xs uppercase tracking-[.14em] text-soft">Cofre</p>
      <h1 className="serif text-4xl text-primary">Enviar documento</h1>
      <p className="mt-2 max-w-xl text-muted">
        Suba um certificado, diploma ou declaração. Guardamos o original em
        armazenamento seguro e geramos um código de verificação. A leitura
        automática (IA/OCR) roda em segundo plano.
      </p>

      <div className="mt-8">
        <UploadForm />
      </div>

      <p className="mt-8 text-sm text-soft">
        Quer importar do Lattes?{" "}
        <Link href="/importar" className="text-info underline">Importe o XML do currículo</Link>.
      </p>
    </main>
  );
}
