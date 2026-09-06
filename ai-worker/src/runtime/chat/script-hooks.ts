import type { ScriptHooksContext } from "@creatoros/contract/execution-worker";
import { ANTI_FABRICATION_CLAUSE, AUDIENCE_MINDSET_CLAUSE, buildGroundingHaystack, annotateUngroundedClaims } from "../../prompt/grounding-facets";

export const EXTRA_BRIEF_HEADING = "【本次生成指令(来自对话,优先遵循)】";

// [T-081①] script.hooks 的 prompt 拼装 —— 从 generateHooks 内联提出为纯函数(可单测):
// extraBrief 段(空则整段省略)。
// [T-269/T-270] 接地根修复:hook 是**最悬空**的生成环(审计定位「22 个 AI」假钩子源头)。补三样:
//   ① projectBriefHard(立项硬锚,项目态):钩子主张锚定钦定核心信息、别硬塞 brief 明禁的角度;
//   ② userMaterialHard/Ref(用户素材=弹药):钩子有据可溯而非脑补;
//   ③ antiFabrication(可溯硬约束段,单一真值 grounding-facets.ANTI_FABRICATION_CLAUSE):
//      「数据冲击」类钩子的具体数字必须可溯,不可溯则不写——治「凭空造数字撑反共识钩子」。
// 调用方传入已解析的真实素材与约束，纯函数不读取宿主上下文或模型凭证。
export function buildHooksPrompt(input: {
  topic: string;
  direction?: string;
  extraBrief?: string;
  positioningBrief: string;
  projectBriefHard?: string;
  userMaterialHard?: string;
  userMaterialRef?: string;
  antiFabrication?: string;
  /** [T-355] 观众心智预设写法纪律段(单一真值 AUDIENCE_MINDSET_CLAUSE,调用方从 ai-worker 取)。 */
  audienceMindset?: string;
}): string {
  return [
    "为这条短视频内容生成 4 条口播开场 hook 候选(前 3 秒抓注意力的第一句话)。",
    input.topic
      ? `内容主题:《${input.topic}》`
      : "内容主题:见下方创作者定位,选最有张力的切入。",
    input.positioningBrief
      ? `创作者定位:
${input.positioningBrief}`
      : "",
    // [T-270] 立项硬锚(项目态):钩子必须与核心信息一致、遵守内容目标的『避免X』负向约束。
    input.projectBriefHard ? `\n${input.projectBriefHard}` : "",
    // [T-269] 用户素材=可溯弹药:钩子里的事实/数字优先从这里取(有出处才敢写)。
    input.userMaterialHard ? `\n${input.userMaterialHard}` : "",
    input.userMaterialRef
      ? `\n【参考素材(AI 搜集,参考级)】\n${input.userMaterialRef}`
      : "",
    input.direction ? `方向要求:${input.direction}` : "",
    input.extraBrief ? `${EXTRA_BRIEF_HEADING}\n${input.extraBrief}` : "",
    '4 条彼此切角不同(如:反常识断言 / 数据冲击 / 场景代入 / 利益承诺)。每条 ≤40 字,口语化,不要书面腔。选「数据冲击」角度时,数字必须能追溯到上方素材/定位/立项资料原文;追溯不到就不用具体数字,改用可溯的反差或场景。',
    // [T-355] 观众心智预设写法纪律(单一真值 AUDIENCE_MINDSET_CLAUSE):钩子是最贴观众的一句,
    // 归因外置铁律在此最要紧(激将式钩子=高危区)。
    input.audienceMindset ? `\n${input.audienceMindset}` : "",
    // [T-269] 可溯硬约束段(下沉自对话外层 honesty rule #9,单一真值)。
    input.antiFabrication ? `\n${input.antiFabrication}` : "",
    '只输出 JSON 数组,形如 [{"text":"hook 文案","angle":"切角名"}],不要多余文字。',
  ]
    .filter(Boolean)
    .join("\n");
}

// [T-055c] script.hooks 的宽容 JSON 解析:剥围栏 → 找首个 [...] → 逐条收窄。
// 模型输出不合形 → 返回 []（诚实空,前端渲「没生成出来」而非崩)。
export function parseHookItems(
  raw: string,
): Array<{ text: string; angle: string }> {
  const text = raw.replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => {
        const o = it as { text?: unknown; angle?: unknown };
        const t = typeof o.text === "string" ? o.text.trim() : "";
        const a = typeof o.angle === "string" ? o.angle.trim() : "";
        return t ? { text: t, angle: a || "hook" } : null;
      })
      .filter((x): x is { text: string; angle: string } => x !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}


/** 保留既有非破坏式可溯标注；模型输出为空时仍返回空候选。 */
export function finalizeHookItems(raw: string, grounding: Array<string | undefined>): Array<{text: string; angle: string}> {
  const haystack = buildGroundingHaystack(...grounding);
  return parseHookItems(raw).map(item => ({...item, text: annotateUngroundedClaims(item.text, haystack).text}));
}

/** 同一快照同时准备生成提示与可溯标注，主题沿用既有兜底；extraBrief 已由工具层规范化，不能再次 trim。 */
export function prepareScriptHooks(context:ScriptHooksContext,input:{topic?:string;direction?:string;extraBrief?:string}) {
  const topic=input.topic?.trim() || context.selectionTitle || "";
  const prompt=buildHooksPrompt({
    topic,direction:input.direction,extraBrief:input.extraBrief,
    positioningBrief:context.positioningBrief,projectBriefHard:context.projectBriefHard || undefined,
    userMaterialHard:context.userMaterialHardBrief || undefined,userMaterialRef:context.userMaterialRefBrief || undefined,
    antiFabrication:ANTI_FABRICATION_CLAUSE,audienceMindset:AUDIENCE_MINDSET_CLAUSE,
  });
  return {prompt,system:"你是这位创作者的口播编导,专门打磨前 3 秒开场 hook。只输出 JSON,不要多余文字。\n\n"+ANTI_FABRICATION_CLAUSE,
    grounding:[context.positioningBrief,context.projectBriefHard,context.userMaterialHardBrief,context.userMaterialRefBrief,context.knowledgeBrief,topic]};
}
