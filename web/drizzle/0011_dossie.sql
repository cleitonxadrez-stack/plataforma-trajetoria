-- 0011_dossie.sql
-- BLOCO 4 — Dossiê: metodologias, regras, dossiês e itens do dossiê.
--
-- Modelagem derivada de 01-arquitetura.md §6.5 e backlog 4.1-4.5.
-- Isolamento por auth.uid() em todas as tabelas.

-- ── ranking_methods ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ranking_methods (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 1,
  scope                     TEXT NOT NULL CHECK (scope IN ('PLATAFORMA','AREA','INSTITUICAO','EDITAL')),
  source_document_id        UUID,                       -- PDF do edital (opcional)
  valid_from                DATE,
  valid_until               DATE,
  window_years              INTEGER,                    -- NULL = vida inteira
  apply_caps                BOOLEAN NOT NULL DEFAULT FALSE,
  coauthor_rule             JSONB,                      -- { threshold, factor }
  stratification_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  is_public                 BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by_user          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rm_user_idx     ON ranking_methods(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rm_scope_idx    ON ranking_methods(scope)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rm_public_idx   ON ranking_methods(is_public) WHERE deleted_at IS NULL AND is_public = TRUE;

-- ── ranking_rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ranking_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id         UUID NOT NULL REFERENCES ranking_methods(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_label    TEXT NOT NULL,                     -- "Produção Bibliográfica"
  item_type         TEXT NOT NULL,                     -- ARTIGO | LIVRO | ...
  qualis_stratum    TEXT,                              -- A1 | A2 | B1 | ... (NULL = qualquer)
  points            NUMERIC(6,2) NOT NULL,
  cap_per_year      INTEGER,
  cap_per_category  INTEGER,
  cap_total         INTEGER,
  order_index       INTEGER NOT NULL DEFAULT 0,
  conditions        JSONB,                             -- { require_user_as_first_author: true, ... }
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rr_method_idx ON ranking_rules(method_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rr_user_idx   ON ranking_rules(user_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rr_type_idx   ON ranking_rules(item_type) WHERE deleted_at IS NULL;

-- ── dossiers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dossiers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_id         UUID NOT NULL REFERENCES ranking_methods(id) ON DELETE RESTRICT,
  title             TEXT NOT NULL,
  purpose           TEXT,                              -- "PROGRESSAO_UFMT_2026" | ...
  status            TEXT NOT NULL CHECK (status IN ('RASCUNHO','PRONTO','GERADO_PDF')),
  total_points      NUMERIC(8,2),
  items_count       INTEGER,
  excluded_count    INTEGER,
  metadata          JSONB,                             -- { sourcePdfId, generatedAt, ... }
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS do_user_idx   ON dossiers(user_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS do_method_idx ON dossiers(method_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS do_status_idx ON dossiers(status)    WHERE deleted_at IS NULL;

-- ── dossier_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dossier_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id        UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL,                     -- ref. academic_items, sem FK por isolamento
  category_label    TEXT NOT NULL,
  rule_id           UUID REFERENCES ranking_rules(id) ON DELETE SET NULL,
  order_index       INTEGER NOT NULL,
  page_start        INTEGER,
  page_end          INTEGER,
  points_awarded    NUMERIC(6,2) NOT NULL DEFAULT 0,
  capped            BOOLEAN NOT NULL DEFAULT FALSE,
  excluded          BOOLEAN NOT NULL DEFAULT FALSE,
  excluded_reason   TEXT,
  document_ids      UUID[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS di_dossier_idx ON dossier_items(dossier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS di_user_idx     ON dossier_items(user_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS di_order_idx    ON dossier_items(dossier_id, order_index) WHERE deleted_at IS NULL AND excluded = FALSE;

-- ── touch_updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at_dossier() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_rm_touch_updated_at ON ranking_methods;
CREATE TRIGGER tg_rm_touch_updated_at BEFORE UPDATE ON ranking_methods
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at_dossier();

DROP TRIGGER IF EXISTS tg_rr_touch_updated_at ON ranking_rules;
CREATE TRIGGER tg_rr_touch_updated_at BEFORE UPDATE ON ranking_rules
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at_dossier();

DROP TRIGGER IF EXISTS tg_do_touch_updated_at ON dossiers;
CREATE TRIGGER tg_do_touch_updated_at BEFORE UPDATE ON dossiers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at_dossier();

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE ranking_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossier_items   ENABLE ROW LEVEL SECURITY;

-- Métodos: vê o próprio OU os públicos não deletados.
DROP POLICY IF EXISTS rm_select ON ranking_methods;
CREATE POLICY rm_select ON ranking_methods FOR SELECT USING (
  deleted_at IS NULL AND (user_id = auth.uid() OR is_public = TRUE)
);
DROP POLICY IF EXISTS rm_insert ON ranking_methods;
CREATE POLICY rm_insert ON ranking_methods FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rm_update ON ranking_methods;
CREATE POLICY rm_update ON ranking_methods FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rm_delete ON ranking_methods;
CREATE POLICY rm_delete ON ranking_methods FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS rr_select ON ranking_rules;
CREATE POLICY rr_select ON ranking_rules FOR SELECT USING (
  deleted_at IS NULL AND user_id = auth.uid()
);
DROP POLICY IF EXISTS rr_insert ON ranking_rules;
CREATE POLICY rr_insert ON ranking_rules FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rr_update ON ranking_rules;
CREATE POLICY rr_update ON ranking_rules FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rr_delete ON ranking_rules;
CREATE POLICY rr_delete ON ranking_rules FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS do_select ON dossiers;
CREATE POLICY do_select ON dossiers FOR SELECT USING (deleted_at IS NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS do_insert ON dossiers;
CREATE POLICY do_insert ON dossiers FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS do_update ON dossiers;
CREATE POLICY do_update ON dossiers FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS do_delete ON dossiers;
CREATE POLICY do_delete ON dossiers FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS di_select ON dossier_items;
CREATE POLICY di_select ON dossier_items FOR SELECT USING (deleted_at IS NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS di_insert ON dossier_items;
CREATE POLICY di_insert ON dossier_items FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS di_update ON dossier_items;
CREATE POLICY di_update ON dossier_items FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS di_delete ON dossier_items;
CREATE POLICY di_delete ON dossier_items FOR DELETE USING (user_id = auth.uid());
