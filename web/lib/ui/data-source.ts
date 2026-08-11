// lib/ui/data-source.ts
// Política única de fallback para Painel / Trajetória / Pendências.
//
// REGRAS INVIOLÁVEIS (CLAUDE.md §"Privacidade por padrão" + "Sem mentira"):
//   1. Em PRODUÇÃO, NUNCA servir dados fictícios para um usuário autenticado.
//      Se o DB retornar vazio, renderiza empty-state com CTA ("importe seu
//      Lattes", "suba seu primeiro documento") — NUNCA MOCK_*. A única
//      forma do usuário ver dados fictícios é estar autenticado em modo dev.
//   2. Em DEV (NODE_ENV !== "production"), se TODAS as 3 queries
//      retornaram vazio E o helper explicitamente optou por fallback, ok.
//      Marcar a página com `usingMock=true` para renderizar aviso
//      "modo demonstração".
//   3. Esta política é centralizada — páginas não decidem sozinhas.

/** Resultado resolvido por uma página. */
export interface DataSourceDecision<T> {
  /** Dados normais (reais OU fallback explícito). */
  data: T;
  /** True somente se os dados vieram de mocks em dev. Em produção nunca é true. */
  usingMock: boolean;
  /** True se dados reais foram encontrados (não-vazios). */
  isEmpty: boolean;
}

export interface WhenConditions<T> {
  /** Perfil/itens/instituições vindos de RLS — pode ser null/vazio. */
  profileFound: boolean;
  itemsFound: boolean;
  interruptionsFound: boolean;
  institutionsFound: boolean;
  /** O que o caller quer mostrar quando está vazio. */
  fallback: T;
  /** O que o caller quer mostrar quando há dados. */
  fromDb: T;
}

/** Decide entre mostrar dados reais, empty-state ou fallback dev. */
export function chooseDataSource<T>(opts: WhenConditions<T>): DataSourceDecision<T> {
  const anyData =
    opts.profileFound || opts.itemsFound || opts.interruptionsFound || opts.institutionsFound;

  const isProd = process.env.NODE_ENV === "production";

  if (anyData) {
    return { data: opts.fromDb, usingMock: false, isEmpty: false };
  }

  // Nenhum dado.
  if (isProd) {
    // PROD: NUNCA mock. Caller passa fallback = empty-state renderer
    // (HTML/JSX que mostra CTA). O tipo T aqui é o do empty-state;
    // a página detecta via fromDb vazio e usa renderer próprio.
    return { data: opts.fallback, usingMock: false, isEmpty: true };
  }

  // DEV: fallback explícito — caller passa o mock.
  return { data: opts.fallback, usingMock: true, isEmpty: true };
}

/** Legenda visível quando usingMock=true. */
export const FALLBACK_BADGE = "modo demonstração (DB vazio)";
