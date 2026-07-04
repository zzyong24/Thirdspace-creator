import { and, desc, eq, type Db } from "@creatoros/backend";
import { reviewRules, scriptReviewReports } from "./review-gate.db-schema";
import { OwnershipError } from "./review-gate.errors";

// 审核门仓储(T-086,SPEC §1/§2)—— user-scoped 查询 ONLY(照 reviews 仓储约定):
// userId 在构造期烘进 deps,EVERY 查询 eq(table.userId, deps.userId)、EVERY 写入盖
// userId: deps.userId。私有 getRuleRow 在 scoped select 落空时抛 OwnershipError(→404,
// 绝不泄露跨用户行存在性,foundation §2)。仓储只执行 service 已批准的写(状态流转/采纳门
// 的守卫在 service,SPEC §1「AI 绝不自动写 active」)。

export type ReviewRuleRow = typeof reviewRules.$inferSelect;
export type ScriptReviewReportRow = typeof scriptReviewReports.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 时钟(注入,测试确定性)
  nextId: (prefix: string) => string; // id 生成器(测试确定性)
  userId: string; // 归属边界,构造期烘入
}

export interface CreateRuleInput {
  tier: "official_hard" | "empirical" | "doudplus";
  category: string;
  matchType: "word" | "regex";
  pattern: string;
  replacement: string | null;
  note: string;
  source: "seed" | "manual" | "retro";
  status: "active" | "candidate" | "disabled";
}

export interface PatchRuleInput {
  status?: "active" | "candidate" | "disabled";
  pattern?: string;
  replacement?: string | null;
  note?: string;
  category?: string;
}

export interface CreateReportInput {
  projectId: string;
  artifactId: string | null;
  artifactVersion: number;
  verdict: "pass" | "risk" | "block";
  summary: string;
  lintFindings: unknown[];
  llmFindings: unknown[];
  modelLabel: string;
}

export interface ReviewGateRepository {
  // ── 规则库 CRUD(§1)──
  /** fixture 灌种子(行上已带 user_id;幂等 onConflictDoNothing)。 */
  seedRules(rows: ReviewRuleRow[]): Promise<void>;
  /** 列全部规则(所有 status,前端管理面分组;lint 引擎在 service 里滤 active)。 */
  listRules(): Promise<ReviewRuleRow[]>;
  /** 仅列 active 规则(L1 lint 引擎消费)。 */
  listActiveRules(): Promise<ReviewRuleRow[]>;
  createRule(input: CreateRuleInput): Promise<ReviewRuleRow>;
  patchRule(ruleId: string, input: PatchRuleInput): Promise<ReviewRuleRow>;
  deleteRule(ruleId: string): Promise<void>;

  // ── 审核报告读写(§2,绑脚本 artifact 版本号)──
  insertReport(input: CreateReportInput): Promise<ScriptReviewReportRow>;
  /** 某项目最新一份报告(reviewedAt 降序取首);无 → null(前端诚实显「未审」)。 */
  getLatestReport(projectId: string): Promise<ScriptReviewReportRow | null>;
}

export function createReviewGateRepository(
  db: Db,
  deps: RepoDeps,
): ReviewGateRepository {
  // 私有归属门:某规则的 scoped select。空 ⇒ OwnershipError(→404,跨用户/未知 id
  // 绝不泄露存在性)。
  async function getRuleRow(ruleId: string): Promise<ReviewRuleRow> {
    const rows = await db
      .select()
      .from(reviewRules)
      .where(
        and(eq(reviewRules.userId, deps.userId), eq(reviewRules.id, ruleId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: review rule not found: ${ruleId}`,
      );
    }
    return row;
  }

  return {
    async seedRules(rows) {
      if (rows.length === 0) return;
      await db.insert(reviewRules).values(rows).onConflictDoNothing();
    },

    async listRules() {
      return db
        .select()
        .from(reviewRules)
        .where(eq(reviewRules.userId, deps.userId))
        .orderBy(desc(reviewRules.createdAt));
    },

    async listActiveRules() {
      return db
        .select()
        .from(reviewRules)
        .where(
          and(
            eq(reviewRules.userId, deps.userId),
            eq(reviewRules.status, "active"),
          ),
        );
    },

    async createRule(input) {
      const nowTs = deps.now();
      const inserted = await db
        .insert(reviewRules)
        .values({
          id: deps.nextId("rrule"),
          userId: deps.userId,
          tier: input.tier,
          category: input.category,
          matchType: input.matchType,
          pattern: input.pattern,
          replacement: input.replacement,
          note: input.note,
          source: input.source,
          status: input.status,
          createdAt: nowTs,
          updatedAt: nowTs,
        })
        .returning();
      return inserted[0]!;
    },

    async patchRule(ruleId, input) {
      await getRuleRow(ruleId); // scoped 归属门
      const patch: Partial<ReviewRuleRow> = { updatedAt: deps.now() };
      if (input.status !== undefined) patch.status = input.status;
      if (input.pattern !== undefined) patch.pattern = input.pattern;
      if (input.replacement !== undefined) patch.replacement = input.replacement;
      if (input.note !== undefined) patch.note = input.note;
      if (input.category !== undefined) patch.category = input.category;
      const updated = await db
        .update(reviewRules)
        .set(patch)
        .where(
          and(eq(reviewRules.userId, deps.userId), eq(reviewRules.id, ruleId)),
        )
        .returning();
      return updated[0]!;
    },

    async deleteRule(ruleId) {
      await getRuleRow(ruleId); // scoped 归属门
      await db
        .delete(reviewRules)
        .where(
          and(eq(reviewRules.userId, deps.userId), eq(reviewRules.id, ruleId)),
        );
    },

    async insertReport(input) {
      const inserted = await db
        .insert(scriptReviewReports)
        .values({
          id: deps.nextId("srreport"),
          userId: deps.userId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
          verdict: input.verdict,
          summary: input.summary,
          lintFindings: input.lintFindings,
          llmFindings: input.llmFindings,
          modelLabel: input.modelLabel,
          reviewedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async getLatestReport(projectId) {
      const rows = await db
        .select()
        .from(scriptReviewReports)
        .where(
          and(
            eq(scriptReviewReports.userId, deps.userId),
            eq(scriptReviewReports.projectId, projectId),
          ),
        )
        .orderBy(desc(scriptReviewReports.reviewedAt))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
