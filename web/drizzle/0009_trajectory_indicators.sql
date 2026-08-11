-- 0009_trajectory_indicators.sql
-- Bloco 5 — Indicadores pessoais (docs/01-arquitetura.md §6.6).
-- Tabela materializada pelo job `compute-indicators`. Fonte primária da
-- view "Minha Trajetória" do painel do usuário.
--
-- REGRA (arquitetura §6.6 — Métrica padrão):
--   window_years = NULL · apply_caps = false.
--   SEMPRE vida inteira, sem corte. Esta tabela não armazena janelas.
--   Sem dependência de ranking/dossier — escrita indireta via função
--   pura computeAllIndicators() em lib/domain/indicators.ts.
--
-- RLS: o usuário só vê a própria linha. Workers usam
-- service_role (já tem bypass). Tema ainda não tem tabela própria
-- (theme_count === placeholder até Bloco 7).

CREATE TABLE IF NOT EXISTS public.trajectory_indicators (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- total_score ainda depende do motor de metodologias (Bloco 4).
  -- Mantido como coluna para evitar nova migration quando chegar.
  total_score           numeric(8, 2) NOT NULL DEFAULT 0,
  amplitude             integer NOT NULL DEFAULT 0,
  continuity_years      integer NOT NULL DEFAULT 0,
  coverage_pct          numeric(5, 2) NOT NULL DEFAULT 0,
  theme_count           integer NOT NULL DEFAULT 0,
  career_start_date     date,
  career_years_adjusted numeric(5, 2) NOT NULL DEFAULT 0,
  computed_at           timestamp with time zone NOT NULL DEFAULT now(),
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at            timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS trajectory_indicators_user_idx
  ON public.trajectory_indicators (user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trajectory_indicators_touch_updated_at ON public.trajectory_indicators;
CREATE TRIGGER trajectory_indicators_touch_updated_at
  BEFORE UPDATE ON public.trajectory_indicators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- Mesmo padrão dos Blocos 1–2: isolamento por auth.uid() com FORCE.
ALTER TABLE public.trajectory_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trajectory_indicators FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trajectory_indicators_select_own ON public.trajectory_indicators;
CREATE POLICY trajectory_indicators_select_own ON public.trajectory_indicators
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS trajectory_indicators_insert_own ON public.trajectory_indicators;
CREATE POLICY trajectory_indicators_insert_own ON public.trajectory_indicators
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS trajectory_indicators_update_own ON public.trajectory_indicators;
CREATE POLICY trajectory_indicators_update_own ON public.trajectory_indicators
  FOR UPDATE TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS trajectory_indicators_delete_own ON public.trajectory_indicators;
CREATE POLICY trajectory_indicators_delete_own ON public.trajectory_indicators
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
