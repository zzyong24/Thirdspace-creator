import { z } from "zod";
import type { PromptTemplate } from "../template";
import { AUDIENCE_MINDSET_CLAUSE } from "../grounding-facets";

/**
 * 一稿多平台 skill 模板(platform.adapt)—— 从 platform-adapt-runner 的内联 buildAdaptPrompt 提取。
 * 把同一份内容一稿改多平台(抖音/B站/小红书/公众号),每平台一套 标题/正文/标签/封面创意。
 * facets 由 CreativeContext + task 映射:
 *   positioning(必需,调用方已兜底)· topic(本期选题,选填)· script(原始脚本/内容,选填)·
 *   targets(必需:目标平台清单,调用方按 platforms 计算并注入)。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 * 注:resolveModelSpec 仍按 "script.rewrite" capability 解析模型(与触发器 taskType=publish.platform_adapt 对应)。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让用户默认的 MiniMax 也稳定吐可解析多平台草稿(旧 runTemplatedNode 自由文本路径 MiniMax 下常吐
 * 不出→parsePlatformDrafts 返回空→任务 cancelled)。**顶层是对象**(drafts 数组包一层)——
 * generateObject 要顶层对象、裸数组在部分 provider 不可靠。发布简介 body 是成功物料的必填
 * 字段，缺失/空串必须触发结构化重试或失败，不能把“只有标题/标签”当成成功候选。
 *
 * L6 对齐 cheat-package(SPEC §3.6):把 cheat-package「内容发布审核清单 SOP」移植成 **prompt 指导 +
 * schema 承载**(不 shell 出 cheat-package skill——它是 CLI/Claude skill,这里是产品内 AI 节点)。
 *   - prompt:生成多平台物料后**逐条过审核清单**——Tier 1 硬规则(营销导流/绝对化用语/虚假夸大/
 *     判重/违禁)命中**自动改成合规版再输出**(draft 本身合规);Tier 2 经验(降权词/营销变现词/
 *     真名/时长+CTR)给建议。关键更正:**工具名(Codex/Claude/豆包)不算违规**,红线是站外导流 +
 *     绝对化用语。平台规格(抖音 1-3 标签/小红书 3-6…)写进 prompt 让模型按目标平台调。
 *   - schema:platformDraftSchema 每条 draft 加 `auditFlags`(命中了什么 + 怎么改的),前端发布页可显
 *     审核结论。硬规则改在 draft 本体(合规),auditFlags 只记改动;这补的正是 publish.platform_adapt
 *     此前缺的合规校验。
 */
export const platformDraftSchema = z.object({
  platform: z.string().default(""),
  title: z.string().default(""),
  body: z.string().trim().min(1, "发布物料必须包含简介 body"),
  tags: z.array(z.string()).default([]),
  coverIdea: z.string().default(""),
  // L6 对齐 cheat-package「发布审核 SOP」:每条草稿逐条过审核清单后,记录**命中了什么 + 怎么改的**。
  // 硬规则(Tier 1)项模型已自动改成合规版再输出(draft 本身合规),auditFlags 只留一句改动记录
  // (如「标签去品牌词」「营销词→实操」);经验项(Tier 2)给建议;全清则给一条 ✅ 类。
  // 默认空数组:老 provider/落空兜底不吐这字段也过校验(向后兼容,不破坏既有 draft 形状)。
  auditFlags: z.array(z.string()).default([]),
});
// 顶层输出契约:一个 drafts 数组(顶层对象,非裸数组)。
export const platformAdaptSchema = z.object({
  drafts: z.array(platformDraftSchema).default([]),
});
export type PlatformAdaptOutput = z.infer<typeof platformAdaptSchema>;

export const PLATFORM_ADAPT_TEMPLATE: PromptTemplate = {
  id: "platform.adapt",
  version: "v2",
  outputSchema: platformAdaptSchema,
  tools: [],
  system:
    "你是这位创作者的「一稿多平台 agent」,同时也是**发布合规审核员**。你像专业自媒体编导那样把同一份内容一稿改多平台,并且**每条物料都必须先过发布审核清单再交付**——不审核就给的物料等于把限流/删稿风险直接甩给创作者。硬规则命中的你**直接改成合规版再输出**(草稿本身合规),并在 auditFlags 里记一句改了什么;经验规则命中的给建议。",
  template: `你是这位创作者的「一稿多平台 agent」+ 发布合规审核员。

【创作者定位】
{{positioning}}{{topic}}{{script}}

【任务】像一个专业自媒体编导那样,把同一份内容**一稿改多平台**。针对下面每个目标平台,产出符合该平台调性的标题/正文/标签/封面创意:
{{targets}}

${AUDIENCE_MINDSET_CLAUSE}

【平台规格(按目标平台调标签数/风格/时长)】
· 抖音 douyin：竖屏 30-60s,钩子+冲击,强标题拉完播,标签 **1-3 个**(不堆砌)。
· 小红书 xiaohongshu：1-3min,教程+种草,图文分点,标签 **3-6 个** + 关键词。
· 视频号 wechat(视频号)：1-2min,温和+深度,拉转发/朋友点赞,标签 1-3。
· 公众号：长图文,深度+结构+小标题,标题党克制。
· B站 bilibili：横屏 5-15min,体系+详细,标签走分区+多 tag。

【发布审核清单(每条草稿生成后逐条自检,对齐 cheat-package SOP)】
先按目标平台产出物料,再对每条草稿逐项对照下面清单——**Tier 1 命中必须自动改成合规版再输出(草稿本身合规)**,**Tier 2 命中给建议**;把每次命中/改动写进该草稿的 auditFlags。

🛑 Tier 1 硬规则(命中→自动改成合规版 + auditFlags 记一句改了什么):
1. 营销导流：正文/标题/标签**不得**出现微信/QQ/二维码/外链/电话及谐音变体(V信/薇/威/+我/私我/扣我/主页有/简介有/homepage);CTA 只能站内动作(关注/评论/收藏/转发)。命中→删掉导流,换成站内 CTA。
2. 绝对化用语：**不得**出现 最/第一/国家级/最高级/唯一/100%/绝对/保证/永久。命中→改成非绝对表述(如「最有效」→「更有效」)。
3. 虚假夸大：数据必须真实,mock/演示数据**不得**说成真实用户/真实成交;不编造、不贬低同行。命中→改成如实/中性表述。
4. 判重：标题不与近期已发重复(含只改一两字)。若疑似重复→换一个角度重写标题。
5. 违禁：无危险/极端情绪/管制品;涉医疗健康金融荐股需谨慎不越界。命中→改写规避。

🟡 Tier 2 经验限流(命中→给建议 + auditFlags 记一条建议,可直接改的就改):
6. 降权词:干货/硬核/全网最/保姆级/超详细/吐血整理 → 换更朴实的说法。
7. 营销变现词:变现/割韭菜/暴利/躺赚/年入X万 → 实操/跑通/落地/产生价值。
8. 隐私/真名:他人真名模糊化,无隐私信息。
9. 时长 + CTR:目标平台时长若 >90s,提示完播挑战(首句/封面钩子加强);封面创意 ≤12 字、标题前 3 字带钩子。

⚠️ **关键更正(别搞错,否则误删有效内容)**:**工具名不是违规项**——AI 教学语境里点名 Codex / Claude / 豆包 / GPT 等大模型/工具属于正常教学描述,**标题 / 标签 / 简介都可以用,不要删**。真正的红线是**站外导流**(微信/二维码/外链/谐音)和**绝对化用语**(最/第一/100%),不是工具品牌名。

【输出】只输出一个 JSON 对象 {"drafts": [...]}（不要多余文字、不要代码块包裹、不要前言）,drafts 是每个目标平台一项的数组:
{"platform"(平台标识,用上面给的英文标识),"title"(该平台标题,已过审的合规版),"body"(该平台正文/文案,已过审),"tags"(标签数组,按平台规格给数量),"coverIdea"(封面创意,一句,≤12字),"auditFlags"(字符串数组:逐条记这条草稿命中了什么审核项 + 怎么改的,如「标签去掉品牌词→泛称」「营销词『变现』→『跑通』」「去掉导流『主页有』→站内关注」;全部干净则给一条如「✅ 无命中,合规」)}。
【严格 JSON 要求】① 正文/标题/auditFlags 里如需引号,一律用中文「」或『』,**禁止用英文半角双引号 "**(否则会破坏 JSON);② 换行用 \\n,不要真实换行;③ 每个平台 body 控制在 200 字以内,精炼即可;④ auditFlags 每条一句话,别长篇。`,
  requiredFacets: ["positioning", "targets"],
};
