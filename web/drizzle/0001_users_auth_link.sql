-- 0001_users_auth_link.sql
-- Liga a tabela `users` ao auth.users do Supabase e define o trigger
-- de criação automática de perfil no signup.
--
-- IMPORTANTE: a coluna `id` em users = auth.users.id (mesmo UUID).
-- Isso é FUNDAMENTAL para as políticas RLS usarem auth.uid() = users.id.

-- (1) Se ainda não criou o schema, cria.
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE,
  full_name       text NOT NULL,
  citation_name   text,
  lattes_id       text,
  orcid           text,
  cpf_encrypted   text,
  birth_date_encrypted text,
  career_start_date   date,
  plan_tier       text NOT NULL DEFAULT 'FREE'
                  CHECK (plan_tier IN ('FREE','PRO','TEAM')),
  plan_expires_at timestamp with time zone,
  doc_quota_used  integer NOT NULL DEFAULT 0,
  doc_quota_limit integer NOT NULL DEFAULT 500,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at      timestamp with time zone
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);

-- Colunas timestamps são atualizadas em todo update
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch_updated_at ON public.users;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- (2) Trigger de criação de perfil no signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- (3) Função helper para policies
-- auth.uid() é o JWT subject (= id do usuário em auth.users).
-- Tabelas do schema `public` referenciam auth.users(id) por design.
