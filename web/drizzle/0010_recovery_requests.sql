-- 0010_recovery_requests.sql
-- BLOCO 6 — Recuperação assistida.
-- Tabela que persiste as cartas geradas pelo Bloco 6 + auditoria do
-- termo de consentimento aceito (FOLLOW-UP só vale se a versão é a
-- corrente; termo mudou → request fica obsoleta).

CREATE TABLE IF NOT EXISTS public.recovery_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institution_id        uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  item_ids              jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL DEFAULT 'ABERTA'
                        CHECK (status IN ('ABERTA','ENVIADA','RESPONDIDA','CANCELADA')),
  consent_text_version  text NOT NULL,
  sent_at               timestamp with time zone,
  channel_used          text
                        CHECK (channel_used IS NULL OR channel_used IN
                               ('secretariaAcademica','biblioteca','proReitoriaExtensao','outro')),
  free_text_reply       text,
  last_follow_up_at     timestamp with time zone,
  responded_at          timestamp with time zone,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at            timestamp with time zone
);

CREATE INDEX IF NOT EXISTS recovery_requests_user_idx
  ON public.recovery_requests (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recovery_requests_inst_idx
  ON public.recovery_requests (institution_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recovery_requests_status_idx
  ON public.recovery_requests (status) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS recovery_requests_touch_updated_at ON public.recovery_requests;
CREATE TRIGGER recovery_requests_touch_updated_at
  BEFORE UPDATE ON public.recovery_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS ─────────────────────────────────────
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recovery_requests_crud_own ON public.recovery_requests;
CREATE POLICY recovery_requests_crud_own ON public.recovery_requests
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
