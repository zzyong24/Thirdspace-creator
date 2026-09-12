import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 文案审核 skill 模板(script.review,T-086 SPEC §2)—— L2 语义审。
 * 覆盖 L1 lint 抓不住的擦边/暗示/虚假夸大/人设造假/标题党语气/隐私泄露等语义级风险,
 * generateObject 绑结构化报告 schema(命中项/风险等级/改写建议)。
 * facets:
 *   - script(必需):待审全文。
 *   - lexicon:创作者配置的违禁词表(runner 注入 active 词表);L1 已按表精确匹配,模型据此照表
 *     复核 lint 精确匹配漏掉的谐音/变体/拆字/同义命中。空则省略。
 *   - lintFindings:L1 结果注入(让 L2 结合语境复核字面线索),空则整段省略。
 *   - officialRules:公约 Tier1 条文摘要(模板内置默认,可被 skill_config_overrides 换)。
 *   - positioning:创作者定位(判「是否带货/医疗金融资质红线」语境),空则省略。
 * outputSchema(顶层对象,generateObject 稳定):
 *   { verdict, summary, findings: [{ quote, category, severity, reason, suggestion, ruleRef }] }。
 * prompt 铁律:只审注入文本、逐条给原文引用(quote 必为原文子串防幻觉命中)、区分官方硬规则
 *   与经验建议、复核每一条 lint 线索、suggestion 给最小改写而非重写全文。
 * 注:`script.review` 只是任务/Skill ID；运行时始终解析通用文本模型 `default`。
 */
export const llmFindingSchema = z.object({
  quote: z.string().default(""),
  category: z.string().default(""),
  severity: z.enum(["block", "warn", "info"]).default("warn"),
  reason: z.string().default(""),
  suggestion: z.string().nullable().default(null),
  ruleRef: z.string().nullable().default(null),
});
// 顶层输出契约:一个报告对象(findings 数组包一层;裸数组在部分 provider 不可靠)。
export const scriptReviewSchema = z.object({
  verdict: z.enum(["pass", "risk", "block"]),
  summary: z.string().min(1),
  findings: z.array(llmFindingSchema),
});
export type ScriptReviewOutput = z.infer<typeof scriptReviewSchema>;

/** 与旧审核runner一致的原始完整性门：不让schema默认值补造审核结论。 */
export function isCompleteRawScriptReview(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  return ["pass", "risk", "block"].includes(String(value.verdict))
    && typeof value.summary === "string" && value.summary.trim().length > 0
    && Array.isArray(value.findings);
}

/**
 * 跨 provider 的有界协议修复：只补结构化响应里缺失的描述字段，不改变 verdict、
 * severity 或 finding 数量，也不新增审核事实。部分只支持文本 JSON 的模型会漏掉
 * `category`，这里用同一 finding 已给出的 ruleRef 作标签，否则落中性标签。
 */
export function normalizeScriptReviewOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const report = value as Record<string, unknown>;
  if (!Array.isArray(report.findings)) return value;
  return {
    ...report,
    findings: report.findings.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const finding = raw as Record<string, unknown>;
      const ruleRef =
        typeof finding.ruleRef === "string" && finding.ruleRef.trim()
          ? finding.ruleRef.trim()
          : null;
      return {
        ...finding,
        quote: typeof finding.quote === "string" ? finding.quote : "",
        category:
          typeof finding.category === "string" && finding.category.trim()
            ? finding.category.trim()
            : ruleRef ?? "语义风险",
        severity: ["block", "warn", "info"].includes(String(finding.severity))
          ? finding.severity
          : "warn",
        reason: typeof finding.reason === "string" ? finding.reason : "",
        suggestion:
          typeof finding.suggestion === "string" ? finding.suggestion : null,
        ruleRef,
      };
    }),
  };
}

// 公约 Tier1 条文摘要默认值(可被 overrides 换;来自 douyin-compliance.md 主源)。
const DEFAULT_OFFICIAL_RULES = `- 公约34 恶意导流:结合完整上下文判断是否引导观众站外联系或跳转其他平台；平台名、字符、号码等字面出现本身不构成导流证据。
- 公约33 不当营销:禁无合理依据的断言、夸大功效、诱导性收益承诺。
- 公约35 欺骗误导:禁虚假人设、伪造资质/身份、编造事实。
- 公约25 知识产权:禁盗版/破解/搬运他人作品。
- 隐私条款:禁泄露他人手机号/住址/身份证等个人信息。
- 违禁一票否决:自杀自残诱导、违法违规内容。`;

export const SCRIPT_REVIEW_TEMPLATE: PromptTemplate = {
  id: "script.review",
  version: "v2",
  outputSchema: scriptReviewSchema,
  tools: [],
  system: "你是抖音平台的「合规审核编导」,帮创作者在发布前发现限流/自见/删除风险。",
  template: `你是抖音平台的「合规审核编导」。你的职责:审核下面这份**待发布文案**,发现平台合规风险,给出可撤销的改写建议,**绝不替创作者改稿**——只产报告。

【创作者定位(判语境:是否带货/医疗金融资质红线)】
{{positioning}}

【官方硬规则(判 block/warn 依据)】
{{officialRules}}

【违禁词表与配置规则(照表复核完整语义；保留创作者明确配置的规则说明与适用范围)】
{{lexicon}}

【L1 字面匹配线索(只证明字符串出现，不是已确认违规；必须结合完整原文逐条复核)】
{{lintFindings}}

【待审文案(只审这段文本,逐字比对)】
{{script}}

【任务】像专业审核那样逐条复核字面线索并排查全文语义风险:擦边/性暗示、虚假夸大/无依据断言、人设造假/伪造资质、标题党诱导语气、隐私泄露、明确或暗示的站外导流、医疗金融等资质红线。**硬性要求(违反即算错):**
① 每条 finding 的 quote **必须是上面文案的原文子串**(逐字照抄命中片段),严禁编造原文不存在的句子;
② severity:block(明确违禁,发出去大概率删/封)/ warn(风险,建议改)/ info(提示,可不改);
③ reason 说明踩了哪条规则/为什么有风险;ruleRef 尽量给公约小节号(如「公约34」),无对应留 null;
④ suggestion 给**最小改写**(只改命中片段,不重写全文),无更优改法留 null;
⑤ L1 命中、tier 标签和命中数量都不能直接推出风险或阻断。逐条结合完整语境复核：确认存在风险的命中必须写入 findings 并说明证据；无风险的字面命中不写入 findings。复核词表漏掉的谐音/变体/拆字/同义表达和词表外语义风险，不能只审未命中的部分。保留并执行创作者明确配置的规则及适用范围，不能把词表标签扩大为全局禁止；对含混的规则如实说明待确认，不编造用户禁令;
⑥ 材料无风险就诚实少给或空 findings,绝不为凑数编造。
【verdict 汇总】任一 block → "block";无 block 但有 warn → "risk";全无或仅 info → "pass"。
【输出】只输出一个 JSON 对象 {"verdict","summary"(一句话总体结论,中文),"findings":[...]},不要多余文字、不要代码块包裹。`,
  requiredFacets: ["script"],
};

export { DEFAULT_OFFICIAL_RULES };
