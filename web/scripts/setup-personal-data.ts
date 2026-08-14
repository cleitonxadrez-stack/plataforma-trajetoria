// scripts/setup-personal-data.ts
// Cria a tabela personal_data (dados pessoais para cadastros) com RLS
// (dono-only) e semeia com os dados do titular.
// USO: INGEST_USER_ID=<uuid> npx tsx --env-file=.env scripts/setup-personal-data.ts

import postgres from "postgres";

const USER_ID = process.env.INGEST_USER_ID;
if (!USER_ID) { console.error("Falta INGEST_USER_ID"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

async function main() {
  await sql.unsafe(`
    create table if not exists public.personal_data (
      user_id uuid primary key references auth.users(id) on delete cascade,
      full_name text, citation_name text, birth_date text, birth_place text,
      lattes_id text, orcid text, cpf text, rg text, voter_id text,
      email text, email_alt text, phone text,
      address text, address_prof text, facebook text, linkedin text,
      languages jsonb default '[]'::jsonb, extra jsonb default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
    alter table public.personal_data enable row level security;
    drop policy if exists personal_data_owner on public.personal_data;
    create policy personal_data_owner on public.personal_data
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  `);

  const languages = JSON.stringify([
    { lang: "Inglês", detail: "Compreende bem; fala, escreve e lê razoavelmente" },
    { lang: "Espanhol", detail: "Compreende bem; fala razoavelmente; escreve e lê bem" },
  ]);

  await sql`
    insert into public.personal_data
      (user_id, full_name, citation_name, birth_date, birth_place, lattes_id, orcid,
       email, email_alt, phone, address, address_prof, facebook, linkedin, languages)
    values (
      ${USER_ID},
      'Cleiton Marino Santana',
      'SANTANA, C. M.; SANTANA, Cleiton Marino',
      '24/12/1984',
      'Toledo/PR - Brasil',
      '1382148648127357',
      'https://orcid.org/0000-0001-9999-0726',
      'cleitonxadrez@gmail.com',
      'cleitonmsxadrez@hotmail.com',
      '65 99662-7072',
      'Travessa M (Village Flamboyant), Barra do Pari — Cuiabá/MT, CEP 78035-480',
      'SECITECI — Superintendência de Desenvolvimento da CT&I. Av. Ten. Cel. Duarte, 1234, Centro Sul — Cuiabá/MT, CEP 78360-000',
      'https://www.facebook.com/cleiton.marinosantana',
      'https://www.linkedin.com/in/cleiton-marino-santana-120575272/',
      ${languages}::jsonb
    )
    on conflict (user_id) do update set
      full_name = excluded.full_name, citation_name = excluded.citation_name,
      birth_date = excluded.birth_date, birth_place = excluded.birth_place,
      lattes_id = excluded.lattes_id, orcid = excluded.orcid,
      email = excluded.email, email_alt = excluded.email_alt, phone = excluded.phone,
      address = excluded.address, address_prof = excluded.address_prof,
      facebook = excluded.facebook, linkedin = excluded.linkedin,
      languages = excluded.languages, updated_at = now();
  `;

  const [row] = await sql`select full_name, lattes_id from public.personal_data where user_id = ${USER_ID}`;
  console.log("✓ personal_data pronta e semeada:", row?.full_name, "· Lattes", row?.lattes_id);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
