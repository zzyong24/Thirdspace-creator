import { z } from "zod";
import type { PromptTemplate } from "../template";

// [T-235d] 正向归因回流 skill 模板(topic.attribution)—— 复盘→出题闭环的归因侧
// (SPEC 2026-07-11 daily-topic-autopilot §2.4)。输入一条**已发布作品**的真材料
// (标题/表现分层/真实指标/真逐字稿)→ 输出**选题维度**的枚举化归因结论 + 下一轮实验选题。
//
// 与 learnings(脚本级经验)的边界([gate-F1]):本 skill 产的是**选题验证资产**
// (topic_type/hook_type/structure_formula 可聚合枚举),消费方=选题池/选题验证库/实验候选;
// 不写 learnings 表、不由复盘触发(由发布实绩触发)。
//
// 诚实门(T-224 同源,写进 system 硬约束):归因**必须基于真逐字稿**——
//   - why_it_worked / why_it_failed / reusable_formula 必须引用逐字稿原文片段佐证(「」引起来);
//   - 逐字稿/数据里没有依据的结论**留空**,绝不编;
//   - 表现分层(爆款/常规/低表现)由程序按本账号基线算好注入,模型不重算、不看数字编故事。
//
// 输出契约走 generateObject 绑 Zod(每轮 schema 约束,SPEC §4.2 防发散),跨模型健壮
// (runStructuredNode 文本兜底)。schema 定义在本包(有 zod 依赖);backend runner 只引类型。

// [gate-F3] 归因枚举值(SPEC 内列全)。选题类型/Hook 类型/结构公式 —— 枚举化才可聚合
// (「哪类选题在我账号被验证过」的统计基础)。
export const TOPIC_ATTRIBUTION_TOPIC_TYPES = [
  "教程",
  "观点",
  "案例拆解",
  "工具测评",
  "热点跟进",
  "故事",
] as const;
export const TOPIC_ATTRIBUTION_HOOK_TYPES = [
  "反差",
  "具体数字",
  "痛点直击",
  "悬念",
  "利益承诺",
  "身份共鸣",
] as const;
export const TOPIC_ATTRIBUTION_STRUCTURE_FORMULAS = [
  "痛点-方案-证明-CTA",
  "三步教程",
  "对比实验",
  "叙事-转折-干货",
  "清单式",
] as const;

// 一条「下一轮实验」候选(runner 转化进选题池,≤3/run 防灌库,title 前缀「实验|」)。
export const topicAttributionExperimentSchema = z.object({
  title: z.string().default(""),
  angle: z.string().default(""),
});

// 顶层输出契约(顶层对象,非裸数组 —— generateObject 要顶层对象)。
// 枚举字段不给 default:枚举是本 skill 的**核心资产**,缺失/非法 → 校验失败 →
// runStructuredNode 重试(默认值会把「模型没判」伪装成「判了某类」,违反诚实门)。
// 受限自由文本字段 `.default("")`:无据留空是合法输出(诚实),缺字段也过校验(跨模型稳)。
export const topicAttributionSchema = z.object({
  topic_type: z.enum(TOPIC_ATTRIBUTION_TOPIC_TYPES),
  hook_type: z.enum(TOPIC_ATTRIBUTION_HOOK_TYPES),
  structure_formula: z.enum(TOPIC_ATTRIBUTION_STRUCTURE_FORMULAS),
  // 为什么表现好/差 —— 须引用逐字稿原文片段佐证;无据留空(诚实门)。
  why_it_worked: z.string().default(""),
  why_it_failed: z.string().default(""),
  // 可复用公式:从这条作品提炼的、本账号可迁移复用的做法(须有逐字稿依据)。
  reusable_formula: z.string().default(""),
  // 下一轮实验选题(0-3 条;runner 全局 ≤3/run 防灌库)。
  next_experiments: z.array(topicAttributionExperimentSchema).default([]),
});
export type TopicAttributionOutput = z.infer<typeof topicAttributionSchema>;

export const TOPIC_ATTRIBUTION_TEMPLATE: PromptTemplate = {
  id: "topic.attribution",
  version: "v1",
  // 三位一体「输出 Zod schema」收口到 registry(SPEC §4.2):runStructuredNode 从 registry
  // 取它绑 generateObject,校验失败自动重试。
  outputSchema: topicAttributionSchema,
  // 纯结构化生成,不挂工具。
  tools: [],
  system:
    "你是这位创作者的「正向归因 agent」,像资深短视频操盘手那样复盘**本账号已发布作品**的实绩," +
    "按选题维度归因:这条作品的选题类型/开头 Hook/内容结构公式是什么,为什么表现好或差,能沉淀什么可复用公式。" +
    "**硬约束(诚实门):归因只能基于下面给你的真逐字稿与真实数据**——" +
    "why_it_worked / why_it_failed / reusable_formula 必须引用逐字稿原文片段(用「」引出)佐证;" +
    "逐字稿里找不到依据的结论一律留空字符串,绝不推测、绝不编造。" +
    "表现分层(爆款/常规/低表现)已由程序按本账号基线算好注入,你不要重新评判数据高低。",
  // facets:positioning(本账号定位,兜底后必有)· workBrief(作品标题+表现分层+真实指标)·
  //        transcript(该作品真逐字稿,runner 保证非空 —— 无稿不产,压根不会跑到这)。
  template: `【本账号定位】
{{positioning}}

【本账号已发布作品(表现分层由程序按本账号基线算出)】
{{workBrief}}

【该作品真逐字稿(归因的唯一文本依据,严禁脱离它下结论)】
{{transcript}}

【任务】按选题维度归因这条作品,输出:
1. topic_type:选题类型,只能取 {教程,观点,案例拆解,工具测评,热点跟进,故事} 之一。
2. hook_type:开头 Hook 类型,只能取 {反差,具体数字,痛点直击,悬念,利益承诺,身份共鸣} 之一(依据逐字稿开头判断)。
3. structure_formula:内容结构公式,只能取 {痛点-方案-证明-CTA,三步教程,对比实验,叙事-转折-干货,清单式} 之一。
4. why_it_worked:如果表现分层是爆款/常规,它为什么起效 —— **必须引用逐字稿原文片段**(「」引出)说明哪句/哪段起了作用;低表现或无据 → 留空。
5. why_it_failed:如果表现分层是低表现,它为什么没起效 —— 同样**引用逐字稿原文片段**指出问题所在;爆款/无据 → 留空。
6. reusable_formula:从这条作品能沉淀的、本账号可复用的做法(一句话公式,须有逐字稿依据;无 → 留空)。
7. next_experiments:基于这次归因,给 0-3 个**下一轮实验选题**(本账号能拍的新题:延续被验证的要素、或针对失败点换法子;每条 title+angle,angle 说明实验假设「验证什么」)。没有值得实验的 → 空数组。

【输出】只输出一个 JSON 对象:
{"topic_type":"…","hook_type":"…","structure_formula":"…","why_it_worked":"…引用「原文片段」…","why_it_failed":"","reusable_formula":"…","next_experiments":[{"title":"实验选题标题","angle":"实验假设/切入角度"}]}`,
  requiredFacets: ["positioning", "workBrief", "transcript"],
  // 声明式 context:本模板只需 positioning 源(定位)。workBrief/transcript 由 runner 从
  // 发布实绩/逐字稿 artifact 直接装配(非 reader)。
  contextRequirements: ["positioning"],
};
