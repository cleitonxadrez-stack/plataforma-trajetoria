// lib/admin/stats.ts
// Agrega uso/custo de TODAS as contas para o painel /admin. Usa DATABASE_URL
// direto (role postgres, fora do RLS) — só chamado depois de checar isAdmin.

import postgres from "postgres";

export interface UserStat {
  userId: string;
  email: string;
  docs: number;
  mb: number;
  items: number;
  lastActive: string | null;
}

export interface AdminStats {
  totalUsers: number;
  totalDocs: number;
  totalMb: number;      // R2 (originais)
  dbBytes: number;      // tamanho do banco
  aiCostCents: number;  // custo de IA acumulado
  users: UserStat[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente.");
  const sql = postgres(url, { max: 1 });
  try {
    const [db] = await sql`select pg_database_size(current_database())::bigint as bytes`;
    const [tot] = await sql`select
      (select count(*) from auth.users)::int as users,
      (select count(*) from public.documents where deleted_at is null)::int as docs,
      (select coalesce(sum(size_original),0)::bigint from public.documents where deleted_at is null) as bytes,
      (select coalesce(sum(cost_cents),0)::int from public.document_extractions) as ai`;
    const rows = await sql`
      select u.id, u.email, u.last_sign_in_at,
        (select count(*) from public.documents d where d.user_id = u.id and d.deleted_at is null)::int as docs,
        (select coalesce(sum(size_original),0)::bigint from public.documents d where d.user_id = u.id and d.deleted_at is null) as bytes,
        (select count(*) from public.academic_items a where a.user_id = u.id and a.deleted_at is null)::int as items
      from auth.users u
      order by bytes desc nulls last
      limit 300`;
    return {
      totalUsers: Number(tot.users),
      totalDocs: Number(tot.docs),
      totalMb: Number(tot.bytes) / 1048576,
      dbBytes: Number(db.bytes),
      aiCostCents: Number(tot.ai),
      users: rows.map((r) => ({
        userId: r.id as string,
        email: (r.email as string) ?? "—",
        docs: Number(r.docs),
        mb: Number(r.bytes) / 1048576,
        items: Number(r.items),
        lastActive: r.last_sign_in_at ? new Date(r.last_sign_in_at as string | Date).toISOString() : null,
      })),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
