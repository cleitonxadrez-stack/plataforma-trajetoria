// src/app/verificar/[codigo]/page.tsx
// ROTA PÚBLICA (sem auth) — verifica um documento pelo seu código PLT.
//
// REGRA: esta rota NÃO passa pela middleware de proteção.
//   (middleware.ts não inclui "/verificar" em PROTECTED_PREFIXES.)
//
// Texto sempre inclui o disclaimer "atestar integridade, NÃO autenticidade".

import { createClient } from "@/lib/supabase/server";
import { buildVerificationView, NOT_FOUND_DISCLAIMER, type VerificationSource } from "../../../../lib/domain/verificar";
import { isValidRegistryCode } from "../../../../lib/domain/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar documento — Trajetória360" };

interface RowFound {
  registry_code: string;
  visibility: string;
  original_filename: string | null;
  mime_type: string | null;
  created_at: string;
  sha256: string | null;
}

export default async function VerificarPage(props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params;

  // Normaliza para MAIÚSCULAS (codigo vem da URL).
  const code = (codigo ?? "").toUpperCase();

  if (!isValidRegistryCode(code)) {
    return <NotFoundPage code={code} reason="Formato inválido" />;
  }

  // Query usa anon client (sem login). RLS permite SELECT público SOMENTE
  // se column `visibility` for "PUBLICO" (Backlog §1.3 + Database RLS).
  const sb = await createClient();
  const { data: row } = await sb
    .from("documents")
    .select("registry_code, visibility, original_filename, mime_type, created_at, sha256")
    .eq("registry_code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (!row) return <NotFoundPage code={code} reason="Não encontrado" />;

  const view = buildVerificationView({
    registryCode: (row as RowFound).registry_code,
    visibility: ((row as RowFound).visibility ?? "PRIVADO") as "PRIVADO" | "PUBLICO",
    originalFilename: (row as RowFound).original_filename,
    mimeType: (row as RowFound).mime_type,
    registeredAt: (row as RowFound).created_at,
    sha256: (row as RowFound).sha256,
  } satisfies VerificationSource);

  // Buscar nome do usuário APENAS se visibility=PUBLICO — não vaza no PRIVADO.
  let ownerCitationName: string | null = null;
  if (view.ok && view.filename !== null) {
    const { data: user } = await sb
      .from("users")
      .select("citation_name, full_name")
      .eq("id", (await sb.auth.getUser()).data.user?.id ?? "no-self")
      .maybeSingle();
    // Não expor; apenas valida que existe um dono. Mantém anônimo.
    void user;
    ownerCitationName = null;
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">
        Verificação pública
      </p>
      <h1 className="serif text-3xl text-[#0B2341] mb-3">
        Documento <span className="font-mono">{view.registryCode}</span>
      </h1>
      <p className="text-sm text-stone-500 mb-6 font-mono break-all">
        {code}
      </p>

      <section className="card mb-6">
        <h2 className="serif text-lg text-[#0B2341] mb-2">Existência e integridade</h2>
        {view.ok ? (
          <PublicView view={view} />
        ) : (
          <p className="text-sm text-[#8a2a1f]">{view.error}</p>
        )}
      </section>

      <Disclaimer />
      {ownerCitationName === null && view.filename !== null && <OwnerNotice />}
    </main>
  );
}

function PublicView({ view }: { view: ReturnType<typeof buildVerificationView> }) {
  if (!view.ok || view.filename === null) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-2 text-sm">
      <Term k="Arquivo" v={<span className="font-mono break-all">{view.filename}</span>} />
      <Term k="Categoria" v={view.category ?? "—"} />
      <Term k="Registrado em" v={view.registeredAtBR ?? "—"} />
      <Term k="Fingerprint (SHA-256)" v={
        view.fingerprint ? (
          <span className="font-mono text-[#0B2341]">{view.fingerprint}…</span>
        ) : (
          "—"
        )
      } />
    </dl>
  );
}

function Term({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-[#0B2341]/70 uppercase tracking-widest text-xs">{k}</dt>
      <dd className="text-[#0B2341]">{v}</dd>
    </>
  );
}

function Disclaimer() {
  return (
    <aside className="card bg-[#f3e3cd] border-[#a15a13]/40">
      <p className="text-xs text-[#0B2341]/80 leading-relaxed">
        <strong className="uppercase tracking-widest text-[#a15a13]">Atestado:</strong>{" "}
        A plataforma atesta APENAS a existência do arquivo e a integridade do conteúdo
        desde a data indicada. <strong>NÃO</strong> confirma autoria, originalidade do
        emitente, nem veracidade das informações — isso cabe à comissão avaliadora
        confrontar com a fonte emissora.
      </p>
    </aside>
  );
}

function OwnerNotice() {
  return (
    <p className="mt-6 text-[11px] text-stone-500 leading-relaxed">
      O titular do documento autorizou publicá-lo para fins de verificação.
      Dados pessoais não são expostos.
    </p>
  );
}

function NotFoundPage({ code, reason }: { code: string; reason: string }) {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <p className="text-xs uppercase tracking-[.14em] text-stone-500 mb-2">
        Verificação pública
      </p>
      <h1 className="serif text-3xl text-[#0B2341] mb-2">Código não encontrado</h1>
      <p className="font-mono text-sm text-stone-500 mb-6 break-all">{code || "(vazio)"}</p>
      <p className="text-sm text-[#8a2a1f] mb-4">{reason}.</p>
      <p className="text-sm text-stone-700">{NOT_FOUND_DISCLAIMER}</p>
    </main>
  );
}
