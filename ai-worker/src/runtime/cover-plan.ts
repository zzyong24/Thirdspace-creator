import {buildGroundingHaystack,annotateUngroundedClaims} from "../prompt/grounding-facets";
import type {CoverBriefOutput} from "../prompt/templates/cover-brief";
export interface CoverContext {
 positioningBrief?:string;projectBriefHard?:string;reviewScript?:string;userMaterialHardBrief?:string;userMaterialRefBrief?:string;knowledgeBrief?:string;topic:{title?:string;angle?:string};orientationHint?:string;
}
// 封面文案长度上限(封面文字压太多会糊;方案层裁一次,防模型超长）。
export const COVER_HEADLINE_MAX = 20; // 主标题(模板要 ≤14,留余量后端硬裁 20)
export const COVER_SUBHEADLINE_MAX = 28; // 副标题(模板 ≤20)
export const COVER_KEYPOINT_MAX = 14; // 单条信息点(模板 ≤10)
export const COVER_KEYPOINTS_MAX = 3; // 信息点条数
export const COVER_VISUAL_REQUIREMENTS_MAX = 240;
/** 封面只需要一个可见主张；收口字段是为了稳定出图，不追逐上游理论最大输入。 */
export const COVER_VISUAL_CONCEPT_MAX = 220;
export const COVER_COMPOSITION_MAX = 100;
export const COVER_PALETTE_MAX = 40;
export const COVER_IMAGE_PROMPT_MAX = 1000;

/** 已裁剪的封面方案(runner 内部形态;导出供单测)。 */
export interface ClampedCoverPlan {
  headline: string;
  subheadline: string;
  keyPoints: string[];
  visualConcept: string;
  composition: string;
  palette: string;
}

function clip(v: string | undefined, max: number): string {
  const s = (v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 把模型吐的封面方案裁到封面可用长度(纯函数,导出供单测)。字段缺省安全(Partial:模型漏字段
 *  也不崩,与 schema `.default("")` 同哲学)。 */
export function clampCoverPlan(obj: Partial<CoverBriefOutput>): ClampedCoverPlan {
  return {
    headline: clip(obj.headline, COVER_HEADLINE_MAX),
    subheadline: clip(obj.subheadline, COVER_SUBHEADLINE_MAX),
    keyPoints: (obj.keyPoints ?? [])
      .map((kp) => clip(kp, COVER_KEYPOINT_MAX))
      .filter((kp) => kp.length > 0)
      .slice(0, COVER_KEYPOINTS_MAX),
    visualConcept: clip(obj.visualConcept, COVER_VISUAL_CONCEPT_MAX),
    composition: clip(obj.composition, COVER_COMPOSITION_MAX),
    palette: clip(obj.palette, COVER_PALETTE_MAX),
  };
}

// 把 CreativeContext 映射成 cover.brief 模板的 facets(占位化上下文块）。硬注入立项 brief 核心信息/
// 内容形式(projectBriefHard)+ 口播稿主张(scriptClaim,复用 context.reviewScript)+ 素材可溯来源。
const SCRIPT_CLAIM_MAX = 800; // 口播稿注入截断(封面只需主张,不需全稿)
export function coverFacets(
  context: CoverContext,
  opts: { userVisualRequirements?: string } = {},
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用封面逻辑设计）",
    // [T-271] 立项硬锚(核心信息=封面必须承载的钦定主张 + 内容形式定调;账号态为空则整段省略）。
    projectBriefHard: context.projectBriefHard
      ? `\n${context.projectBriefHard}`
      : "",
    // [T-271] 口播稿主张(封面要与正片说同一件事;复用 review 的 output_script 读法)。
    scriptClaim: context.reviewScript
      ? `\n【本条口播稿主张（封面必须与之一致，不得自创矛盾主张）】\n${clip(
          context.reviewScript,
          SCRIPT_CLAIM_MAX,
        )}`
      : "",
    // [T-271] 用户第一手素材=封面数字/成绩的可溯来源(硬约束段)。
    userMaterialHard: context.userMaterialHardBrief
      ? `\n${context.userMaterialHardBrief}`
      : "",
    userMaterialRef: context.userMaterialRefBrief
      ? `\n【参考素材（AI 搜集，参考级）】\n${context.userMaterialRefBrief}`
      : "",
    knowledge: context.knowledgeBrief
      ? `\n【知识库（封面文案可作出处依据）】\n${context.knowledgeBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
    userVisualRequirements: opts.userVisualRequirements
      ? `\n【用户明确画面要求（硬约束；只约束画面，不是事实出处）】\n${opts.userVisualRequirements}`
      : "",
  };
}

/**
 * 由结构化封面方案**确定性组装**生图 prompt(非对话模型自由文本 —— T-271 修法核心②)。纯函数,
 * 导出供单测。用 RAW 方案文案(未标注)拼画面;可溯标注只进展示层,不进画面(v1 非破坏,与 planning.
 * thesis 的 annotate-not-strip 同哲学)。orientation 控画幅(横/竖屏)。
 */
export function composeCoverImagePrompt(
  plan: ClampedCoverPlan,
  opts: { orientation?: string; userVisualRequirements?: string } = {},
): string {
  const parts: string[] = [
    "为一条短视频/图文内容设计封面图。视觉任务：让目标观众第一眼看懂这条内容最核心的冲突、关系、变化或后果，而不是只看到一张漂亮背景。",
    "主视觉约束：只保留一个主视觉冲突或关系，用具体主体、动作、环境和空间关系呈现；不要拼贴多个隐喻，不使用发光大脑、AI 粒子、机器人握手、商务人士看电脑等万能 AI 海报元素。",
  ];
  if (plan.visualConcept) parts.push(`主视觉：${plan.visualConcept}`);
  if (plan.composition) parts.push(`构图：${plan.composition}`);
  if (opts.userVisualRequirements) {
    parts.push(
      `用户明确画面要求（硬约束，优先于自动主视觉与构图建议）：${clip(
        opts.userVisualRequirements,
        COVER_VISUAL_REQUIREMENTS_MAX,
      )}`,
    );
  }
  const overlay = [
    plan.headline ? `主标题「${plan.headline}」` : "",
    plan.subheadline ? `副标题「${plan.subheadline}」` : "",
    plan.keyPoints.length ? `信息点：${plan.keyPoints.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("；");
  if (overlay) {
    parts.push(
      `画面上只叠加以下指定中文文案 —— ${overlay}（逐字准确、只出现一次、排版清晰、突出可读）`,
    );
  }
  if (plan.palette) parts.push(`色调风格：${plan.palette}`);
  parts.push(
    opts.orientation === "竖屏"
      ? "竖版短视频封面（9:16）"
      : opts.orientation === "横屏"
        ? "横版封面（16:9）"
        : "短视频封面",
  );
  const outputConstraint =
    "输出约束：除指定封面文案外，不生成任何额外文字、数字、界面、新闻截图或数据图；无水印、无无关 logo。画面必须以主视觉关系为中心，风格和质感只服务理解，不抢主张。";
  parts.push(outputConstraint);
  const prompt = parts.join("\n");
  if (prompt.length <= COVER_IMAGE_PROMPT_MAX) return prompt;
  // 上面所有动态字段都已分别限长；这里是协议最后一道保险。保留末尾输出约束，避免
  // 极端输入裁断“不要额外文字/水印”等安全要求。
  const suffix = `\n${outputConstraint}`;
  return `${prompt.slice(0, COVER_IMAGE_PROMPT_MAX - suffix.length)}${suffix}`;
}


/** 展示文案标注保持原封面语义，原始方案只用于组装图片提示词。 */
export function projectCoverPlan(object:Partial<CoverBriefOutput>,context:CoverContext,visualRequirements=""){
 const plan=clampCoverPlan(object),haystack=buildGroundingHaystack(context.projectBriefHard,context.reviewScript,context.positioningBrief,context.userMaterialHardBrief,context.userMaterialRefBrief,context.knowledgeBrief,context.topic.title,context.topic.angle);
 const claims:string[]=[];
 const annotate=(value:string)=>{const result=annotateUngroundedClaims(value,haystack);claims.push(...result.ungrounded);return result.text;};
 const coverPlan={...plan,headline:annotate(plan.headline),subheadline:annotate(plan.subheadline),keyPoints:plan.keyPoints.map(annotate)};
 return {name:plan.headline.trim()?`${plan.headline.trim().replace(/\s+/g," ").slice(0,16)} · 封面`:"AI 封面",prompt:composeCoverImagePrompt(plan,{orientation:context.orientationHint,userVisualRequirements:visualRequirements}),coverPlan,ungroundedClaims:Array.from(new Set(claims)),...(visualRequirements?{visualRequirements}:{}),...(context.orientationHint==="竖屏"?{aspectRatio:"9:16"}:context.orientationHint==="横屏"?{aspectRatio:"16:9"}:{})};
}
