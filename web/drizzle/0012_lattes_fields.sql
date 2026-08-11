-- 0012_lattes_fields.sql — Item #3 (Sprint 1)
-- Adiciona colunas necessárias para o import Lattes sem campos custom
-- via JSON — modelo de "private fields" do projeto.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS (Postgres ≥ 9.6).

ALTER TABLE public.academic_items
  ADD COLUMN IF NOT EXISTS lattes_dedupe_key text NULL,
  ADD COLUMN IF NOT EXISTS raw_lattes_nature text NULL,
  ADD COLUMN IF NOT EXISTS raw_lattes_id text NULL,
  ADD COLUMN IF NOT EXISTS raw_authors jsonb NULL,
  ADD COLUMN IF NOT EXISTS flagged_lattes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_innovation boolean NOT NULL DEFAULT false;

-- Dedupe idempotente por usuário (imports subsequentes do mesmo XML não duplicam).
CREATE UNIQUE INDEX IF NOT EXISTS academic_items_user_dedupe_uniq
  ON public.academic_items (user_id, lattes_dedupe_key)
  WHERE deleted_at IS NULL
    AND lattes_dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS academic_items_lattes_flag_idx
  ON public.academic_items (flagged_lattes)
  WHERE deleted_at IS NULL;

-- RLS já cobre academic_items via auth.uid() (migration 0003).
-- A nova coluna `lattes_dedupe_key` herda automaticamente.
