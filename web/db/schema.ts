// db/schema.ts — fonte da verdade do banco.
//
// Replicado de ../db/schema.ts (entregável 5 do item 18).
// Toda tabela tem id uuid, created_at, updated_at, deleted_at (soft delete).
// user_id referencia auth.users(id) quando aplicável.
// Não há coluna `tenant_id` / `org_id` — o isolamento é por usuário (RLS por auth.uid()).
// enums como text + CHECK (convenção do projeto: evoluir sem migration).

// Cluster A fix #1 — drizzle-orm@0.36.4: o tag helper `sql` vive em
// `drizzle-orm` (top-level re-exporta ./sql/index.js) e NÃO em
// `drizzle-orm/pg-core`. Mantemos o resto das primitivas de pg-core aqui.
import {
  pgTable, uuid, text, integer, numeric, boolean,
  timestamp, jsonb, date, index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const base = {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ─── USUÁRIO E PERFIL ────────────────────────────────────
export const users = pgTable(
  "users",
  {
    ...base,
    // id é gerado por auth.users — forçamos sincronização via trigger (migration 0003)
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    citationName: text("citation_name"),
    lattesId: text("lattes_id"),
    orcid: text("orcid"),
    cpfEncrypted: text("cpf_encrypted"),
    birthDateEncrypted: text("birth_date_encrypted"),
    careerStartDate: date("career_start_date"),
    planTier: text("plan_tier").default("FREE").notNull(),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    docQuotaUsed: integer("doc_quota_used").default(0).notNull(),
    docQuotaLimit: integer("doc_quota_limit").default(500).notNull(),
    // Item #6 — opt-in do perfil público /c/[user_id]. Privado por padrão.
    publicSlug: text("public_slug"),
    publicProfileEnabled: boolean("public_profile_enabled").default(false).notNull(),
    publicProfileEnabledAt: timestamp("public_profile_enabled_at", { withTimezone: true }),
  },
  (t) => ({
    publicSlugIdx: uniqueIndex("users_public_slug_uniq")
      .on(t.publicSlug)
      .where(sql`${t.publicSlug} IS NOT NULL AND ${t.publicProfileEnabled} = true AND ${t.deletedAt} IS NULL`),
    publicEnabledIdx: index("users_public_profile_enabled_idx")
      .on(t.id)
      .where(sql`${t.publicProfileEnabled} = true AND ${t.deletedAt} IS NULL`),
  }),
);

export const institutions = pgTable("institutions", {
  ...base,
  name: text("name").notNull(),
  acronym: text("acronym"),
  country: text("country").default("BR"),
  state: text("state"),
  city: text("city"),
  cnpqCode: text("cnpq_code"),
  contactChannels: jsonb("contact_channels").$type<{
    secretariaAcademica?: string;
    biblioteca?: string;
    proReitoriaExtensao?: string;
  }>(),
}, (t) => ({ nameIdx: index("institutions_name_idx").on(t.name) }));

export const careerInterruptions = pgTable("career_interruptions", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  evidenceId: uuid("evidence_id"),
});

export const userVisibilityConsent = pgTable("user_visibility_consent", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  level: text("level").default("FORA").notNull(),
  consentTextVersion: text("consent_text_version").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// ─── DOCUMENTOS ──────────────────────────────────────────
export const documents = pgTable("documents", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeOriginal: integer("size_original").notNull(),
  sizeOptimized: integer("size_optimized"),
  storageKeyOriginal: text("storage_key_original").notNull(),
  storageKeyOptimized: text("storage_key_optimized"),
  storageKeyThumbnail: text("storage_key_thumbnail"),
  sha256: text("sha256").notNull(),
  registryCode: text("registry_code").notNull().unique(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
  pageCount: integer("page_count"),
  hasTextLayer: boolean("has_text_layer").default(false).notNull(),
  ocrStatus: text("ocr_status").default("PENDENTE").notNull(),
  extractedText: text("extracted_text"),
  processingStatus: text("processing_status").default("FILA").notNull(),
  visibility: text("visibility").default("PRIVADO").notNull(),
}, (t) => ({
  userIdx: index("documents_user_idx").on(t.userId),
  registryIdx: uniqueIndex("documents_registry_idx").on(t.registryCode),
  sha256Idx: index("documents_sha256_idx").on(t.sha256),
}));

// ─── ITENS ACADÊMICOS ────────────────────────────────────
export const academicItems = pgTable("academic_items", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  itemType: text("item_type").notNull(),
  natureza: text("natureza"),
  title: text("title").notNull(),
  titleEn: text("title_en"),
  year: integer("year"),
  country: text("country"),
  language: text("language"),
  meioDivulgacao: text("meio_divulgacao"),
  doi: text("doi"),
  isbn: text("isbn"),
  issn: text("issn"),
  homePage: text("home_page"),
  qualisStratum: text("qualis_stratum"),
  authorCount: integer("author_count").default(1).notNull(),
  origin: text("origin").default("MANUAL").notNull(),
  verificationLevel: text("verification_level").default("AUTODECLARADO").notNull(),
  evidenceStatus: text("evidence_status").default("SEM_COMPROVANTE").notNull(),
  needsReview: boolean("needs_review").default(false).notNull(),
  visibility: text("visibility").default("PRIVADO").notNull(),
  // Item #3 (Sprint 1) — campos Lattes: dedupe idempotente + dados crus do XML.
  lattesDedupeKey: text("lattes_dedupe_key"),
  rawLattesNature: text("raw_lattes_nature"),
  rawLattesId: text("raw_lattes_id"),
  rawAuthors: jsonb("raw_authors").$type<string[]>(),
  flaggedLattes: boolean("flagged_lattes").notNull().default(false),
  flaggedInnovation: boolean("flagged_innovation").notNull().default(false),
}, (t) => ({
  userIdx: index("items_user_idx").on(t.userId),
  typeIdx: index("items_type_idx").on(t.itemType),
  yearIdx: index("items_year_idx").on(t.year),
  statusIdx: index("items_status_idx").on(t.evidenceStatus),
  doiIdx: index("items_doi_idx").on(t.doi),
  dedupeIdx: uniqueIndex("academic_items_user_dedupe_uniq")
    .on(t.userId, t.lattesDedupeKey)
    .where(sql`${t.deletedAt} IS NULL AND ${t.lattesDedupeKey} IS NOT NULL`),
}));

// ═══════════════════════════════════════════════════════════
// BLOCO 2 — COFRE · upload, cascata, revisão
// ═══════════════════════════════════════════════════════════

/* Fila — espelho de pg-boss em Postgres.
   pg-boss cria suas próprias tabelas em schema pgboss; aqui persiste-se
   SOMENTE o estado durável que sobrevive a restart do worker. */
export const processingJobs = pgTable("processing_jobs", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  jobName: text("job_name").notNull(),
  /* extract-cascade | identity-resolve | normalize | re-extract */
  status: text("status").default("AGENDADO").notNull(),
  /* AGENDADO | EM_ANDAMENTO | SUCESSO | ERRO | MORTO */
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  costCents: integer("cost_cents").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
}, (t) => ({
  userIdx: index("processing_jobs_user_idx").on(t.userId),
  documentIdx: index("processing_jobs_doc_idx").on(t.documentId),
  statusIdx: index("processing_jobs_status_idx").on(t.status),
}));

/* Histórico de cada passo da cascata executada em um documento.
   Necessário para: (1) auditoria, (2) re-uso via templates, (3) provar a
   regra "IA só quando passos 1-5 falharam". */
export const documentExtractions = pgTable("document_extractions", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  step: integer("step").notNull(),
  /* 1 texto embutido | 2 QR | 3 identificador | 4 template | 5 OCR | 6 IA */
  source: text("source").notNull(),
  /* pdf-parse | jsqr | crossref | ocr | ia-<model> | template:<id> */
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  fields: jsonb("fields"),
  rawHash: text("raw_hash"),
  costCents: integer("cost_cents").default(0).notNull(),
  succeeded: boolean("succeeded").notNull(),
}, (t) => ({
  docIdx: index("extractions_doc_idx").on(t.documentId),
  stepIdx: index("extractions_step_idx").on(t.step),
}));

/* Templates aprendidos — fingerprint estrutural → campos.
   O doc que passar por IA ensina o sistema. Re-uso sem custo. */
export const documentTemplates = pgTable("document_templates", {
  ...base,
  userId: uuid("user_id").references(() => users.id),
  /* null = template global; !null = template criado/learned por este user */
  fingerprint: text("fingerprint").notNull(),
  documentType: text("document_type").notNull(),
  /* CERTIFICADO | DIPLOMA | ATA | ARTIGO | CAPA_FICHA | OUTROS */
  bboxMap: jsonb("bbox_map").notNull(),
  exampleDocumentId: uuid("example_document_id").references(() => documents.id),
  usesCount: integer("uses_count").default(0).notNull(),
}, (t) => ({
  fpIdx: uniqueIndex("templates_fingerprint_idx").on(t.fingerprint),
  typeIdx: index("templates_type_idx").on(t.documentType),
}));

/* Vínculo N:N entre item acadêmico e documento.
   É O CORAÇÃO da cadeia USUÁRIO→ITEM→DOCUMENTO→EVIDÊNCIA→VALIDAÇÃO. */
export const evidences = pgTable("evidences", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  itemId: uuid("item_id").notNull().references(() => academicItems.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  /* evidência exigida conforme tipo do item — vide docs/03-referencia-lattes.md */
  role: text("role").notNull(),
  /* PRIMARY | PARCIAL | REFERENCIA | CITACAO */
  extractedFromStep: integer("extracted_from_step"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  notes: text("notes"),
}, (t) => ({
  itemIdx: index("evidences_item_idx").on(t.itemId),
  docIdx: index("evidences_doc_idx").on(t.documentId),
  uniquePair: uniqueIndex("evidences_unique_pair_idx").on(t.itemId, t.documentId),
}));

// ═══════════════════════════════════════════════════════════
// BLOCO 6 — RECUPERAÇÃO ASSISTIDA · cartas para instituições
// ═══════════════════════════════════════════════════════════

/* Carta única por instituição (per docs/05-fluxos.md §Fluxo 7).
   "12 itens da UNIPAR" → 1 request agrupando todos os itens dessa
   instituição. Follow-up cron diário — 30 dias sem resposta → ping.
   consent_text_version é obrigatório: quando o termo de consentimento
   muda, incrementamos a versão e nenhuma carta antiga conta como
   válida sem aceite explícito. */

export const recoveryRequests = pgTable("recovery_requests", {
  ...base,
  userId: uuid("user_id").notNull().references(() => users.id),
  institutionId: uuid("institution_id").notNull().references(() => institutions.id),
  itemIds: jsonb("item_ids").$type<string[]>().notNull(),
  status: text("status").default("ABERTA").notNull(),
  /* ABERTA | ENVIADA | RESPONDIDA | CANCELADA */
  consentTextVersion: text("consent_text_version").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  channelUsed: text("channel_used"),
  /* secretariaAcademica | biblioteca | proReitoriaExtensao | outro */
  freeTextReply: text("free_text_reply"),
  lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("recovery_requests_user_idx").on(t.userId),
  institutionIdx: index("recovery_requests_inst_idx").on(t.institutionId),
  statusIdx: index("recovery_requests_status_idx").on(t.status),
}));

// ═══════════════════════════════════════════════════════════
// BLOCO 5 — INDICADORES PESSOAIS · trajetória pessoal (§6.6)
// ═══════════════════════════════════════════════════════════

/* Materialização do job `compute-indicators` (docs/01-arquitetura.md §10).
   Cada user tem no máximo 1 linha viva (soft-delete permite histórico).
   Métrica padrão: window_years=NULL, apply_caps=false — vida inteira, sem
   corte (regra do Bloco 5). */

export const trajectoryIndicators = pgTable("trajectory_indicators", {
  ...base,
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  // placeholder até o motor de metodologias (Bloco 4) gerar valor real
  totalScore: numeric("total_score", { precision: 8, scale: 2 }).default("0").notNull(),
  amplitude: integer("amplitude").default(0).notNull(),
  continuityYears: integer("continuity_years").default(0).notNull(),
  coveragePct: numeric("coverage_pct", { precision: 5, scale: 2 }).default("0").notNull(),
  // placeholder até a camada temática (Bloco 7) ser ativada
  themeCount: integer("theme_count").default(0).notNull(),
  careerStartDate: date("career_start_date"),
  careerYearsAdjusted: numeric("career_years_adjusted", { precision: 5, scale: 2 }).default("0").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});
