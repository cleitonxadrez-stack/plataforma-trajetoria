-- 0006_templates_extractions_evidences.sql
-- Tabelas para a cascata de extração + templates aprendidos + evidências.

-- ── document_templates ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  fingerprint           text NOT NULL,
  document_type         text NOT NULL
                        CHECK (document_type IN ('CERTIFICADO','DIPLOMA','ATA','ARTIGO','CAPA_FICHA','OUTROS')),
  bbox_map              jsonb NOT NULL,
  example_document_id   uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  uses_count            integer NOT NULL DEFAULT 0,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at            timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS templates_fingerprint_idx ON public.document_templates (fingerprint);
CREATE INDEX IF NOT EXISTS templates_type_idx ON public.document_templates (document_type);

DROP TRIGGER IF EXISTS templates_touch_updated_at ON public.document_templates;
CREATE TRIGGER templates_touch_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── document_extractions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_extractions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  step            integer NOT NULL
                  CHECK (step BETWEEN 1 AND 6),
  source          text NOT NULL,
                  -- pdf-parse | jsqr | crossref | ocr | ia-<model> | template:<id>
  confidence      numeric(5, 4),
  fields          jsonb,
  raw_hash        text,
  cost_cents      integer NOT NULL DEFAULT 0,
  succeeded       boolean NOT NULL,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at      timestamp with time zone
);

CREATE INDEX IF NOT EXISTS extractions_doc_idx  ON public.document_extractions (document_id);
CREATE INDEX IF NOT EXISTS extractions_step_idx ON public.document_extractions (step);

DROP TRIGGER IF EXISTS extractions_touch_updated_at ON public.document_extractions;
CREATE TRIGGER extractions_touch_updated_at
  BEFORE UPDATE ON public.document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── evidences (N:N item-doc) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.evidences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id              uuid NOT NULL REFERENCES public.academic_items(id) ON DELETE CASCADE,
  document_id          uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  role                 text NOT NULL
                       CHECK (role IN ('PRIMARY','PARCIAL','REFERENCIA','CITACAO')),
  extracted_from_step  integer CHECK (extracted_from_step BETWEEN 1 AND 6),
  confidence           numeric(5, 4),
  notes                text,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at           timestamp with time zone
);

CREATE INDEX IF NOT EXISTS evidences_item_idx ON public.evidences (item_id);
CREATE INDEX IF NOT EXISTS evidences_doc_idx  ON public.evidences (document_id);
CREATE UNIQUE INDEX IF NOT EXISTS evidences_unique_pair_idx ON public.evidences (item_id, document_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS evidences_touch_updated_at ON public.evidences;
CREATE TRIGGER evidences_touch_updated_at
  BEFORE UPDATE ON public.evidences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
