import { z } from "zod";
import { id, iso8601 } from "../primitives";

// 编导文案审核门(T-086,SPEC docs/superpowers/specs/2026-07-03-content-review-gate.md)。
// 两个资源:
//   - reviewRuleResource   — L1 违禁词/模式 lint 规则(review_rules 表,§1)。
//   - scriptReviewReportResource — 双层审核报告(script_review_reports 表,§2),
//     绑脚本 artifact 版本号(改稿后旧报告自然过期)。
// 契约 additive:不动任何既有 op/resource。

/** 规则分层:官方硬规则(公约条文的确定性投影)/ 经验限流 / doud+ 投放特有。 */
export const reviewRuleTier = z.enum(["official_hard", "empirical", "doudplus"]);
/** 规则状态:active 参与 lint;candidate 是 T-087 复盘回流落点(用户采纳才 active);disabled 停用。 */
export const reviewRuleStatus = z.enum(["active", "candidate", "disabled"]);
/** 匹配方式:word = 全文子串;regex = 谨慎白名单(种子内置谐音变体等)。 */
export const reviewRuleMatchType = z.enum(["word", "regex"]);

export const reviewRuleResource = z.object({
  id,
  /** additive：旧客户端资源无字段时兼容，正式服务始终明确适用层。 */
  groupId: id.nullable().optional(),
  scope: z.enum(["system", "shared_legacy", "group"]).optional(),
  scopeDescription: z.string().optional(),
  tier: reviewRuleTier,
  /** 类目(导流/绝对化/降权词/营销词/情绪类/隐私/复用/其他)。自由字符串,种子给规范值。 */
  category: z.string(),
  matchType: reviewRuleMatchType,
  pattern: z.string(),
  /** 建议替代(可空)。 */
  replacement: z.string().nullable(),
  /** 触发原因/出处(如「公约34」「2026-07-02 doud+ 实测」)。 */
  note: z.string(),
  /** 来源:seed 移植 / manual 手动 / retro 复盘回流(T-087)。 */
  source: z.enum(["seed", "manual", "retro"]),
  status: reviewRuleStatus,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type ReviewRuleResource = z.infer<typeof reviewRuleResource>;

/** L1 lint 命中项(确定性,quote 必为原文子串)。 */
export const lintFindingResource = z.object({
  ruleId: id,
  quote: z.string(),
  offset: z.number().int(),
  tier: reviewRuleTier,
  category: z.string(),
  replacement: z.string().nullable(),
  note: z.string(),
});
export type LintFindingResource = z.infer<typeof lintFindingResource>;

/** L2 语义审命中项(quote 经运行时校验为原文子串,防幻觉命中)。 */
export const llmFindingResource = z.object({
  quote: z.string(),
  category: z.string(),
  severity: z.enum(["block", "warn", "info"]),
  reason: z.string(),
  /** 最小改写建议(可空;走确认门应用,绝不自动改稿)。 */
  suggestion: z.string().nullable(),
  /** 公约小节号/规则 id(可空)。 */
  ruleRef: z.string().nullable(),
});
export type LlmFindingResource = z.infer<typeof llmFindingResource>;

export const scriptReviewVerdict = z.enum(["pass", "risk", "block"]);

export const scriptReviewReportResource = z.object({
  id,
  projectId: id,
  /** 审的是哪个脚本 artifact(改写建议应用/撤销的目标)。 */
  artifactId: id.nullable(),
  /** 审的是脚本第几版 —— 稿面按「报告版本 < 当前版本」显示「稿已改动,建议重审」。 */
  artifactVersion: z.number().int(),
  verdict: scriptReviewVerdict,
  summary: z.string(),
  lintFindings: z.array(lintFindingResource),
  llmFindings: z.array(llmFindingResource),
  /** 实际使用的通用文本模型名。 */
  modelLabel: z.string(),
  reviewedAt: iso8601,
});
export type ScriptReviewReportResource = z.infer<
  typeof scriptReviewReportResource
>;
