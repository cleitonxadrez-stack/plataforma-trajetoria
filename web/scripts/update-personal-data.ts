// scripts/update-personal-data.ts
// Expande personal_data com campos de cadastro e grava os dados do titular.
// USO: INGEST_USER_ID=<uuid> npx tsx --env-file=.env scripts/update-personal-data.ts

import postgres from "postgres";

const USER_ID = process.env.INGEST_USER_ID;
if (!USER_ID) { console.error("Falta INGEST_USER_ID"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

async function main() {
  await sql.unsafe(`
    alter table public.personal_data
      add column if not exists matricula text,
      add column if not exists gender text,
      add column if not exists marital_status text,
      add column if not exists education text,
      add column if not exists father_name text,
      add column if not exists mother_name text,
      add column if not exists ramal text,
      add column if not exists cnh text,
      add column if not exists military_doc text,
      add column if not exists pis text,
      add column if not exists bank text;
  `);

  await sql`
    update public.personal_data set
      cpf = '044.659.489-05',
      rg = '33424420 - SSP/MT',
      voter_id = '82510540671 - Zona 60, Seção 80 / MT',
      matricula = '209320',
      gender = 'Masculino',
      marital_status = null,
      education = 'Mestrado',
      father_name = 'José Santana',
      mother_name = 'Aparecida Pereira da Silva Santana',
      ramal = '65 3057-0966',
      cnh = '3291005200 - Categoria AB - Validade 23/06/2013 / MT',
      military_doc = '727 - Série E - Categoria 2',
      pis = '19035394812 (06/06/2006)',
      bank = 'Banco do Brasil S/A - Ag. 3036-8, C/C 27021-0',
      address = 'Avenida Rua F, 23 — Bairro Barro do Pari, Cuiabá/MT, CEP 78035-410',
      updated_at = now()
    where user_id = ${USER_ID}
  `;

  const [r] = await sql`select cpf, rg, matricula, education from public.personal_data where user_id = ${USER_ID}`;
  console.log("✓ Dados atualizados:", JSON.stringify(r));
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
