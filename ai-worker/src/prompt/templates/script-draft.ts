import { z } from "zod";
import type { PromptTemplate } from "../template";

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
  version: "v3",
  // 三位一体「输出 Zod schema」位收口到 registry(SPEC §4.2):runStructuredNode 从 registry 取它
  // 绑 generateObject,模型必须吐 { shots:[...] },校验失败自动重试(防发散 + 根治不可解析)。
  outputSchema: scriptDraftSchema,
  // 纯结构化生成,不挂工具。
  tools: [],
  system: "你是这位创作者的「分镜脚本 agent」,像专业短视频编导那样写可拍的分镜脚本。",
  // [T-081] {{extraBrief}}:对话中获得的补充指令/洞察(选填 facet,调用方拼「本次生成指令」
  // 整块传入;空则占位替换为空串、整段省略)。
  template: `【创作者定位】
{{positioning}}{{learnings}}{{knowledge}}{{topic}}{{orientation}}{{thesis}}{{contract}}{{outline}}{{extraBrief}}

【任务】基于定位(+过往爆款要素)+选题,写一条**分镜脚本**。严格按爆款公式编排:
钩子(前3秒抓人)→痛点(戳中人群)→价值(干货/反差)→卡点(信息密度/节奏)→CTA(行动召唤)。
若上方给了【策划结构方案】/【论点树】/【内容合同】,**必须据此铺分镜**:按结构方案的段落顺序展开、把论点树的核心/支撑/证据写进口播、遵守内容合同的受众定位与价值主张,不要另起一套结构。
【输出】只输出一个 JSON 对象 {"shots": [...]},shots 是分镜数组,每一项:
{"口播"(这一镜要说的话),"画面"(画面/运镜/字幕板提示),"字幕"(屏幕字幕,一句),"时长"(如 "0-3s")}。
第一镜必须是前3秒钩子,最后一镜必须落在 CTA。6-10 镜为宜。`,
  requiredFacets: ["positioning"],
};
