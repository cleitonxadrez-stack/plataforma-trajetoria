-- 0002_rls_users.sql
-- Row Level Security em `public.users` — o núcleo do Bloco 1.
--
-- Critério de aceite (docs/06-backlog.md §1.2):
--   "Usuário A não acessa dado de B nem por manipulação direta de query."

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;  -- bloqueia até o dono da tabela se não casar

-- SELECT: o próprio usuário só vê a si próprio.
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- INSERT: somente via trigger (handle_new_user) ou service-role.
-- Não permitir INSERT direto de cliente autenticado.
DROP POLICY IF EXISTS users_insert_blocked ON public.users;
CREATE POLICY users_insert_blocked ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE: o próprio usuário pode atualizar seu próprio perfil
-- mas SEM trocar o id (auth.uid() continua igual).
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: bloqueado para o cliente. Account deletion usa server action
-- que valida senha e roda como service-role.
DROP POLICY IF EXISTS users_delete_blocked ON public.users;
CREATE POLICY users_delete_blocked ON public.users
  FOR DELETE
  TO authenticated
  USING (false);

-- Comentários sobre service-role:
-- Chaves service-role BYPASSAM FORCE RLS por design do Supabase.
-- Por isso SUPABASE_SERVICE_ROLE_KEY NUNCA é NEXT_PUBLIC_* e só
-- é lida em server-only code (scripts de admin, jobs).
