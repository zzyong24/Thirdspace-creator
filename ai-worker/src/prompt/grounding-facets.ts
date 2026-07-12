/**
 * 共享接地 facet 包(T-269 防编造可溯 + T-270 立项 Brief 硬锚)—— 创作生成链「接地根」的单一真值。
 *
 * 病根(见 docs/research/2026-07-12-creative-chain-grounding-audit.md):hook / 论点树 / 整稿 /
 * 补全的**实际生成**都是独立 node 子调用,各拼最小 prompt,外层对话 system 的 brief / 素材 /
 * honesty 一律不继承 → 弱模型编数字(如把「文档被多个 AI 评审」偷换成「22 个 AI 智能体」)、漂移
 * 离 brief、零可溯。修法把三段硬约束抽成本文件的**共享 prompt 段**,thesis/hooks/draft/enrich/
 * generate 统一引入,而非各写一遍(防逐个漏接,审计强烈建议)。
 *
 * 本文件是**纯叶子模块**(零依赖、零 AI SDK import),故:
 *   - ai-worker 各模板(script-draft/planning-thesis/topic-enrich/topic-generate)可静态 import
 *     `ANTI_FABRICATION_CLAUSE` 直接嵌进模板正文(始终在场,不可漏接);
 *   - backend 各 runner / chat-runner 的自由文本子调用(buildHooksPrompt / buildEnrichPrompt /
 *     hooks·enrich 的 runAgentNode system)经 `await import("@creatoros/ai-worker")` 取同一常量,
 *     保证「模板路径」与「对话自由文本路径」用**逐字一致**的可溯约束(单一真值)。
 *
 * 注:立项 Brief 硬锚段(projectBriefHard)的**渲染**在 backend creative-context.renderProjectBriefHard
 * (它读 CreativeContext 的 brief 字段、与 formatUserMaterialBrief 的「必须遵守」范式同源、且不能把
 * AI SDK 拉进 creative-context 的 bundle),此处只承载「anti-fabrication 常量 + 可溯后处理纯函数」。
 * 两处都是各自 reachable 范围内的单一真值,合起来即「共享 facet 包」。
 */

// ── T-269 反编造 · 可溯硬约束段 ─────────────────────────────────────────────────────
// 把对话外层 honesty rule #9(chat-runner「绝不编造具体数字/案例/来源…」)**下沉**进每个生成
// 子调用。措辞对齐 T-269 BACKLOG:具体 claim(数字/命名事实/机构/成绩)必须可溯素材原文,不可溯
// 则不写或标「我的推断」,禁把 A 偷换成 B。所有生成模板 + 自由文本子调用共用这一段。
export const ANTI_FABRICATION_CLAUSE = [
  "【可溯与反编造 —— 必须遵守】",
  "- 你写进内容的每一个**具体数字、命名事实、机构/人物、成绩/结果**,都必须能追溯到上方给你的真实素材/知识库/立项资料原文。",
  "- 追溯不到来源的,要么不写,要么显式标注「(我的推断)」——绝不把它当既定事实写出口。",
  "- 绝不把 A 偷换成 B(如把「文档被多个 AI 评审」写成「22 个 AI 智能体互相盯」);绝不凭空编造论文编号、精确百分比、榜单名、涨粉/变现数字来撑观点或钩子。",
  "- 宁可少写一个数据,也不编一个假数据。",
].join("\n");

/** 把 anti-fabrication 段拼成「换行分隔的追加块」(空安全):调用方直接接到 prompt 末尾。 */
export function antiFabricationBlock(): string {
  return `\n\n${ANTI_FABRICATION_CLAUSE}`;
}

// ── T-269 可溯后处理(参照 T-224 sanitizeModelMemoryCategories 的输出清洗范式)──────────────
// 生成后校验具体 claim(数字/命名)是否命中已注入素材/knowledge/brief;未命中 → 标注「未溯源」。
// 非破坏式(只标注不删除,least-destructive):至少覆盖 hook / thesis(整稿可后续)。纯函数,导出供单测。
//
// 与 T-228 hasPseudoCitation 的关系:那条是「无检索结果时」的伪引用整条剔除(research 素材专用);
// 本文件是「有注入素材时」的相对可溯校验(hook/thesis 专用)——两者同源不同场景,故各自留一份模式
// (grounding-facets 是叶子,不 import research-node 免把 AI SDK 拉进模板)。

/**
 * 高危编造 claim 模式 —— 命中这些的文本片段被视为「具体 claim」,须可溯:
 *  ① 伪精度引用:arXiv 编号 / DOI / 小数点百分比(85.9%)/ 基准成绩(pass@1)/ 常见榜单名;
 *  ② 计数·量级断言:数字 + 计数/量级单位(个/名/家/位/款/种/条/万/亿/倍/人)——「22 个 AI」病灶。
 * **刻意排除**:整数百分比(90%,方向性常识陈述常用,T-228 同款豁免)、时间/时长单位
 * (秒/分/时/天/年/月/周/岁,如「前 3 秒钩子」是创作术语非事实断言)、序数(第 N)。避免过度标注惹用户烦。
 */
export const SPECIFIC_CLAIM_PATTERNS: readonly RegExp[] = [
  /arxiv\s*[:：]?\s*\d{4}\.\d{4,5}/gi, // arXiv 2308.00352
  /\b10\.\d{4,}\/\S+/g, // DOI 10.1234/xxx
  /\d+\.\d+\s*%/g, // 小数点精度百分比(85.9%)= 假精度
  /pass@\d+/gi, // 基准成绩(pass@1)
  /\b(swe-?bench|humaneval|mmlu|gsm8k)\b/gi, // 常见 LLM 榜单/基准名(实录病灶)
  /\d+(?:\.\d+)?\s*(?:个|名|家|位|款|种|条|万|亿|倍|人)/g, // 计数/量级断言(22 个 / 3 倍 / 10 万)
];

/** 空白归一(去掉所有空白)—— claim 与语料都归一后做子串比对,容忍「22 个」vs「22个」等排版差。 */
function normalizeForMatch(s: string): string {
  return (s ?? "").replace(/\s+/g, "");
}

/**
 * 把注入到本次生成的各段 brief(定位/素材/知识库/立项 brief/选题…)拼成「可溯语料」(haystack)。
 * 空段自动跳过。返回归一后的长串,供 isClaimGrounded 做子串命中判定。
 */
export function buildGroundingHaystack(
  ...parts: Array<string | undefined | null>
): string {
  return normalizeForMatch(parts.filter(Boolean).join("\n"));
}

/** 从一段文本里抽出所有「具体 claim」片段(去重,原文形态)。纯函数,导出供单测。 */
export function extractSpecificClaims(text: string): string[] {
  const t = text ?? "";
  const found = new Set<string>();
  for (const re of SPECIFIC_CLAIM_PATTERNS) {
    // 每个 pattern 都带 g flag;逐一 matchAll(clone 免 lastIndex 串扰)。
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const hit = m[0]?.trim();
      if (hit) found.add(hit);
    }
  }
  return Array.from(found);
}

/** 单个 claim 是否可溯(归一后作为子串命中语料)。空 claim/空语料 → 视为不可溯(false)。 */
export function isClaimGrounded(claim: string, haystack: string): boolean {
  const c = normalizeForMatch(claim);
  if (!c) return false;
  return haystack.includes(c);
}

/** 一段文本里所有「不可溯的具体 claim」列表(命中语料的剔除)。纯函数,导出供单测/观测。 */
export function findUngroundedClaims(text: string, haystack: string): string[] {
  return extractSpecificClaims(text).filter(
    (claim) => !isClaimGrounded(claim, haystack),
  );
}

/** 未溯源标注后缀(单条聚合,非逐 claim 内联 —— 非破坏式,只提示用户核实)。 */
export const UNGROUNDED_MARK = " ⚠️(含未溯源数据，请核实出处)";

/**
 * 可溯后处理:文本含≥1 个不可溯的具体 claim → 追加一次「未溯源」标注(非破坏式,不删原文);
 * 否则原样返回。返回 { text, ungrounded } 让调用方可观测剔了哪些(日志/单测)。
 * 幂等:已带 UNGROUNDED_MARK 的文本不重复追加。
 */
export function annotateUngroundedClaims(
  text: string,
  haystack: string,
): { text: string; ungrounded: string[] } {
  const src = text ?? "";
  const ungrounded = findUngroundedClaims(src, haystack);
  if (ungrounded.length === 0 || src.includes(UNGROUNDED_MARK)) {
    return { text: src, ungrounded };
  }
  return { text: `${src}${UNGROUNDED_MARK}`, ungrounded };
}
