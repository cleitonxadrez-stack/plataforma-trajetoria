import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  // Sessão resolvida no servidor (cookies SSR-aware).
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/painel");

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* ───────── Header fixo com o botão Entrar no topo ───────── */}
      <header className="sticky top-0 z-30 border-b border-[#cddcec]/80 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[15px] font-semibold text-white shadow-sm">
              T
            </span>
            <span className="serif text-lg font-semibold text-primary">
              Trajetória360
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
            <a href="#organizar" className="transition-colors hover:text-primary">Organização</a>
            <a href="#planejar" className="transition-colors hover:text-primary">Planejamento</a>
            <a href="#verificar" className="transition-colors hover:text-primary">Verificação</a>
          </nav>

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

      {/* ───────── Hero azul acadêmico ───────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0b2035] via-[#0f2942] to-[#1a4870] text-white">
        {/* grade sutil de "organização" ao fundo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          {/* coluna texto */}
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-200">
              Organização · Planejamento · Currículo
            </p>
            <h1 className="serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Sua trajetória acadêmica,{" "}
              <span className="text-sky-300">organizada</span> e{" "}
              <span className="text-sky-300">verificável</span>.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-200/90">
              Reúna certificados, diplomas e declarações espalhados em HDs, e-mails e nuvens.
              Organize tudo em uma cadeia documental única, planeje os próximos passos da
              sua carreira e gere dossiês prontos para editais.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/cadastrar"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Começar gratuitamente
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/entrar"
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Já tenho conta
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-300/80">
              Sem cartão · 500 documentos no plano inicial · Exporte tudo quando quiser
            </p>
          </div>

          {/* coluna visual — "linha do tempo organizada" */}
          <div className="relative">
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-sky-200/80">
                  Linha do tempo
                </span>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  Verificado
                </span>
              </div>
              <ul className="space-y-3">
                {[
                  { ano: "2024", txt: "Doutorado — defesa aprovada", tag: "Diploma" },
                  { ano: "2023", txt: "Artigo em periódico A1", tag: "Publicação" },
                  { ano: "2022", txt: "Coordenação de projeto de extensão", tag: "Declaração" },
                  { ano: "2021", txt: "Especialização concluída", tag: "Certificado" },
                ].map((it) => (
                  <li
                    key={it.ano}
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#0b2035]/40 px-4 py-3"
                  >
                    <span className="serif w-12 shrink-0 text-lg font-semibold text-sky-300">
                      {it.ano}
                    </span>
                    <span className="flex-1 text-sm text-slate-100">{it.txt}</span>
                    <span className="hidden rounded-md bg-white/10 px-2 py-1 text-[11px] text-slate-300 sm:inline">
                      {it.tag}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-3 text-center text-xs text-slate-300/80">
                Cada item recebe um código público <span className="font-mono text-sky-200">PLT-AAAA-XXXX-XXXX</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Pilares: organização ───────── */}
      <section id="organizar" className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-info">
            Organização
          </p>
          <h2 className="serif text-3xl font-semibold text-primary sm:text-4xl">
            Do caos documental a uma trajetória estruturada
          </h2>
          <p className="mt-4 text-lg text-muted">
            Quatro passos para transformar arquivos soltos em um histórico acadêmico
            coeso, planejado e pronto para comprovar.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              t: "Reunir",
              d: "Importe certificados, diplomas e o Lattes. Tudo em um cofre único e seguro.",
            },
            {
              n: "02",
              t: "Organizar",
              d: "Classifique por tipo, área e ano. A plataforma estrutura sua trajetória automaticamente.",
            },
            {
              n: "03",
              t: "Planejar",
              d: "Enxergue lacunas e próximos passos. Planeje a carreira com base no que já comprovou.",
            },
            {
              n: "04",
              t: "Comprovar",
              d: "Gere dossiês para editais e concursos, com verificação pública de cada documento.",
            },
          ].map((c) => (
            <div
              key={c.n}
              className="card group transition-shadow hover:shadow-lg hover:shadow-[#0f2942]/5"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf1f7] text-sm font-semibold text-info">
                {c.n}
              </div>
              <h3 className="serif text-xl font-semibold text-primary">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Planejamento ───────── */}
      <section id="planejar" className="border-y border-[#cddcec] bg-bgstrip">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-info">
              Planejamento
            </p>
            <h2 className="serif text-3xl font-semibold text-primary sm:text-4xl">
              Um currículo que orienta suas decisões
            </h2>
            <p className="mt-4 text-lg text-muted">
              Mais do que guardar papéis: a Trajetória360 lê sua produção e
              revela indicadores, pontos fortes e onde investir a seguir — para
              progressões, editais e concursos.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Indicadores de trajetória calculados a partir dos seus documentos",
                "Metodologias públicas de pontuação (ex.: Trajetória v1)",
                "Dossiês sob medida para cada edital, montados em minutos",
              ].map((li) => (
                <li key={li} className="flex items-start gap-3 text-[15px] text-ink">
                  <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                    ✓
                  </span>
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* mini-painel ilustrativo */}
          <div className="card flex flex-col justify-center">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-soft">
              Resumo da trajetória
            </p>
            <div className="mt-5 grid grid-cols-3 gap-4 text-center">
              {[
                { k: "Documentos", v: "128" },
                { k: "Comprovados", v: "97%" },
                { k: "Anos cobertos", v: "12" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-[#cddcec] bg-bg py-4">
                  <div className="serif text-2xl font-semibold text-primary">{s.v}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-soft">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2.5">
              {[
                { label: "Ensino", pct: 82 },
                { label: "Pesquisa", pct: 64 },
                { label: "Extensão", pct: 48 },
              ].map((b) => (
                <div key={b.label}>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>{b.label}</span>
                    <span>{b.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#cddcec]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-info to-primary"
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Verificação pública ───────── */}
      <section id="verificar" className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="card mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-info">
            Verificação pública
          </p>
          <h2 className="serif text-3xl font-semibold text-primary">
            Confiança que qualquer banca pode conferir
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Todo documento recebe um código único{" "}
            <code className="rounded bg-[#eaf1f7] px-1.5 py-0.5 font-mono text-sm text-primary">
              PLT-AAAA-XXXX-XXXX
            </code>
            . Qualquer pessoa consulta a autenticidade em{" "}
            <span className="font-mono text-primary">/verificar/[codigo]</span> — sem login e
            sem paywall.
          </p>
          <div className="mt-8">
            <Link href="/cadastrar" className="btn-primary">
              Criar minha trajetória
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Rodapé ───────── */}
      <footer className="border-t border-[#cddcec] bg-bgstrip">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-soft sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-semibold text-white">
              T
            </span>
            <span className="serif font-semibold text-primary">Trajetória360</span>
          </div>
          <p>Trajetória acadêmica documentada e verificável.</p>
          <div className="flex gap-5">
            <Link href="/entrar" className="hover:text-primary">Entrar</Link>
            <Link href="/cadastrar" className="hover:text-primary">Criar conta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
