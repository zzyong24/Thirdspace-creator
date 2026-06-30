import type { LanguageModel } from "ai";
import { runStructuredNode } from "./structured-node";
import {
  RESEARCH_GATHER_TEMPLATE,
  type ResearchMaterialOutput,
} from "../prompt/templates/research-gather";

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
}

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
  /** 护栏:校验失败的最大重试次数(默认 2,Vercel SDK 透传)。 */
  maxRetries?: number;
}

export interface RunResearchNodeResult {
  /** 摊平成 MaterialItem[](喂既有 material_list 采纳→KnowledgeItem 路径)。 */
  items: MaterialItem[];
  /** 四类创作向候选(原样,供研究工作台分类展示)。 */
  categories: ResearchCategories;
}

/**
 * Anthropic provider 内置 web search 工具集 —— 服务端执行,仅 anthropic 协议族可用。
 * 本节点默认路径(纯结构化生成)不再用它;保留导出供调用方/未来真 Anthropic 路径选用。
 * 需要时调用方在外层自行用 generateText/runAgentNode 注入,不在本结构化路径里挂工具。
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
    items.push({
      title: `案例：${title}`,
      url: "",
      source: trim(c.source),
      why_relevant: trim(c.opening),
    });
  }
  for (const d of cats.dataPoints ?? []) {
    const stat = trim(d.stat);
    if (!stat) continue;
    items.push({ title: `数据：${stat}`, url: "", source: trim(d.source), why_relevant: "" });
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
  const { object } = await runStructuredNode<ResearchCategories>({
    model: input.model,
    template: RESEARCH_GATHER_TEMPLATE,
    facets: {
      positioning:
        input.positioningBrief ||
        "（创作者尚未设置定位——按选题本身的价值判断相关性即可）",
      topic: input.topicTitle,
      angle: input.topicAngle ? `\n切入角度：${input.topicAngle}` : "",
    },
    maxRetries: input.maxRetries,
  });
  const items = flattenCategories(object);
  if (items.length === 0) {
    throw new Error("research-node: agent 未产出可解析素材");
  }
  return { items, categories: object };
}
