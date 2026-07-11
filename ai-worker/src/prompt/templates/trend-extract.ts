import { z } from "zod";
import type { PromptTemplate } from "../template";

// [T-235b] 热点信源信号抽取 skill 模板(trend.extract)—— 通用网页信源主路的「正文 → 结构化
// 信号」一跳(SPEC 2026-07-11 daily-topic-autopilot §2.2)。输入 = readUrl 抽到的信源页正文
// 纯文本(热榜页/垂类社区/搜索结果页),输出 = 结构化信号列表(标题/链接/热度/发布时间)。
//
// 诚实门(T-224 同源,写进 system 硬约束):**页面没有的字段绝不编造**——无热度数字 → heat=null;
//   无链接 → url=null;无时间 → publishedAt=null。宁可 null 不可编。抽不出任何条目 → signals=[]。
//
// 输出契约走 generateObject 绑 Zod(每轮 schema 约束,SPEC §4.2 防发散),跨模型健壮
//   (runStructuredNode 文本兜底)。schema 定义在本包(有 zod 依赖);backend 只引类型。

// 一条信源信号。全字段 nullable/default,模型缺字段也能过校验(跨模型稳);title 空串的条目由
// 消费方过滤(不在 schema 层抛,防一条脏行崩整批)。
export const trendSignalSchema = z.object({
  title: z.string().default(""),
  url: z.string().nullable().default(null),
  // 热度指标(阅读/点赞/热度值等,页面上的原始数字)。**没有就 null,绝不编**。
  heat: z.number().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
});

// 顶层输出契约(顶层对象,非裸数组 —— generateObject 要顶层对象)。
export const trendExtractSchema = z.object({
  signals: z.array(trendSignalSchema).default([]),
});
export type TrendExtractOutput = z.infer<typeof trendExtractSchema>;

export const TREND_EXTRACT_TEMPLATE: PromptTemplate = {
  id: "trend.extract",
  version: "v1",
  // 三位一体「输出 Zod schema」位收口到 registry(SPEC §4.2):runStructuredNode 从 registry 取。
  outputSchema: trendExtractSchema,
  // 纯结构化抽取,不挂工具。
  tools: [],
  system:
    "你是一个「网页信号抽取器」:从一段网页正文纯文本里,抽取出热点条目(热榜条目/文章标题/帖子标题)的结构化列表。" +
    "**硬约束(诚实门):只抽取文本里真实存在的信息,绝不编造。**页面没写热度数字就 heat=null;" +
    "没有链接就 url=null;没有发布时间就 publishedAt=null。宁可字段为 null,不可推测填数。" +
    "导航/广告/页脚/登录提示等噪声不是信号,跳过。抽不出任何条目就返回空列表。",
  // facets:sourceName(信源展示名,帮模型判断页面类型)· pageText(readUrl 抽到的正文,已截断)。
  template: `【信源】{{sourceName}}

【页面正文(纯文本,可能含少量噪声)】
{{pageText}}

【任务】从上面的正文里抽取热点条目列表(热榜条目/文章标题/帖子标题):
- title:条目标题(原文,不改写)。
- url:条目链接;正文里没有明确链接就 null。
- heat:热度指标(阅读量/点赞数/热度值等页面上的**原始数字**,单位「万」要换算成数值,如 12.3万 → 123000);**页面没有热度数字就 null,绝不编造**。
- publishedAt:发布时间(原文格式即可);没有就 null。
- 最多抽 20 条,按页面顺序;导航/广告/页脚不算。

【输出】只输出一个 JSON 对象:
{"signals":[{"title":"…","url":"…或 null","heat":123000 或 null,"publishedAt":"…或 null"}]}`,
  requiredFacets: ["sourceName", "pageText"],
  // 声明式 context:本模板无 reader 依赖(pageText 由信号采集器从 readUrl 结果直接装配)。
  contextRequirements: [],
};
