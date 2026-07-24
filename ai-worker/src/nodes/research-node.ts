import type { LanguageModel } from "ai";
import { runStructuredNode } from "./structured-node";
import {
  RESEARCH_GATHER_TEMPLATE,
  type ResearchMaterialOutput,
} from "../prompt/templates/research-gather";
import type { SearchResult } from "../runtime/search-factory";

// 素材搜集节点(research.gather,跑在 **Vercel AI SDK** 上)。L2「创作向重写」:
// 从「自由文本解析 web-search 输出」改成 **generateObject + outputSchema**(复用 T-005
// 结构化节点范式,见 structured-node + calibration.score)。schema 强约束 = **任何模型
// (MiniMax/Claude)都产可解析输出**,根治旧版「未产出可解析素材」的卡死(用户配 MiniMax-M3
// 默认 capability 时自由文本解不出 → 抛错 → 任务 cancelled)。
//
// 产物从竞品/威胁评估改成**创作向四类**:钩子(hooks)/案例(cases)/数据点(dataPoints)/
// 金句(quotes)。每一类都能直接采纳进知识库、喂进脚本初稿。本节点把四类**摊平成
// MaterialItem[]**(给既有 material_list 采纳→KnowledgeItem 落库路径,契约不破),同时把
// 四类原样回带(categories),供研究工作台分类展示候选。
//
// 工具:本节点现为**纯结构化生成**,不挂 web search(内置 web search 只真 Anthropic 可用,
// 而模型用户可配;项目规则不强依赖某厂商服务端工具)。anthropicWebSearchTools 仍导出(供
// 未来真 Anthropic 路径或 runner 选用),但默认 run 路径不再用它。

export interface MaterialItem {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
  /** [T-084a] 该条素材引用的联网检索真实 URL(cases/dataPoints 有则带;记忆内容为空)。 */
  sourceUrl?: string;
}

/** [T-084a] 素材整体信源打标:web=经联网检索、model_memory=纯模型记忆(未配/检索失败降级)。 */
export type MaterialGrounding = "web" | "model_memory";

/** 四类创作向素材候选(原样回带给 UI 分类展示;由 outputSchema 卡死形状)。 */
export type ResearchCategories = ResearchMaterialOutput;

export interface RunResearchNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context;调用方已兜底,绝不空)。 */
  positioningBrief: string;
  /** 本期选题标题(必需)。 */
  topicTitle: string;
  /** 选题切入角度(选填)。 */
  topicAngle?: string;
  /**
   * [T-084a] 联网检索结果(选填)—— 调用方先 searchWeb(query) 拿真结果,在此注入。
   * 有则格式化成「【联网检索结果(真实,今日抓取)】」块进 prompt facet,模型据它填真实 URL;
   * 无(未配/检索失败降级)则该 facet 为空,模型走纯记忆(整体 grounding=model_memory)。
   */
  searchResults?: SearchResult[];
  /**
   * [T-146d] 用户第一手资料要点 facet(选填)—— 调用方(chat-runner/research-runner)读当前项目
   * high-priority 用户素材要点卡 → 经 formatUserMaterialFacet 装配成块注入。有则综合「贴着资料产」
   * (优先服务于它、补充它、佐证它,而非跑题);无则该 facet 整段省略(纯选题泛搜)。
   */
  userMaterialFacet?: string;
  /** 护栏:校验失败的最大重试次数(默认 2,Vercel SDK 透传)。 */
  maxRetries?: number;
}

export interface RunResearchNodeResult {
  /** 摊平成 MaterialItem[](喂既有 material_list 采纳→KnowledgeItem 路径)。 */
  items: MaterialItem[];
  /** 四类创作向候选(原样,供研究工作台分类展示)。 */
  categories: ResearchCategories;
  /** [T-084a] 整体信源打标(有检索=web,无=model_memory)—— 供 UI 渲黄条/需核实徽标。 */
  grounding: MaterialGrounding;
}

/**
 * [T-084a] 把联网检索结果格式化成 prompt facet 块(「【联网检索结果(真实,今日抓取)】编号+
 * 标题+URL+摘要」)。空数组 → 空串(该 facet 整段省略,不注空噪声)。编号让模型能在 sourceUrl
 * 里带编号回链引用真实信源。
 */
export function formatSearchResultsFacet(results: SearchResult[]): string {
  if (!results || results.length === 0) return "";
  const lines = results.map((r, i) => {
    const parts = [`[${i + 1}] ${r.title || r.url}`, `    URL: ${r.url}`];
    if (r.snippet) parts.push(`    摘要: ${r.snippet}`);
    const meta = [r.siteName, r.publishedAt].filter(Boolean).join(" · ");
    if (meta) parts.push(`    来源: ${meta}`);
    return parts.join("\n");
  });
  return [
    "",
    "【联网检索结果(真实,今日抓取)—— 优先据此产 cases/dataPoints 并回填真实 URL 到 sourceUrl】",
    ...lines,
    "",
  ].join("\n");
}

/**
 * [T-146d] 把用户第一手资料要点(高优先素材要点卡文本)格式化成 prompt facet 块。空/纯空白 → 空串
 * (整段省略,不注空噪声)。综合应**优先服务于它、补充它、佐证它,而非跑题** —— 这是「搜索深度结合
 * 用户素材」的核心:搜/综合贴着 PR/第一手资料产,而非只认选题标题泛搜。
 */
export function formatUserMaterialFacet(materialBrief: string): string {
  const body = (materialBrief ?? "").trim();
  if (!body) return "";
  return [
    "",
    "【创作者第一手资料要点（最高优先）—— 搜集与综合应优先服务于它：补充它、佐证它、为它找证据/案例/数据，而不是跑题到无关方向】",
    body,
    "",
  ].join("\n");
}

/**
 * Anthropic provider 内置 web search 工具集 —— 服务端执行,仅 anthropic 协议族可用。
 * 本节点默认路径(纯结构化生成)不再用它;保留导出供调用方/未来真 Anthropic 路径选用。
 * 需要时调用方在外层自行用 generateText/runAgentNode 注入,不在本结构化路径里挂工具。
 *
 * [T-084a TODO —— 真 Anthropic 增强路(SPEC §1.2 末,兜底增强非主路,本切片留待后续)]
 * SPEC 允许:`isGenuineAnthropic` 且用户未配 web.search 时,可挂回本工具作为兜底增强(两者都配
 * 时独立搜索优先)。**本切片未接线**,原因(诚实标注,非偷懒):
 *   1. 主路(独立搜索 provider bocha/tavily/serpapi 前置注入)已让**任何模型**(含用户默认 MiniMax)
 *      拿到真实信源 —— 增强路只在「真配 Claude 官方端点 + 未配独立搜索」这个窄交集白赚,收益小。
 *   2. 结构化脊梁走 generateObject(无工具循环)。接 anthropic server web_search 需另开 generateText
 *      工具循环 + 复活 fb8d056 的 isGenuineAnthropic 判定(现已随 ffb7951 删除,仓内无残留)——
 *      这正是 SPEC §6/ffb7951 教训要避免的「回自由文本工具循环」风险面。
 *   3. SPEC §1.9 明示:「如果这一条会显著增加复杂度/风险,可标注 TODO 留注释」——即此处。
 * 接线时的落点:在 gatherMaterials(chat-runner)先探测 isGenuineAnthropic(需先在 provider-factory
 * 补该判定)→ 未配 web.search 且真 Anthropic → 走一条 generateText+本工具的增强综合,再回填 items。
 */
export function anthropicWebSearchTools(opts?: { maxUses?: number }): {
  web_search: unknown;
} {
  // 惰性 import 以免本模块默认路径牵连 @ai-sdk/anthropic 的 server-tool 依赖。
  // 仅在调用方显式需要时构造(真 Anthropic 路径)。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { anthropic } = require("@ai-sdk/anthropic") as typeof import("@ai-sdk/anthropic");
  return {
    web_search: anthropic.tools.webSearch_20250305({
      maxUses: opts?.maxUses ?? 6,
    }),
  };
}

const trim = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

// ── [T-228] model_memory 降级模式的「搜索诚实门」────────────────────────────────────
// 实录病例:联网搜素材 16 条只 1 条真 URL,其余是模型记忆编的**精确引用**(arXiv 2308.00352 /
// 85.9% pass@1 / SWE-bench 榜单)标「需核实」凑数 —— 看着像真源,实为编造。双管修法:
//   ① prompt 硬约束(groundingNote facet,见下 MODEL_MEMORY_GROUNDING_NOTE);
//   ② 输出后处理清洗(sanitizeModelMemoryCategories):兜住不听话的模型 —— 带伪引用模式的
//      条目整条剔除;来源字段强制归一(不许留看似真实的出处),sourceUrl 强制清空。
// 只作用于 grounding=model_memory(无真实检索结果);真实检索路径(web)不动。

/** [T-228] 伪引用模式 —— model_memory 模式下带这些「假精度引用」的条目整条剔除:
 *  论文编号(arXiv xxxx.xxxxx)/ DOI / 小数点精度百分比(85.9%)/ 基准成绩(pass@1)/
 *  常见 LLM 榜单名(SWE-bench/HumanEval/MMLU/GSM8K,实录病灶)。整数百分比(90%)不算
 *  伪精度(方向性常识陈述常用),不剔。 */
export const PSEUDO_CITATION_PATTERNS: readonly RegExp[] = [
  /arxiv\s*[:：]?\s*\d{4}\.\d{4,5}/i, // arXiv 2308.00352
  /\b10\.\d{4,}\/\S+/, // DOI 10.1234/xxx
  /\bdoi\s*[:：]/i,
  /\d+\.\d+\s*%/, // 小数点精度百分比(85.9%)= 假精度
  /pass@\d+/i, // 基准成绩(pass@1)
  /\b(swe-?bench|humaneval|mmlu|gsm8k)\b/i, // 常见 LLM 榜单/基准名(实录病灶)
];

/** [T-228] 一段文本是否含伪引用(假精度引用)。纯函数,导出供单测。 */
export function hasPseudoCitation(text: string): boolean {
  const t = text ?? "";
  return PSEUDO_CITATION_PATTERNS.some((re) => re.test(t));
}

/** [T-228] model_memory 模式的来源归一标签(不许留看似真实的机构/报告/论文出处)。 */
export const MODEL_MEMORY_SOURCE_LABEL = "模型记忆,需核实";

/**
 * [T-228] model_memory 模式输出清洗(纯函数,导出供单测):
 *   - 四类中任何字段含伪引用模式的条目 → 整条剔除(dropped 计数,调用方可观测);
 *   - cases/dataPoints 的 sourceUrl 强制清空(无检索结果不可能有真 URL);
 *   - cases/dataPoints 的 source 强制归一为「模型记忆,需核实」(不留看似真实的出处)。
 */
export function sanitizeModelMemoryCategories(cats: ResearchCategories): {
  categories: ResearchCategories;
  dropped: number;
} {
  let dropped = 0;
  const keep = (texts: Array<string | undefined>): boolean => {
    const bad = texts.some((t) => hasPseudoCitation(t ?? ""));
    if (bad) dropped += 1;
    return !bad;
  };
  const categories: ResearchCategories = {
    hooks: (cats.hooks ?? []).filter((h) => keep([h.text, h.why])),
    cases: (cats.cases ?? [])
      .filter((c) => keep([c.title, c.source, c.opening]))
      .map((c) => ({ ...c, source: MODEL_MEMORY_SOURCE_LABEL, sourceUrl: "" })),
    dataPoints: (cats.dataPoints ?? [])
      .filter((d) => keep([d.stat, d.source]))
      .map((d) => ({ ...d, source: MODEL_MEMORY_SOURCE_LABEL, sourceUrl: "" })),
    quotes: (cats.quotes ?? []).filter((q) => keep([q.line])),
  };
  return { categories, dropped };
}

/** [T-228] 降级模式硬约束块(groundingNote facet)—— 只在 grounding=model_memory 注入。 */
export const MODEL_MEMORY_GROUNDING_NOTE = [
  "",
  "【降级模式 —— 本次没有联网检索结果,你只能依靠模型记忆。以下为硬约束】",
  "- **绝不编造任何具体引用**:不许出现论文编号(如 arXiv 2308.00352)、精确百分比(如 85.9%)、基准/榜单成绩(如 pass@1、SWE-bench 排名)、机构报告名等看似精确的出处。",
  "- 没有真实来源时只给**方向性**素材(思路/角度/通识),source 一律写「模型记忆,需核实」,sourceUrl 一律留空。",
  "- 拿不准的数据宁可不给 —— 宁缺毋滥;带假精度引用的条目会被系统整条剔除。",
  "",
].join("\n");

/**
 * 把四类创作向候选摊平成 MaterialItem[](喂既有 material_list 采纳→KnowledgeItem 路径)。
 * 每条 title 带分类前缀(钩子/案例/数据/金句)→ 知识库里一眼看出是哪类素材;why_relevant
 * 承载该类的"怎么用"(钩子的 why / 案例的 opening / 数据·金句无说明则空)。来源/链接如实带。
 */
export function flattenCategories(cats: ResearchCategories): MaterialItem[] {
  const items: MaterialItem[] = [];
  for (const h of cats.hooks ?? []) {
    const text = trim(h.text);
    if (!text) continue;
    items.push({ title: `钩子：${text}`, url: "", source: "", why_relevant: trim(h.why) });
  }
  for (const c of cats.cases ?? []) {
    const title = trim(c.title);
    if (!title) continue;
    const sourceUrl = trim(c.sourceUrl);
    items.push({
      title: `案例：${title}`,
      // [T-084a] url 位镜像 sourceUrl(既有 material_list 落库路径以 url 存证来源)。
      url: sourceUrl,
      source: trim(c.source),
      why_relevant: trim(c.opening),
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
  for (const d of cats.dataPoints ?? []) {
    const stat = trim(d.stat);
    if (!stat) continue;
    const sourceUrl = trim(d.sourceUrl);
    items.push({
      title: `数据：${stat}`,
      url: sourceUrl,
      source: trim(d.source),
      why_relevant: "",
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
  for (const q of cats.quotes ?? []) {
    const line = trim(q.line);
    if (!line) continue;
    items.push({ title: `金句：${line}`, url: "", source: "", why_relevant: "" });
  }
  return items;
}

/**
 * 跑一次素材搜集节点 —— Vercel AI SDK + 外置 research.gather 模板 + generateObject(绑四类
 * outputSchema,每轮 schema 约束、校验失败自动重试)。产四类创作向候选 → 摊平成 MaterialItem[]。
 * 四类全空(模型啥也没产)→ 抛错(不假成功,调用方接住转终态)。
 */
export async function runResearchNode(
  input: RunResearchNodeInput,
): Promise<RunResearchNodeResult> {
  const searchResults = input.searchResults ?? [];
  const grounding: MaterialGrounding =
    searchResults.length > 0 ? "web" : "model_memory";
  let object: ResearchCategories;
  try {
    ({ object } = await runStructuredNode<ResearchCategories>({
      model: input.model,
      template: RESEARCH_GATHER_TEMPLATE,
      facets: {
      positioning:
        input.positioningBrief ||
        "（创作者尚未设置定位——按选题本身的价值判断相关性即可）",
      topic: input.topicTitle,
      angle: input.topicAngle ? `\n切入角度：${input.topicAngle}` : "",
      // [T-084a] 联网检索结果块(空 → 整段省略,模型走纯记忆)。
      searchResults: formatSearchResultsFacet(searchResults),
      // [T-146d] 用户第一手资料要点块(空 → 整段省略;有则综合贴着资料产,非泛搜)。
      userMaterial: input.userMaterialFacet ?? "",
      // [T-228] 降级模式硬约束块(只在无检索结果时注入;有检索 → 整段省略)。
      groundingNote:
        grounding === "model_memory" ? MODEL_MEMORY_GROUNDING_NOTE : "",
      },
      maxRetries: input.maxRetries,
    }));
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("结构化节点:")
    ) {
      throw new Error(
        "research-node: agent 未产出可解析素材（结构校验与重试均失败）",
        { cause: err },
      );
    }
    throw err;
  }
  // [T-228] model_memory 后处理清洗:剔伪引用条目 + 强制清 sourceUrl / 归一 source。
  // prompt 硬约束是第一道,这里兜住不听话的模型(实录:MiniMax 记忆编 arXiv/85.9% 标需核实)。
  let categories = object;
  if (grounding === "model_memory") {
    const { categories: cleaned, dropped } =
      sanitizeModelMemoryCategories(object);
    categories = cleaned;
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[research-node] model_memory 降级:剔除 ${dropped} 条带伪引用(论文编号/精确百分比/榜单成绩)的编造素材`,
      );
    }
  }
  const items = flattenCategories(categories);
  if (items.length === 0) {
    throw new Error(
      grounding === "model_memory" && flattenCategories(object).length > 0
        ? "research-node: 降级模式(模型记忆)产出全部为编造引用,已整批剔除 —— 建议配置联网搜索(设置→模型→联网搜索)后重试"
        : "research-node: agent 未产出可解析素材",
    );
  }
  return { items, categories, grounding };
}
