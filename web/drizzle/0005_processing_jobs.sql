-- 0005_processing_jobs.sql
-- Espelho durável do estado dos jobs do pg-boss.
-- Fila performática fica em pgboss.* (criada pelo próprio pg-boss no boot);
-- aqui guardamos o histórico durável para auditoria e billing.

CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_name        text NOT NULL
                  CHECK (job_name IN ('extract-cascade','identity-resolve','normalize','re-extract')),
  status          text NOT NULL DEFAULT 'AGENDADO'
                  CHECK (status IN ('AGENDADO','EM_ANDAMENTO','SUCESSO','ERRO','MORTO')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  cost_cents      integer NOT NULL DEFAULT 0,
  started_at      timestamp with time zone,
  finished_at     timestamp with time zone,
  error_message   text,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at      timestamp with time zone
);

CREATE INDEX IF NOT EXISTS processing_jobs_user_idx  ON public.processing_jobs (user_id);
CREATE INDEX IF NOT EXISTS processing_jobs_doc_idx   ON public.processing_jobs (document_id);
CREATE INDEX IF NOT EXISTS processing_jobs_status_idx ON public.processing_jobs (status);

DROP TRIGGER IF EXISTS processing_jobs_touch_updated_at ON public.processing_jobs;
CREATE TRIGGER processing_jobs_touch_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
