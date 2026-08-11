// db/index.ts — cliente Drizzle.
// ⚠️ Usa postgres-js direto (DATABASE_URL), não o Supabase client.
// Usado apenas pelo script de migração e jobs do pg-boss — nunca em request handler.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  // Não falha em build/edge — só avisa. Importar este módulo fora de migração é erro do dev.
  // eslint-disable-next-line no-console
  console.warn("[db] DATABASE_URL não definida — cliente Drizzle não inicializou.");
}

export const sql = url ? postgres(url, { max: 10, prepare: false }) : undefined;
export const db = sql ? drizzle(sql, { schema }) : undefined;
