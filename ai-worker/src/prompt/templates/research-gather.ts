import { z } from "zod";
import type { PromptTemplate } from "../template";

// 素材搜集 skill 模板(research.gather)—— L2 研究阶段「创作向重写」。
//
// 旧版是唯一**带工具**的自由文本节点:让模型在多步循环里调 provider 内置 web search,
// 最后吐一段自由文本 JSON 数组,由 parseMaterials 宽容解析。问题:自由文本解析是为 Claude
// web-search 输出设计的,用户配的 MiniMax-M3(默认 capability)产不出可解析数组 → 抛
// 「未产出可解析素材」→ 任务 cancelled(「帮我搜素材」卡死/失败的根因)。
//
// 正解(本任务):换 **generateObject + outputSchema**(复用 T-005 结构化节点范式,见
// structured-node + calibration.score)。schema 强约束 = **任何模型(MiniMax/Claude)都产
// 可解析输出**,根治「未产出可解析素材」。产物从"竞品分析/威胁评估"改成**创作向四类候选**:
//   钩子(hooks)/案例(cases)/数据点(dataPoints)/金句(quotes)
// 每一类都能直接采纳进知识库、喂进脚本初稿(script.draft 的研究钩子位)。
//
// 工具:本 skill 现在是**纯结构化生成**(不挂 web search 工具)—— 因为内置 web search 只在
// 真 Anthropic 端点可用,而模型用户可配(项目规则:不强依赖某厂商服务端工具)。模型用自身
// 知识 + 创作者定位产钩子/案例/数据点/金句;来源(source)如实标注(模型已知的可信出处,
// 不编造 URL —— url 选填,拿不准就留空)。
//
// facets(由调用方按 CreativeContext 装配):
//   positioning(必需,调用方已兜底)· topic(必需,选题标题)· angle(切入角度,选填)

// 创作向四类素材候选 schema(每轮 schema 约束脊梁,SPEC §4.2)—— research.gather 节点用
// generateObject 绑它,模型必须吐这个形状,校验失败 Vercel SDK 自动重试。定义在 ai-worker
// (本包有 zod 依赖);frontend runner 从 @creatoros/ai-worker 引它,无需直引 zod。
//
// 四类语义:
//   hooks      开场钩子 —— 能在前 3 秒抓住注意力的开头(反直觉/悬念/痛点/数字),text=钩子原句,why=为何抓人
//   cases      可讲的案例 —— 真实/经典案例,title=案例名,source=出处(可信来源,不编 URL),opening=怎么在视频里起这个案例,sourceUrl=检索来源真实 URL(选填,来自联网结果)
//   dataPoints 数据点 —— 能当论据的统计/事实,stat=具体数字+陈述,source=出处(没把握的来源标"需核实"),sourceUrl=检索来源真实 URL(选填,来自联网结果)
//   quotes     金句 —— 可引用的有力句子(名人名言/行业共识/犀利观点),line=金句原文
//
// [T-084a] sourceUrl 选填字段:有联网检索结果时,cases/dataPoints 引用了检索结果的,把该结果的
// 真实 URL 填进 sourceUrl(带编号回链的真信源);检索结果之外的内容留空,前端渲「需核实」徽标。
// hooks/quotes 不加 sourceUrl(钩子/金句是创作句式,非事实断言,不强制信源)。
export const researchMaterialSchema = z.object({
  hooks: z
    .array(
      z.object({
        text: z.string(),
        why: z.string(),
      }),
    )
    .default([]),
  cases: z
    .array(
      z.object({
        title: z.string(),
        source: z.string().default(""),
        opening: z.string().default(""),
        sourceUrl: z.string().default(""),
      }),
    )
    .default([]),
  dataPoints: z
    .array(
      z.object({
        stat: z.string(),
        source: z.string().default(""),
        sourceUrl: z.string().default(""),
      }),
    )
    .default([]),
  quotes: z
    .array(
      z.object({
        line: z.string(),
      }),
    )
    .default([]),
});
export type ResearchMaterialOutput = z.infer<typeof researchMaterialSchema>;

export const RESEARCH_GATHER_TEMPLATE: PromptTemplate = {
  id: "research.gather",
  // [T-228] v5:新增选填 facet groundingNote(降级模式硬约束块)—— 无联网检索结果(grounding=
  // model_memory)时由 research-node 注入,硬禁「编造具体引用」(论文编号/精确百分比/榜单成绩/
  // 机构报告名);配合节点后处理清洗(sanitizeModelMemoryCategories)prompt+清洗双管。
  // [T-146d] v4:新增选填 facet userMaterial(创作者第一手资料要点块)—— 综合优先服务于/佐证它。
  // [T-084a] v3:新增选填 facet searchResults(联网检索结果块)+ sourceUrl 信源铁律。
  // 检索走**节点前置注入**(调用方先 searchWeb 拿真结果 → 注 searchResults facet → 本模板综合),
  // 不回自由文本工具循环(保住任何模型都产可解析输出;ffb7951 教训)。
  version: "v5",
  // 三位一体「输出 Zod schema」位收口到 registry(SPEC §4.2):runStructuredNode 从 registry
  // 取它绑 generateObject,模型必须吐四类候选,校验失败自动重试(防发散 + 根治不可解析)。
  outputSchema: researchMaterialSchema,
  // 工具白名单:本 skill 为纯结构化生成,不挂工具(检索是节点前置步骤,结果经 searchResults facet
  // 注入,非模型自调工具;内置 web search 只真 Anthropic 可用作增强,模型可配)。
  tools: [],
  system:
    "你是这位创作者的「素材搜集编导」。你像专业自媒体编导那样,围绕一个选题为创作者备料——产出能直接用进短视频脚本的「钩子 / 案例 / 数据点 / 金句」。你只产对**创作**有用、与创作者**定位对齐**的素材,不做竞品分析、不做威胁评估、不输出与拍片无关的内容。",
  template: `【创作者定位】
{{positioning}}

【选题】{{topic}}{{angle}}
{{userMaterial}}{{searchResults}}{{groundingNote}}
【任务】围绕这个选题,为创作者备好能直接写进脚本的素材。分四类产出:
1. hooks（开场钩子）：能在前 3 秒抓住注意力的开头句(反直觉 / 悬念 / 痛点 / 具体数字)。每条给 text(钩子原句)+ why(为什么抓人)。
2. cases（可讲的案例）：真实或经典的案例,讲出来有说服力。每条给 title(案例名)+ source(可信出处,如机构/报告/人物)+ opening(在视频里怎么起这个案例)+ sourceUrl(见下方信源铁律)。
3. dataPoints（数据点）：能当论据的统计或事实。每条给 stat(具体数字 + 一句陈述)+ source(出处)+ sourceUrl(见下方信源铁律)。
4. quotes（金句）：可直接引用的有力句子(行业共识 / 犀利观点 / 名人名言)。每条给 line(金句原文)。

【信源铁律 —— 必须遵守】
- 有【联网检索结果】时:cases / dataPoints 只要引用了某条检索结果,就把该结果的**真实 URL** 填进 sourceUrl(带编号回链,如引用第 3 条就填第 3 条的 URL),source 写该结果的站点名/标题。**这些是今日真抓取的真实信源,优先用它们**。
- 检索结果**之外**的内容(靠你自身记忆产的):sourceUrl 一律留空,source 标注"模型记忆,需核实"。**绝不把记忆内容假冒成检索结果、绝不编造 URL**。
- 没有【联网检索结果】时(未配联网检索):所有 cases/dataPoints 的 sourceUrl 都留空,source 一律写"模型记忆,需核实"(不许填看似真实的机构/报告/论文出处);**绝不编造具体引用**——不许出现论文编号(如 arXiv 2308.00352)、精确百分比(如 85.9%)、基准/榜单成绩(如 pass@1、SWE-bench 排名)、机构报告名这类看似精确的引用;拿不准的数据宁可不给,只给方向性素材。**别编 URL、别假装搜过网**。

【相关性铁律】① 跟选题强相关 ② 跟创作者定位对齐(支撑信任/转化,不是纯流量噱头) ③ 真实可信——**宁缺毋滥,绝不编造数据或来源**;某一类实在没有好素材就给空数组,不要硬凑。
【数量】四类合计 8-14 条,质量优先。

只输出符合约定结构的 JSON。`,
  requiredFacets: ["positioning", "topic"],
};
