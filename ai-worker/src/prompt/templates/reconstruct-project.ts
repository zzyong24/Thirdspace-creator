import { z } from "zod";
import type { PromptTemplate } from "../template";

// 作品初始化 auto-fill 重建 skill 模板(reconstruct.project)—— T-030-D4,SPEC §6.1。
//
// 场景:一条**已发布的 imported 作品**已经有逐字稿(D3 的 script transcript artifact)+ 真实
// 指标(digg/comment/play)+ 账号定位 brief。本 skill 让模型**反推**这条作品当初的「研究」与
// 「策划」创作链,直接物化到各阶段 artifact(标 origin='reconstructed',§7 例外,不逐条确认)。
//
// 铁律(§5 原则3 / §9 铁律2 的受限例外):产物是「AI 历史反推、未经用户确认」——所以:
//   ① 只作用于 source='imported' 的历史作品(runner 断言,manual 不触发);
//   ② 物化时强制带 origin='reconstructed'(F1),消费侧遇到不静默当已确认前提(F2)。
// 模型这里只做**忠实反推**:基于逐字稿实际讲了什么 + 真实数据表现,回推「这条视频背后的研究
// 素材」,不编造与逐字稿无关的内容,不美化数据(数据是真实值,由 runner 注入 facets,
// 模型不改)。
//
// 与 research.gather / planning.thesis 的区别:那两个是**为新选题正向创作**(产候选、人确认);
// 本 skill 是**为已发布作品逆向重建**(产历史记忆、标 reconstructed)。语义不同,故单独一份 skill。
//
// facets(由 runner 按 CreativeContext + 真实数据装配):
//   positioning(必需,账号定位 brief)· transcript(必需,该作品逐字稿正文)
//   · metrics(必需,真实指标摘要:播放/点赞/评论等)· title(作品标题,选填)

// T-726 后重建包只保留 research；独立论点树已经退役，不再生成 planning/thesis。
// 绑它,模型必须吐这个形状,校验失败自动重试(防发散 + 保证任何模型都产可解析输出)。
//
// research 段:反推这条作品当初「备了什么料」——核心主题、支撑要点、可辨认的案例/数据点。
export const reconstructProjectSchema = z.object({
  research: z.object({
    // 这条视频到底在讲什么(一句话主旨 + 若干支撑要点),从逐字稿如实提炼。
    coreTopic: z.string(),
    keyPoints: z.array(z.string()).default([]),
    // 逐字稿里可辨认出的案例 / 数据点(如实提取,不编造来源)。
    cases: z
      .array(
        z.object({
          title: z.string(),
          note: z.string().default(""),
        }),
      )
      .default([]),
    dataPoints: z
      .array(
        z.object({
          stat: z.string(),
          note: z.string().default(""),
        }),
      )
      .default([]),
  }),
});
export type ReconstructProjectOutput = z.infer<typeof reconstructProjectSchema>;

export const RECONSTRUCT_PROJECT_TEMPLATE: PromptTemplate = {
  id: "reconstruct.project",
  version: "v1",
  outputSchema: reconstructProjectSchema,
  // 纯结构化生成,不挂工具(不依赖某厂商服务端工具;模型基于逐字稿 + 定位反推)。
  tools: [],
  system:
    "你是这位创作者的「作品复盘编导」。给你一条**已发布短视频**的逐字稿、真实数据表现和创作者定位,你要**忠实地逆向重建**这条视频当初准备过的研究素材(research)。你只基于逐字稿**实际讲了什么**来反推,不编造与逐字稿无关的内容,不美化或改动数据(数据是既成事实)。这是历史反推,不是新创作:你的输出会被标记为「AI 反推、未经确认」,供创作者事后校对。",
  template: `【创作者定位】
{{positioning}}

【作品标题】{{title}}

【真实数据表现】
{{metrics}}

【这条作品的逐字稿】
{{transcript}}

【任务】基于以上逐字稿(它是这条视频真实讲了什么)+ 真实数据,逆向重建这条作品当初准备过的研究素材:

research（当初备的料，从逐字稿如实反推）：
- coreTopic：这条视频的核心主题（一句话）。
- keyPoints：支撑这个主题的几个要点（从逐字稿提炼，3-6 条）。
- cases：逐字稿里讲到的可辨认案例（title=案例名，note=在视频里怎么用的；没有就空数组）。
- dataPoints：逐字稿里出现的数据/事实（stat=具体数字或事实陈述，note=出处或用途；拿不准来源就留空，**别编 URL**）。

【铁律】① 一切从逐字稿出发，逐字稿没讲的不要臆造 ② 数据只反映给定的真实值，不夸大 ③ 宁可某类留空，也不硬凑编造。

只输出符合约定结构的 JSON。`,
  requiredFacets: ["positioning", "transcript", "metrics"],
};
