import {
  pgTable,
  text,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

// Monetization tables (七步整合设计 §4 — 柔性产品模型 + 归因层 + 漏斗中心;
// contract v0.4 resources/monetization.ts; SPEC §13 "变现" group). The canonical
// defs live in shared infra (@creatoros/backend) because createDb() applies
// MONETIZATION_DDL at init alongside PROJECTS_DDL / POSITIONING_DDL / … (foundation
// §1: the pglite/Drizzle db factory is the shared-infra home). The monetization
// module (frontend/src/server/modules/monetization) re-exports these so there is
// ONE source of truth, mirroring positioning/learnings (db-schema.ts ↔
// backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; data-model constraint 1 — stamped at write time from
// ctx.userId). Timestamps are ISO-8601 TEXT (to match the contract `iso8601`
// strings). Money (`price` / `value`) is DOUBLE PRECISION (mirrors analytics
// numeric_value; the contract DTO is z.number()).
//
// Three §4.1 design invariants are backed structurally here:
//   1. 漏损现实 (§4.1.1): Lead.attributed_content_id + attribution_confidence are
//      NULLABLE by design — most leads归不了因; the funnel surfaces them honestly.
//   2. 不重造 SCRM (§4.1.2): 成交 facts arrive via ingestion_run_id (a REAL
//      IngestionRun, RISK-005) or manual 登记 — never a parallel ingest write path.
//   3. 变现方式会变 (§4.1.3): price hangs on OFFER, not Product. A re-price = a NEW
//      offer row (append-only `version` chain); ConversionEvent snapshots offer_id +
//      value and is NEVER mutated.

// Product — `kind` is free-form/user-defined (§4.2 "不硬编码类型"); NOT an enum.
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // free-form, user-defined
  tier: text("tier"), // nullable label: 引流/入门/核心/高端 (sort-view only)
  deliveryWeight: text("delivery_weight"), // 轻↔重 (nullable label)
  targetPersona: text("target_persona"), // nullable
  status: text("status").notNull().default("active"), // active|retired
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Offer — append-only price snapshot. Price lives HERE, never on Product (§4.2).
export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(), // FK → products
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull().default("CNY"),
  version: integer("version").notNull(), // (max existing for product) + 1
  validFrom: text("valid_from"), // nullable
  validTo: text("valid_to"), // nullable
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("active"), // active|expired
  createdAt: text("created_at").notNull(),
});

// Lead — attribution is naturally broken (§4.1.1); attributed_content_id +
// attribution_* are nullable by design.
export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(), // survey|manual|entry_code|wecom
  surveySource: text("survey_source"), // nullable
  entryCodeId: text("entry_code_id"), // nullable — P1, kept nullable now
  attributedContentId: text("attributed_content_id"), // nullable FK → ContentOutput
  attributionMethod: text("attribution_method"), // nullable enum
  attributionConfidence: text("attribution_confidence"), // nullable high|med|low
  status: text("status").notNull().default("new"), // new|qualified|won|lost
  ingestionRunId: text("ingestion_run_id"), // nullable — set when ingested (RISK-005)
  recordKey: text("record_key"), // nullable — the (run, record_key) idempotency key
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ConversionEvent — hangs on Lead (§4.3); snapshots offer_id + value (immutable).
export const conversionEvents = pgTable("conversion_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  leadId: text("lead_id").notNull(), // FK → leads
  productId: text("product_id"), // nullable
  offerId: text("offer_id"), // nullable
  eventType: text("event_type").notNull(), // profile_visit|follow|lead|inquiry|signup|purchase|repurchase
  value: doublePrecision("value"), // nullable — the 金额 snapshot
  currency: text("currency"), // nullable
  occurredAt: text("occurred_at").notNull(),
  ingestionRunId: text("ingestion_run_id"), // nullable
  createdAt: text("created_at").notNull(),
});

// ContentOutputProduct — 意图层 join (§4.4): a content铺路 a product (at most once).
export const contentOutputProducts = pgTable("content_output_products", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentOutputId: text("content_output_id").notNull(),
  productId: text("product_id").notNull(),
  contentRole: text("content_role"), // nullable per-link declaration: traffic|trust|conversion
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet). All
// CREATE … IF NOT EXISTS (idempotent — re-run on a re-built singleton is a no-op).
//   - uq_offers_product_version: one row per (product, version) — append-only.
//   - uq_conversion_dedup: row-level ingest guard (run-level idempotency lives in
//     Ingestion's (run, record_key); this catches duplicate manual登记 too).
//   - uq_content_output_products: a content铺路 a product at most once (§4.4).
//   - idx_leads_funnel / idx_conversion_funnel: back the user-scoped funnel reads.
export const MONETIZATION_DDL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  tier TEXT,
  delivery_weight TEXT,
  target_persona TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  version INTEGER NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_product_version ON offers (user_id, product_id, version);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  survey_source TEXT,
  entry_code_id TEXT,
  attributed_content_id TEXT,
  attribution_method TEXT,
  attribution_confidence TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  ingestion_run_id TEXT,
  record_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_ingest_key ON leads (user_id, ingestion_run_id, record_key);
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON leads (user_id, attributed_content_id);
CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  product_id TEXT,
  offer_id TEXT,
  event_type TEXT NOT NULL,
  value DOUBLE PRECISION,
  currency TEXT,
  occurred_at TEXT NOT NULL,
  ingestion_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversion_dedup ON conversion_events (user_id, lead_id, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conversion_funnel ON conversion_events (user_id, lead_id);
CREATE TABLE IF NOT EXISTS content_output_products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  content_role TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_output_products ON content_output_products (user_id, content_output_id, product_id);
`;
