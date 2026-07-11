import { pgTable, text, doublePrecision, jsonb } from "drizzle-orm/pg-core";

// [T-235d] 正向归因回流 —— 选题验证库(topic_attributions,SPEC 2026-07-11 daily-topic-autopilot §2.4)。
//
// 定位:已发布作品的实绩按**选题维度**归因(topic_type/hook_type/structure_formula 枚举化 +
//   why/公式受限自由文本),沉淀成「哪类选题在我账号被验证过」的可聚合资产;next_experiments
//   由 runner 转化进候选池(source 复用现有枚举 + title 前缀「实验|」,card.attributionId 溯源)。
//
// [gate-F1] 归因 × learnings 边界:两体系维度不同、消费方不同、**不共写同一表、不互相触发**——
//   本表=选题维度(消费方:选题池/选题验证库/实验候选),由发布实绩(self.detail 采集)触发;
//   learnings=脚本级经验(绑 project/script),由复盘/编辑触发。同一作品两者并存,关联锚=
//   都带 project_id 溯源。
//
// Ownership:user_id TEXT NOT NULL(写时从 ctx.userId stamp);account_id nullable 按号隔离。
// 幂等锚:(user_id, publication_id) 唯一 —— 一条发布作品至多一条归因(重跑 upsert 更新,不重复)。
// 表现分层:performance_tier ∈ viral|normal|low,按**相对本账号基线**算(播放/赞相对账号均值
//   倍数,阈值配置化;绝不用 dy-- 的绝对阈值)。分层依据(倍数/基线)进 raw jsonb 可溯源。
// 时间戳:ISO-8601 TEXT(对齐 contract iso8601)。
//
// canonical 定义落 shared infra(@creatoros/backend)—— 迁移 0036 建表,db.ts schema 并入,
//   模块 topic-attribution.db-schema.ts 再 re-export(ONE source of truth,同 benchmark/trend-sources)。

export const topicAttributions = pgTable("topic_attributions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界
  accountId: text("account_id"), // [T-201] 按号隔离;nullable 稳定终态
  publicationId: text("publication_id").notNull(), // soft FK → publications.id(幂等锚)
  projectId: text("project_id"), // soft FK → projects.id(溯源;与 learnings 的关联锚)
  performanceTier: text("performance_tier").notNull().default("normal"), // viral|normal|low(相对本账号基线)
  baselineRatio: doublePrecision("baseline_ratio"), // 播放(回退赞)相对账号均值的倍数(分层依据;无基线 NULL)
  topicType: text("topic_type").notNull(), // gate-F3 枚举:教程|观点|案例拆解|工具测评|热点跟进|故事
  hookType: text("hook_type").notNull(), // gate-F3 枚举:反差|具体数字|痛点直击|悬念|利益承诺|身份共鸣
  structureFormula: text("structure_formula").notNull(), // gate-F3 枚举:痛点-方案-证明-CTA|三步教程|对比实验|叙事-转折-干货|清单式
  whyWorked: text("why_worked").notNull().default(""), // 受限自由文本(须引逐字稿原文;无据空)
  whyFailed: text("why_failed").notNull().default(""), // 同上
  reusableFormula: text("reusable_formula").notNull().default(""), // 可复用公式(须有逐字稿依据;无则空)
  raw: jsonb("raw").notNull().default({}), // 完整归因产出 + 分层依据(next_experiments/指标快照等,溯源)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL(参考/文档用;实际建表经版本化迁移 0036,与 benchmark/trend-sources 同款)。全部幂等。
//   - ux_topic_attributions_pub:同 user+publication 唯一(幂等锚,重跑 upsert 不重复归因)。
export const TOPIC_ATTRIBUTION_DDL = `
CREATE TABLE IF NOT EXISTS topic_attributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  publication_id TEXT NOT NULL,
  project_id TEXT,
  performance_tier TEXT NOT NULL DEFAULT 'normal',
  baseline_ratio DOUBLE PRECISION,
  topic_type TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  structure_formula TEXT NOT NULL,
  why_worked TEXT NOT NULL DEFAULT '',
  why_failed TEXT NOT NULL DEFAULT '',
  reusable_formula TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_attributions_pub ON topic_attributions (user_id, publication_id);
CREATE INDEX IF NOT EXISTS ix_topic_attributions_user_account ON topic_attributions (user_id, account_id);
`;
