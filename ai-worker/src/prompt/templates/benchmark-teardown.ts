import { z } from "zod";
import type { PromptTemplate } from "../template";

// [T-212c] 对标爆款拆解 skill 模板（benchmark.teardown）—— 补 learn-from 缺的「拆解 → 自动进选题池」
// 闭环那一跳。输入一条**已判爆款**的对标他号作品（标题/数据/爆款倍数）+ **本账号定位**，输出
// 结构化拆解 + 若干**换本账号角度**的转化选题候选。高适配项由 runner 转化进候选池（source=benchmark）。
//
// 硬约束（写进 system + 任务，防抄袭）：**不抄袭原作品**，同一底层需求换本账号的定位/人设/角度重做。
//   转化选题不是复制爆款标题，而是「爆款为什么爆」的可迁移要素 × 本账号定位 = 本账号能做且更合定位的新题。
//
// 输出契约走 generateObject 绑 Zod（每轮 schema 约束，SPEC §4.2 防发散），跨模型健壮（runStructuredNode
//   文本兜底）。schema 定义在本包（有 zod 依赖）；backend runner 只引类型，无需直引 zod。

// 一条转化选题候选。fit=适配度（high 才由 runner 转化进池，medium/low 仅记录不进池，防灌库）。
export const benchmarkTopicSchema = z.object({
  title: z.string().default(""),
  angle: z.string().default(""),
  // 适配度：换本账号角度后与本账号定位的贴合度。high = 本账号能做且合定位，值得进池。
  fit: z.enum(["high", "medium", "low"]).default("medium"),
});

// 顶层输出契约（顶层对象，非裸数组 —— generateObject 要顶层对象）。六段拆解 + 转化选题数组。
// 各字段 `.default("")` / `.default([])` 让模型偶尔缺字段也能过校验（缺则空），跨模型稳。
export const benchmarkTeardownSchema = z.object({
  钩子拆解: z.string().default(""), // 前3秒/开头怎么抓人
  结构拆解: z.string().default(""), // 内容结构/节奏编排
  为什么爆: z.string().default(""), // 爆的底层原因（需求/情绪/信息增量）
  可借鉴点: z.array(z.string()).default([]), // 可迁移的要素清单
  适配本账号建议: z.string().default(""), // 结合本账号定位怎么改造
  转化选题: z.array(benchmarkTopicSchema).default([]), // 换角度的新题（high 才进池）
});
export type BenchmarkTeardownOutput = z.infer<typeof benchmarkTeardownSchema>;

export const BENCHMARK_TEARDOWN_TEMPLATE: PromptTemplate = {
  id: "benchmark.teardown",
  version: "v1",
  // 三位一体「输出 Zod schema」位收口到 registry（SPEC §4.2）：runStructuredNode 从 registry 取它
  // 绑 generateObject（不再由调用方手传），校验失败自动重试。
  outputSchema: benchmarkTeardownSchema,
  // 纯结构化生成，不挂工具。
  tools: [],
  system:
    "你是这位创作者的「对标拆解 agent」，像资深短视频操盘手那样拆解对标账号的爆款作品，提炼可迁移的爆款要素。" +
    "**硬约束：绝不抄袭**——不复制原作品的标题/文案/结构照搬，而是拆出它「为什么爆」的底层要素，" +
    "再结合下面这位创作者自己的定位与人设，换一个属于本账号的角度重做。转化选题必须是本账号能做、且更贴合本账号定位的新题，不是原爆款的翻版。",
  // facets：positioning（本账号定位，必需已兜底）· benchmarkBrief（对标爆款作品的标题/数据/爆款倍数，必需）。
  template: `【本账号定位】
{{positioning}}

【对标爆款作品（他号，仅作拆解，严禁照搬）】
{{benchmarkBrief}}

【任务】拆解上面这条对标爆款，输出可迁移的爆款要素，并**换本账号角度**给出转化选题：
1. 钩子拆解：它前3秒/开头怎么抓住人。
2. 结构拆解：它内容的结构与节奏怎么编排。
3. 为什么爆：它爆的**底层原因**（戳中什么需求/情绪，给了什么信息增量或反差），不要停在表面。
4. 可借鉴点：列出可迁移到本账号的要素（3-6 条）。
5. 适配本账号建议：结合【本账号定位】，这套要素在本账号该怎么改造落地。
6. 转化选题：给 1-3 个**本账号自己的新选题**。每个必须**换角度**（同一底层需求，用本账号的定位/人设/领域重做，不是原标题改几个字）。
   - fit 标本账号适配度：high=本账号能做且贴合定位、值得进选题池；medium/low=偏离定位或本账号不擅长。
   - 只有 fit=high 的会被采纳进池，请对 high 从严。

【输出】只输出一个 JSON 对象：
{"钩子拆解":"…","结构拆解":"…","为什么爆":"…","可借鉴点":["…"],"适配本账号建议":"…","转化选题":[{"title":"本账号的新选题标题","angle":"切入角度/差异化","fit":"high|medium|low"}]}`,
  requiredFacets: ["positioning", "benchmarkBrief"],
  // 声明式 context：本模板只需 positioning 源（定位）。benchmarkBrief 由 runner 从对标作品行直接装配（非 reader）。
  contextRequirements: ["positioning"],
};
