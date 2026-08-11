-- 0003_rls_core_tables.sql
-- RLS aplicada em todas as tabelas que carregam dados por usuário.
-- (Adicione novas tabelas seguindo o mesmo template.)

-- ── documents ────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_crud_own ON public.documents;
CREATE POLICY documents_crud_own ON public.documents
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── academic_items ───────────────────────────────────────
ALTER TABLE public.academic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_crud_own ON public.academic_items;
CREATE POLICY items_crud_own ON public.academic_items
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── career_interruptions ─────────────────────────────────
ALTER TABLE public.career_interruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_interruptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS career_interruptions_crud_own ON public.career_interruptions;
CREATE POLICY career_interruptions_crud_own ON public.career_interruptions
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_visibility_consent ──────────────────────────────
ALTER TABLE public.user_visibility_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_visibility_consent FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_crud_own ON public.user_visibility_consent;
CREATE POLICY consent_crud_own ON public.user_visibility_consent
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── institutions ─────────────────────────────────────────
-- Tabela global (não-per-user). Leitura: autenticado qualquer.
-- Escrita: apenas service-role (admin seed).
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS institutions_select_authenticated ON public.institutions;
CREATE POLICY institutions_select_authenticated ON public.institutions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS institutions_write_blocked ON public.institutions;
CREATE POLICY institutions_write_blocked ON public.institutions
  FOR ALL
  TO authenticated
  USING (false) WITH CHECK (false);
