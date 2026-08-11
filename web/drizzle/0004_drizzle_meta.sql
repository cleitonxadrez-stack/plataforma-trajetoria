-- 0004_drizzle_meta.sql
-- Snapshot mínimo para o drizzle-kit reconhecer o estado.
-- (Em produção, drizzle-kit gera esses arquivos automaticamente via `db:generate`.)

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          SERIAL PRIMARY KEY,
  hash        text NOT NULL,
  created_at  bigint NOT NULL
);
