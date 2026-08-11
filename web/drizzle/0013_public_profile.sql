-- 0013_public_profile.sql
-- Item #6 — opt-in do perfil público em users.
-- Idempotente: re-rodável sem erro.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_profile_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_profile_enabled_at timestamptz;

-- slug único apenas quando o opt-in está ativo e o usuário não foi deletado.
CREATE UNIQUE INDEX IF NOT EXISTS users_public_slug_uniq
  ON users (public_slug)
  WHERE public_profile_enabled = true
    AND public_slug IS NOT NULL
    AND deleted_at IS NULL;

-- índice de performance para /c/[user_id]
CREATE INDEX IF NOT EXISTS users_public_enabled_idx
  ON users (id)
  WHERE public_profile_enabled = true AND deleted_at IS NULL;

COMMENT ON COLUMN users.public_slug IS
  'Identificador público imutável uma vez habilitado (opt-in).';
COMMENT ON COLUMN users.public_profile_enabled IS
  'Opt-in do usuário para aparecer em /c/[user_id]. Default: false (privado).';
COMMENT ON COLUMN users.public_profile_enabled_at IS
  'Carimbo de auditoria do momento do opt-in.';
