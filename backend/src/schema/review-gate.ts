import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// 编导文案审核门数据层(T-086,SPEC docs/superpowers/specs/2026-07-03-content-review-gate.md §1/§2)。
// 两张表:
//   - review_rules           — L1 违禁词/模式 lint 规则库(种子移植自用户知识库两份文档;
//                              status='candidate' 是 T-087 复盘回流落点,用户采纳才 active)。
//   - script_review_reports  — 双层审核报告,绑脚本 artifact 版本号(改稿后旧报告自然过期,
//                              稿面按「报告版本 < 当前版本」提示重审)。
// 约定同仓内其它 schema:user_id 归属列全表必带(读侧 eq(userId, ctx.userId));时间戳
// ISO-8601 TEXT;JSON 列 jsonb。真表结构由 drizzle 迁移(0020_review_gate.sql)建。

export const reviewRules = pgTable("review_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** NULL 保留系统/历史用户共享层；新自定义规则仅从真实ctx写入组。 */
  groupId: text("group_id"),
  /** 'official_hard'(公约条文确定性投影)| 'empirical'(经验限流)| 'doudplus'(投放特有)。 */
  tier: text("tier").notNull(),
  /** 导流/绝对化/降权词/营销词/情绪类/隐私/复用/其他。 */
  category: text("category").notNull(),
  /** 'word'(全文子串)| 'regex'(谨慎白名单,种子内置谐音变体)。 */
  matchType: text("match_type").notNull(),
  pattern: text("pattern").notNull(),
  /** 建议替代(可空)。 */
  replacement: text("replacement"),
  /** 触发原因/出处(如「公约34」「2026-07-02 doud+ 实测」)。 */
  note: text("note").notNull().default(""),
  /** 'seed' | 'manual' | 'retro'(复盘回流,T-087)。 */
  source: text("source").notNull().default("seed"),
  /** 'active' | 'candidate'(回流待采纳)| 'disabled'。AI 绝不自动写 active。 */
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const scriptReviewReports = pgTable("script_review_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: text("project_id").notNull(),
  /** 审的脚本 artifact(可空 —— 极端情形脚本区无 artifact 时不产报告,留列为演化余量)。 */
  artifactId: text("artifact_id"),
  /** 审的是第几版脚本(= 当时的最大 versionNumber)。 */
  artifactVersion: integer("artifact_version").notNull(),
  /** 'pass' | 'risk' | 'block'。 */
  verdict: text("verdict").notNull(),
  summary: text("summary").notNull().default(""),
  /** L1 lint 命中项(LintFinding[],确定性)。 */
  lintFindings: jsonb("lint_findings").notNull().default([]),
  /** L2 语义审命中项(LlmFinding[],quote 已运行时校验为原文子串)。 */
  llmFindings: jsonb("llm_findings").notNull().default([]),
  /** 实际使用的通用文本模型名。 */
  modelLabel: text("model_label").notNull().default(""),
  reviewedAt: text("reviewed_at").notNull(),
});

// 与迁移 0020_review_gate.sql 同构的 DDL 串(仓内 schema 文件约定保留导出;
// 运行时建表走迁移,此串仅作模块内测试/工具兜底)。
export const REVIEW_GATE_DDL = `
CREATE TABLE IF NOT EXISTS review_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT,
  tier TEXT NOT NULL,
  category TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  replacement TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'seed',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_rules_user_status ON review_rules (user_id, status);
CREATE TABLE IF NOT EXISTS script_review_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  artifact_id TEXT,
  artifact_version INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  lint_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_label TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_review_reports_project ON script_review_reports (user_id, project_id, reviewed_at);
`;
