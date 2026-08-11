-- 0008_quota_function.sql
-- Função atômica de incremento de cota — chamada pelo servidor na hora do upload.
-- Read-modify-write dentro de uma CTE evita race entre uploads paralelos
-- do mesmo usuário ultrapassarem o plano.

CREATE OR REPLACE FUNCTION public.bump_quota(p_user_id uuid, p_delta integer)
RETURNS TABLE (used integer, limit_count integer) AS $$
DECLARE
  v_used int;
  v_limit int;
BEGIN
  UPDATE public.users
     SET doc_quota_used = doc_quota_used + p_delta,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING doc_quota_used, doc_quota_limit
     INTO v_used, v_limit;

  RETURN QUERY SELECT v_used, v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
