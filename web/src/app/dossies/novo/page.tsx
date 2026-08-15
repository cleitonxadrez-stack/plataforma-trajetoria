// src/app/dossies/novo/page.tsx
// BLOCO 4 — Tela de novo dossiê.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TRAJETORIA_V1 } from "@/lib/domain/methodology";
import { NewDossierForm } from "@/components/dossies/NewDossierForm";

export const dynamic = "force-dynamic";

export default async function NewDossierPage() {
  const sb = await createClient();
  const { data: ures, error: uerr } = await sb.auth.getUser();
  if (uerr || !ures?.user) redirect("/entrar");

  // Lista de metodologias do próprio usuário + públicas (sem edital pesado)
  const { data: methods } = await sb
    .from("ranking_methods")
    .select("id, name, version, scope, window_years, apply_caps, is_public")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-[#0B2341]/70">Dossiê</p>
        <h1 className="serif text-3xl">Novo dossiê</h1>
        <p className="text-sm text-[#0B2341]/70 mt-2">
          Escolha uma metodologia existente ou importe um edital em PDF. A tabela de regras
          fica aberta para edição — você sempre vê o que o sistema vai usar.
        </p>
      </header>

      <section className="card mt-6 space-y-6">
        <div font-sans text-base>
          <h2 className="serif text-xl mb-2">Metodologias disponíveis</h2>
          <p className="text-xs text-[#0B2341]/70 mb-4">
            Você pode usar uma metodologia pública ou a sua. A metodologia padrão da plataforma
            é <strong>Trajetória v1</strong> — vida inteira, sem teto de pontuação.
          </p>
          <ul className="space-y-3" data-testid="method-list">
            <MethodRadio
              id="tray-v1"
              selected
              name="tray-v1"
              label="Trajetória v1 — padrão da plataforma"
              meta="Vida inteira · sem teto · coautoria não aplica"
            />
            {(methods ?? []).map((m) => (
              <MethodRadio
                key={String(m.id)}
                id={String(m.id)}
                selected={false}
                name={String(m.id)}
                label={`${String(m.name)} (v${(m.version as number) ?? 1})`}
                meta={`${m.scope as string} · janela: ${
                  m.window_years === null || m.window_years === undefined
                    ? "vida inteira"
                    : `${m.window_years as number} anos`
                } · tetos: ${(m.apply_caps as boolean) ? "aplicados" : "não"} · ${
                  (m.is_public as boolean) ? "pública" : "privada"
                }`}
              />
            ))}
          </ul>
        </div>

        <hr className="border-[#0B2341]/10" />

        <div>
          <h3 className="serif text-xl mb-2">Importar edital</h3>
          <p className="text-xs text-[#0B2341]/70 mb-4">
            Suba o PDF do edital. O sistema extrai categorias, pesos, tetos e janela por
            reconhecimento de padrões. Você revisa e corrige antes de salvar.
          </p>
          <NewDossierForm />
        </div>

        <hr className="border-[#0B2341]/10" />

        <div className="bg-[#FCF3E1] border border-[#B7791F]/40 p-4 rounded text-sm">
          <p className="font-semibold text-[#B7791F] mb-1">Aviso de simulação</p>
          <p>
            O dossiê gerado pelo sistema é uma <strong>simulação</strong> com base na leitura do
            edital e nos itens que você marcou como comprovados. Confira com a comissão
            responsável antes de submeter.
          </p>
        </div>
      </section>
    </main>
  );
}

function MethodRadio(props: {
  id: string;
  selected: boolean;
  name: string;
  label: string;
  meta: string;
}) {
  return (
    <li className="border border-[#0B2341]/10 rounded p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="radio" name="method" value={props.id} defaultChecked={props.selected} />
        <div>
          <p className="font-medium">{props.label}</p>
          <p className="text-xs text-[#0B2341]/70 mt-0.5">{props.meta}</p>
        </div>
      </label>
    </li>
  );
}
