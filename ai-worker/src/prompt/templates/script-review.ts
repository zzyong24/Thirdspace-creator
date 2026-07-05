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
 *   - lintFindings:L1 结果注入(让 L2 不复述已报原词、可交叉确认),空则整段省略。
 *   - officialRules:公约 Tier1 条文摘要(模板内置默认,可被 skill_config_overrides 换)。
 *   - positioning:创作者定位(判「是否带货/医疗金融资质红线」语境),空则省略。
 * outputSchema(顶层对象,generateObject 稳定):
 *   { verdict, summary, findings: [{ quote, category, severity, reason, suggestion, ruleRef }] }。
 * prompt 铁律:只审注入文本、逐条给原文引用(quote 必为原文子串防幻觉命中)、区分官方硬规则
 *   与经验建议、不复述 lint 已报条目、suggestion 给最小改写而非重写全文。
 * 注:resolveModelSpec 按 "script.review" capability 解析模型(预设推荐豆包 Ark;未配回退默认)。
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
  verdict: z.enum(["pass", "risk", "block"]).default("pass"),
  summary: z.string().default(""),
  findings: z.array(llmFindingSchema).default([]),
});
export type ScriptReviewOutput = z.infer<typeof scriptReviewSchema>;

// 公约 Tier1 条文摘要默认值(可被 overrides 换;来自 douyin-compliance.md 主源)。
const DEFAULT_OFFICIAL_RULES = `- 公约34 恶意导流:禁站外联络方式(微信/QQ/手机号/二维码及谐音变体)、禁引导跳转其他平台。
- 公约33 不当营销:禁无合理依据的断言、夸大功效、诱导性收益承诺。
- 公约35 欺骗误导:禁虚假人设、伪造资质/身份、编造事实。
- 公约25 知识产权:禁盗版/破解/搬运他人作品。
- 隐私条款:禁泄露他人手机号/住址/身份证等个人信息。
- 违禁一票否决:自杀自残诱导、违法违规内容。`;

export const SCRIPT_REVIEW_TEMPLATE: PromptTemplate = {
  id: "script.review",
  version: "v1",
  outputSchema: scriptReviewSchema,
  tools: [],
  system: "你是抖音平台的「合规审核编导」,帮创作者在发布前发现限流/自见/删除风险。",
  template: `你是抖音平台的「合规审核编导」。你的职责:审核下面这份**待发布文案**,发现平台合规风险,给出可撤销的改写建议,**绝不替创作者改稿**——只产报告。

【创作者定位(判语境:是否带货/医疗金融资质红线)】
{{positioning}}

【官方硬规则(判 block/warn 依据)】
{{officialRules}}

【违禁词表(创作者配置的确定词表;L1 已按此表精确匹配命中,你在此基础上照表复核 lint 漏掉的谐音/变体/拆字/同义命中)】
{{lexicon}}

【L1 已确定命中(违禁词 lint 精确匹配,已计入报告,勿复述原词)】
{{lintFindings}}

【待审文案(只审这段文本,逐字比对)】
{{script}}

【任务】像专业审核那样逐条排查语义级风险(L1 词表抓不住的):擦边/性暗示、虚假夸大/无依据断言、人设造假/伪造资质、标题党诱导语气、隐私泄露、导流暗示(非明面词)、医疗金融等资质红线。**硬性要求(违反即算错):**
① 每条 finding 的 quote **必须是上面文案的原文子串**(逐字照抄命中片段),严禁编造原文不存在的句子;
② severity:block(明确违禁,发出去大概率删/封)/ warn(风险,建议改)/ info(提示,可不改);
③ reason 说明踩了哪条规则/为什么有风险;ruleRef 尽量给公约小节号(如「公约34」),无对应留 null;
④ suggestion 给**最小改写**(只改命中片段,不重写全文),无更优改法留 null;
⑤ **不要复述 L1 已精确命中的原词**(已由确定性 lint 报出);但要照【违禁词表】补出 lint 精确匹配漏掉的**谐音/变体/拆字/同义**命中,以及词表外的语义级风险;
⑥ 材料无风险就诚实少给或空 findings,绝不为凑数编造。
【verdict 汇总】任一 block → "block";无 block 但有 warn → "risk";全无或仅 info → "pass"。
【输出】只输出一个 JSON 对象 {"verdict","summary"(一句话总体结论,中文),"findings":[...]},不要多余文字、不要代码块包裹。`,
  requiredFacets: ["script"],
};

export { DEFAULT_OFFICIAL_RULES };
