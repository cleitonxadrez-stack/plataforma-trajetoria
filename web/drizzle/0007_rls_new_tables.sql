-- 0007_rls_new_tables.sql
-- RLS para as tabelas do Bloco 2: mesmo padrão de isolamento por auth.uid()
-- que o Bloco 1 fixou para documents e academic_items.

-- ── processing_jobs ──────────────────────────────────────
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_jobs_crud_own ON public.processing_jobs;
CREATE POLICY processing_jobs_crud_own ON public.processing_jobs
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── document_extractions ───────────────────────────────
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extractions_crud_own ON public.document_extractions;
CREATE POLICY extractions_crud_own ON public.document_extractions
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── document_templates ──────────────────────────────────
-- Templates GLOBAIS (user_id IS NULL) são leitura pública
-- (são a inteligência coletiva da cascata; um user aprende, todos ganham).
-- Templates privados (user_id = auth.uid()) podem ser criados e lidos.
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS templates_select ON public.document_templates;
CREATE POLICY templates_select ON public.document_templates
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS templates_insert_own ON public.document_templates;
CREATE POLICY templates_insert_own ON public.document_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS templates_update_own ON public.document_templates;
CREATE POLICY templates_update_own ON public.document_templates
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS templates_delete_own ON public.document_templates;
CREATE POLICY templates_delete_own ON public.document_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── evidences ────────────────────────────────────────────
ALTER TABLE public.evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidences_crud_own ON public.evidences;
CREATE POLICY evidences_crud_own ON public.evidences
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
