import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sobre — Plataforma Trajetória" };

const PRINCIPIOS = [
  {
    t: "Privado por padrão",
    d: "Nada da sua trajetória é público sem que você decida. O consentimento de visibilidade é pedido de forma contextual — não no cadastro.",
  },
  {
    t: "Verificação pública",
    d: "Cada documento recebe um código PLT-AAAA-XXXX-XXXX. Qualquer banca confere a autenticidade sem login e sem paywall.",
  },
  {
    t: "Você é dono dos dados",
    d: "Seus certificados, diplomas e declarações são seus. Exporte tudo quando quiser, no formato aberto, sem retenção.",
  },
  {
    t: "Sem invenção de dados",
    d: "A plataforma organiza e comprova o que você já tem — nunca cria pontuação ou item que não esteja documentado.",
  },
];

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Header com Entrar no topo */}
      <header className="sticky top-0 z-30 border-b border-[#cddcec]/80 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[15px] font-semibold text-white shadow-sm">
              T
            </span>
            <span className="serif text-lg font-semibold text-primary">Plataforma Trajetória</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/entrar"
              className="rounded-lg px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-[#dbe8f6]"
            >
              Entrar
            </Link>
            <Link
              href="/cadastrar"
              className="hidden rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1c3d5e] sm:inline-flex"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      {/* Intro */}
      <section className="mx-auto max-w-3xl px-6 py-16 md:py-20">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-info">Sobre</p>
        <h1 className="serif text-4xl font-semibold leading-tight text-primary sm:text-5xl">
          Sua trajetória acadêmica merece mais que uma pasta de PDFs
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          A <strong className="text-primary">Plataforma Trajetória</strong> transforma o currículo
          acadêmico de uma declaração em uma trajetória <em>documentada e verificável</em>. Reúna
          certificados, diplomas e declarações espalhados, organize-os em uma cadeia documental
          única, planeje seus próximos passos e gere dossiês prontos para editais e concursos.
        </p>
      </section>

      {/* Princípios */}
      <section className="border-y border-[#cddcec] bg-bgstrip">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <h2 className="serif text-2xl font-semibold text-primary sm:text-3xl">
            Princípios de produto
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Regras que guiam cada decisão da plataforma — de como pedimos consentimento a como
            tratamos seus documentos.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PRINCIPIOS.map((p) => (
              <div key={p.t} className="card">
                <h3 className="serif text-xl font-semibold text-primary">{p.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center md:py-20">
        <h2 className="serif text-3xl font-semibold text-primary">Comece sua trajetória hoje</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Sem cartão. 500 documentos no plano inicial. Exporte tudo quando quiser.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/cadastrar" className="btn-primary">Criar conta gratuita</Link>
          <Link href="/entrar" className="btn-secondary">Já tenho conta</Link>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-[#cddcec] bg-bgstrip">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-soft sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-semibold text-white">
              T
            </span>
            <span className="serif font-semibold text-primary">Plataforma Trajetória</span>
          </div>
          <div className="flex gap-5">
            <Link href="/" className="hover:text-primary">Início</Link>
            <Link href="/entrar" className="hover:text-primary">Entrar</Link>
            <Link href="/cadastrar" className="hover:text-primary">Criar conta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
