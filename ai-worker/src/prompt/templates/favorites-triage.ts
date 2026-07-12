import { z } from "zod";
import type { PromptTemplate } from "../template";

// [T-235d-distill] 收藏夹作品判库 skill 模板(favorites.triage)—— 收藏蒸馏链的「先判库再落」
// 一跳(SPEC 2026-07-11 daily-topic-autopilot §2.3,仿 dy-- `_distill_content_to_asset`)。
// 输入 = 一条他人收藏作品的逐字稿(+ 标题),输出 = 是否值得进知识库的裁决。
//
// 三态裁决(verdict):
//   · knowledge —— 逐字稿含**可沉淀的知识**(观点/方法论/证据/金句/踩坑),值得进知识库 →
//     下游走 knowledge.distill 确认门(AI 产原子候选,人采纳才 knowledge.create,铁律②)。
//   · topic     —— 只有**跟拍选题价值**(形式/选题可复刻),但无独立可沉淀知识 → 已有跟拍候选,
//     蒸馏链无额外动作(不重复灌知识库)。
//   · skip      —— 纯娱乐/口水/无信息量,既非知识也无跟拍增量 → 不占知识也不额外进池。
//
// 诚实门(写进 system):**逐字稿空/无信息一律 skip,绝不为凑数硬判 knowledge**。reason 一句话
//   说明依据(供台账溯源/UI 展示)。输出契约走 generateObject 绑 Zod(每轮 schema 约束,跨模型
//   稳);schema 定义在本包(有 zod 依赖),backend 只引类型。

export const favoritesTriageSchema = z.object({
  // 三选一裁决;default "skip" 让老 provider 落空字段也过校验、且落最保守态(不误灌知识库)。
  verdict: z.enum(["knowledge", "topic", "skip"]).default("skip"),
  // 判库依据一句话(≤80 字;消费方再截)。空串也过校验,消费方兜底。
  reason: z.string().default(""),
});
export type FavoritesTriageOutput = z.infer<typeof favoritesTriageSchema>;

export const FAVORITES_TRIAGE_TEMPLATE: PromptTemplate = {
  id: "favorites.triage",
  version: "v1",
  // 三位一体「输出 Zod schema」位收口到 registry(SPEC §4.2):runStructuredNode 从 registry 取。
  outputSchema: favoritesTriageSchema,
  // 纯结构化判定,不挂工具。
  tools: [],
  system:
    "你是短视频创作者的「收藏内容判库师」。创作者把对标视频收进收藏夹,你拿到某条视频的逐字稿," +
    "判断它**是否值得沉淀进知识库**。三选一:\n" +
    "· knowledge —— 逐字稿里有可独立复用的知识:观点/方法论/证据数据/金句/踩坑经验。值得沉淀。\n" +
    "· topic —— 只有选题或形式上的跟拍参考价值(选题好、结构好),但没有可单独摘出来的知识点。\n" +
    "· skip —— 纯娱乐、口水、带货话术、无信息量,既没知识也没跟拍增量。\n" +
    "**硬约束(诚实门):逐字稿为空或无实质信息,一律判 skip,绝不为凑数硬判 knowledge。** " +
    "只判定,不蒸馏(蒸馏是下一步)。reason 用一句话说清依据。",
  // facets:title(收藏视频标题,帮判断)· transcript(逐字稿,调用方 runner 截断防爆)。
  template: `【收藏视频标题】{{title}}

【逐字稿】
{{transcript}}

【任务】判断这条收藏内容是否值得沉淀进知识库,输出:
- verdict —— 三选一(严格用英文枚举值):
  · knowledge(有可独立复用的知识:观点/方法/证据/金句/踩坑)
  · topic(只有选题/形式的跟拍参考价值,无可摘出的知识点)
  · skip(纯娱乐/口水/带货/无信息量,逐字稿空也归此)
- reason —— 一句话依据(≤80 字):凭什么这么判。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"verdict":"knowledge","reason":"逐字稿含 XX 方法论,可独立复用"}`,
  requiredFacets: ["title", "transcript"],
  // 声明式 context:本模板无 reader 依赖(transcript 由蒸馏 runner 从 favorites_items 直接装配)。
  contextRequirements: [],
};
