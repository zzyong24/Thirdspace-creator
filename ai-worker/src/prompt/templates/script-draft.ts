import { z } from "zod";
import type { PromptTemplate } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";

/**
 * 写文案/分镜脚本 skill 模板(script.draft)—— 用户的旗舰例子:写文案 = 模板 ⊕ {定位,风格,knowledge,横竖屏,策划产物}。
 * 绑爆款公式 钩子→痛点→价值→卡点→CTA。facets 由调用方按 CreativeContext 装配:
 *   positioning(必需,已兜底)· learnings(过往爆款要素,选填)· knowledge(知识库参考,T-062b gate-F3,选填)· topic(本期选题,选填)· orientation(横/竖屏,选填)
 *   thesis(策划论点树,选填,SEAM-01)· contract(内容合同,选填,SEAM-01)· outline(策划结构方案,选填,SEAM-01)
 * SEAM-01:有 策划产物(论点树/合同/结构方案)时,脚本必须铺它们的结构与论点,不再自己重造蓝图。
 * 换写作方法论 = 换本模板,不动 runner。
 *
 * T-023 跨模型健壮性:输出契约从「自由文本 JSON 数组 + parseShots 宽容解析」升成
 * **generateObject 绑 outputSchema**(复用 research.gather / calibration.score 的结构化节点范式)。
 * 旧路径靠模型吐规整数组,MiniMax-M3(用户默认 capability)常吐不出可解析数组 → 抛「未产出可
 * 解析分镜」→ 任务 cancelled(AI 初稿出不来的根因)。schema 强约束 + runStructuredNode 的文本兜底
 * = 任何模型都产可解析分镜。**顶层是对象**(shots 数组包一层)—— generateObject 要顶层对象,
 * 裸数组在部分 provider 不可靠。四字段各 `.default("")` 让模型偶尔缺字段也能过校验(缺则空串)。
 */

// 一个分镜 = 爆款公式的一拍。四字段独立(口播/画面/字幕/时长),配合 CollabField 逐字段可改。
export const scriptShotSchema = z.object({
  口播: z.string().default(""),
  画面: z.string().default(""),
  字幕: z.string().default(""),
  时长: z.string().default(""),
});
// 顶层输出契约:一个 shots 数组(顶层对象,非裸数组)。
export const scriptDraftSchema = z.object({
  shots: z.array(scriptShotSchema).default([]),
});
export type ScriptDraftOutput = z.infer<typeof scriptDraftSchema>;

export const SCRIPT_DRAFT_TEMPLATE: PromptTemplate = {
  id: "script.draft",
  version: "v4",
  // 三位一体「输出 Zod schema」位收口到 registry(SPEC §4.2):runStructuredNode 从 registry 取它
  // 绑 generateObject,模型必须吐 { shots:[...] },校验失败自动重试(防发散 + 根治不可解析)。
  outputSchema: scriptDraftSchema,
  // 纯结构化生成,不挂工具。
  tools: [],
  system: "你是这位创作者的「分镜脚本 agent」,像专业短视频编导那样写可拍的分镜脚本。",
  // [T-081] {{extraBrief}}:对话中获得的补充指令/洞察(选填 facet,调用方拼「本次生成指令」
  // 整块传入;空则占位替换为空串、整段省略)。
  // [T-146c] {{userMaterialHard}}:用户第一手资料的「最高优先 · 必须遵守」硬约束段(高优先素材
  //   的要点卡/全文,调用方装配含头);{{userMaterialRef}}:AI 找的参考素材(normal 优先,参考级
  //   非硬约束)。两者均选填,空则整段省略。硬约束段放在 positioning 之后、任务之前,让模型先读到
  //   「事实地基」。
  // [T-270] {{projectBriefHard}}:项目立项 Brief 硬锚段(核心信息=钦定主张不得自创矛盾 / 内容目标
  //   含『避免X』负向约束 / 内容形式定调 / 目标观众锁定),仅项目态注入(creative-context
  //   renderProjectBriefHard 装配含头);紧接定位、位于最前,让模型先读到「本条立项的钦定前提」。
  // [T-269] 模板正文尾部嵌 ANTI_FABRICATION_CLAUSE(可溯硬约束段,单一真值 grounding-facets)——
  //   把对话外层 honesty rule #9 下沉进写稿子调用,弱模型也不敢编数字/偷换事实。
  template: `【创作者定位】
{{positioning}}{{projectBriefHard}}{{learnings}}{{knowledge}}{{userMaterialHard}}{{userMaterialRef}}{{topic}}{{orientation}}{{thesis}}{{contract}}{{outline}}{{extraBrief}}

【任务】基于定位(+立项硬约束+过往爆款要素)+选题+**用户第一手资料**,写一条**分镜脚本**。

这条脚本要像一个**讲得通的故事**,不是金句拼盘。以下叙事纪律是硬约束(违反=废稿,比公式更优先):
1. **真实场景开场,不要抽象结论**:第一镜落在一个**具体的、可代入的触发瞬间/场景**(取自素材或选题里的真实细节),让观众"这说的就是我"。禁止用「很多人都…」「在这个时代…」「随着 X 的发展…」这类泛泛空话开场。
2. **前因后果链,一步都不跳**:每一镜都要从上一镜**顺下来**——先有场景/痛点(前因),再有"为什么难/为什么现有做法不行"(冲突),才有你的解法/观点(后果)。观众在任何一镜都不该冒出"这怎么突然冒出来的"。
3. **概念首次出现即解释**:任何专有名词、自造概念、工具名(如「脚手架」),**第一次出现的那一镜就用一句大白话讲清「它是什么、跟眼前这个问题什么关系」**,不许假设观众已经懂。讲不清、跟主线接不上的概念,宁可不用。
4. **用真实细节,不足不编**:场景、例子、数据优先取自【用户第一手资料】;资料没覆盖的地方,**宁可讲得朴素、具体、少一点,也不要编抽象大词/假数据充数**——编出来的东西观众一眼看穿"像编的"。素材空时,先把选题本身的真实情境讲透,不要拿泛泛套话凑镜数。

在满足以上叙事纪律的前提下,用爆款公式收口节奏:钩子(前3秒的真实场景/反差)→痛点(具象化,不空喊)→价值(你的解法/干货,概念已讲清)→卡点(信息密度/节奏)→CTA(具体行动)。
若上方给了【本条内容立项硬约束】,**整条脚本的主张必须与其核心信息一致、不得自创与之矛盾的论点,内容目标里的『避免/不要…』是负向硬约束**。
若上方给了【策划结构方案】/【论点树】/【内容合同】,**必须据此铺分镜**:按结构方案的段落顺序展开、把论点树的核心/支撑/证据写进口播、遵守内容合同的受众定位与价值主张,不要另起一套结构。
${ANTI_FABRICATION_CLAUSE}
【输出】只输出一个 JSON 对象 {"shots": [...]},shots 是分镜数组,每一项:
{"口播"(这一镜要说的话),"画面"(画面/运镜/字幕板提示),"字幕"(屏幕字幕,一句),"时长"(如 "0-3s")}。
第一镜必须是前3秒钩子,最后一镜必须落在 CTA。6-10 镜为宜。`,
  requiredFacets: ["positioning"],
  // [T-184] 声明式 context 注入 —— 本模板要装配层注入的 context 源 reader(key = 组合根 ContextDeps
  // 字段名)。逐项对应旧组合根 runScriptDraft dispatch 手列的那批 facet reader(见 persistence-client
  // 的 script.draft 分支):positioning(定位,必需已兜底)· learnings(过往爆款要素)· knowledge
  // (知识库沉淀,T-182a 曾漏接的根因源)· thesis/contract/outline(SEAM-01 策划产物)· artifactOrigin
  // (F2 origin 标注「未经确认」)· projectMaterials(T-146c 用户第一手素材主权)· brief(立项画幅)。
  // 装配层 resolveContextDeps 据此从中央 registry 自动取 reader,取代手列(漏接即 facet 恒空)。
  // 注:ai / resolveModelSpec 是非 facet 基础设施,由组合根 always-注入,不进本声明。
  contextRequirements: [
    "positioning",
    "learnings",
    "knowledge",
    "thesis",
    "contract",
    "outline",
    "artifactOrigin",
    "projectMaterials",
    "brief",
  ],
};
