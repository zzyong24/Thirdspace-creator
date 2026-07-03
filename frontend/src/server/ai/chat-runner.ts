import "server-only";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
} from "ai";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
import {
  resolveSkillForSurface,
  applyFunctionKey,
  assembleChatSystem,
  assembleSelectionContext,
  type ChatContext,
} from "./chat-context";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { buildEnrichPrompt, parseCard } from "./topic-enrich-runner";
import { buildPositioningPrompt, parseSuggestion } from "./positioning-runner";
import { parseLearnings, reviewFacets } from "./review-runner";
import { parseDiagnosis } from "./calibration-diagnose-runner";

// 上下文感知 ChatBox 的服务端装配(SPEC §3.3)—— /api/chat 路由的「大脑」,从这里调
// streamText。把路由薄壳化:路由只管鉴权 + 解析 body + 持久化;真正的「resolve skill →
// 注入 CreativeContext facets → 挂工具 → streamText」装配逻辑在此,故可单测(SPEC §7
// 「/api/chat 装配:resolve skill + 注入 context + tools 挂载」)。
//
// 铁律:全程 Vercel AI SDK(streamText + 工具);提示词 / 工具白名单 / 输出契约走 registry
// (别内联);工具结果 = 候选(execute 复用现有 runner 核心,不直接写实体)。

export interface AssembleChatDeps extends ContextDeps {
  /** 按 capability 解析用户配的 model(复用 persistence-client 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /**
   * 只读 context 读端口(供 context.projects / context.knowledge / context.materials 工具)。
   * **只读、按 ctx.userId 过滤**,由 composition root(persistence-client)绑到 user-scoped 读源
   * (projects repo / knowledge service / assets service)。可选:未装配时对应工具读到空(诚实降级,
   * 不塞假数据)。与 CreativeContext 的 facet reader 不同 —— 这些是「用户问才实时拉」的按需读。
   */
  contextReaders?: ContextReaders;
}

/**
 * 只读 context 读端口集 —— 三个工具各自的真数据源。composition root 绑真实 user-scoped 读方法;
 * 单测注入 fake。全部按当前用户过滤(由绑定处的 service/repo 用 ctx.userId 收窄)。
 */
export interface ContextReaders {
  /** 列该用户最近的项目/作品(用于 context.projects)。 */
  listProjects: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
    rows: Array<{
      id: string;
      title: string;
      stage: string;
      status: string;
      publishedAt?: string | null;
    }>;
    total: number;
  }>;
  /** [T-058③] 观众评论只读(audience_signals source='comment',最新在前)。 */
  listComments: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
    rows: Array<{
      text: string;
      likeCount: number | null;
      source: string;
      createdAt: string;
    }>;
    total: number;
  }>;
  /** 搜该用户知识库(用于 context.knowledge)。query 空 → 回最近若干条。 */
  searchKnowledge: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; snippet: string }>>;
  /** 搜该用户素材库 assets(用于 context.materials)。query 空 → 回最近若干条。 */
  searchMaterials: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; kind: string }>>;
}

// 各 ChatBox skill 的「主能力档」—— 基础模型按它解析(各 surface 复用对应节点的模型配置,
// 与一键岛同一引擎)。各工具 exec 内再按自己的 capability 解析(允许不同工具配不同模型)。
const SKILL_PRIMARY_CAPABILITY: Record<string, string> = {
  "chatbox.topic": "topic.generate",
  "chatbox.calibration": "calibration.diagnose",
  "chatbox.positioning": "positioning.generate",
  "chatbox.review": "review.insights",
};

// 通用维度评分标准(对话里没有绑定 rubric reader 时的诚实降级)—— 让 calibration.diagnose 工具
// 在 free-chat 也能逐维度盲评。一键岛带 subject 时仍走这套通用维度(对话不接库内 rubric reader,
// 避免跨模块直连 repo;真·按用户 rubric 的诊断在工作台 StartPredictionButton 那条任务链上)。
const GENERIC_RUBRIC_DIMENSIONS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}> = [
  { key: "hook", label: "开头钩子", description: "前 3 秒能否抓住注意力" },
  { key: "value", label: "价值密度", description: "信息/情绪价值是否扎实" },
  { key: "structure", label: "结构节奏", description: "推进是否清晰不拖沓" },
  { key: "audience_fit", label: "人群契合", description: "是否打中目标受众的痛点" },
  { key: "conversion", label: "转化引导", description: "是否自然引导到信任/转化" },
];

// 解析结果:路由把它交给 streamText 的 stream 喂回前端 + 落库。导出供单测断言「选对 skill /
// 注入了 facets / 挂对了 tools」而不真跑模型(单测注入 fake streamText 不便,故拆出
// buildChatAssembly 只做装配、不调网络,由它单测;runChatStream 串起 streamText)。
export interface ChatAssembly {
  skillId: string;
  system: string;
  tools: ToolSet;
  modelSpec: ModelSpec;
}

/**
 * 纯装配(不调模型)—— resolve skill(surface 层)→ 装配 CreativeContext facets(数据层)→
 * 拼 system → 按 skill 白名单挂工具(工具白名单层)。单测直接断言它的产物。
 *
 * 工具 execute 复用现有 runner 核心(runTopicNode / 选题卡补全),都在请求期用解析好的 model
 * 跑;故这里先解析 model(没配 key 抛 LlmCredentialError,由路由接住返 4xx,不假成功)。
 */
export async function buildChatAssembly(
  ctx: RequestContext,
  chatContext: ChatContext,
  deps: AssembleChatDeps,
): Promise<ChatAssembly> {
  // 1) 页面层:surface → 基础 skill。
  const skillId = resolveSkillForSurface(chatContext.surface);

  // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
  const {
    getTemplate,
    getTools,
    modelFor,
    runTopicNode,
    runTemplatedNode,
  } = await import("@creatoros/ai-worker");
  const skill = getTemplate(skillId);
  // 工具白名单层(SPEC §3.2 第 1+2 层):surface 选基础 skill 的白名单,再按按钮层 functionKey
  // 把命中的专用工具置顶(预调)。functionKey 越权(不在白名单)→ 原样,不臆造工具。
  const toolWhitelist = applyFunctionKey(getTools(skillId), chatContext.functionKey);

  // 3) 解析 model。基础档按 skill 主能力解析(chatbox.topic/review/positioning 复用各自
  //    主工具的配置档);各工具 exec 内按自己的 capability 再解析(不同工具可配不同模型)。
  const skillCapability = SKILL_PRIMARY_CAPABILITY[skillId] ?? "topic.generate";
  const modelSpec = await deps.resolveModelSpec(ctx, skillCapability);
  const model = modelFor(modelSpec);

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库 / 复盘作品真材料),
  //    注进 system。T-039a:把 chatContext.projectId 真正传下去(原写死 null → 复盘/项目相关
  //    facet 永远读不到本项目),让复盘路径能拿到这条作品的真文案/标题/数据/评论;topic 从选中态
  //    标题(工作台一键岛带进来的作品标题)派生(不再恒 ""),让账号级兜底也有真主题可用。
  const context = await assembleCreativeContext(
    ctx,
    {
      projectId: chatContext.projectId ?? null,
      topic: chatContext.selection?.label?.trim() ?? "",
    },
    deps,
  );
  // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
  // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
  // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
  const baseSystem = assembleChatSystem(skill.system, context, {
    includeAccounts: skillId === "chatbox.positioning",
  });
  // [T-058①B] 能力边界诚实(实录复盘:模型口头宣称「已采纳写入定位母版」但 DB 未动):
  // 写库只经工具产卡+用户点采纳;禁止假承诺;工具带分页限制时如实说明。
  const honestyBlock = [
    "【能力边界 —— 必须遵守】",
    "1. 你对任何数据的写入都只有一条路径:调用对应工具产出候选卡,由用户点卡上的「采纳/写入」按钮完成。你自己没有直接写库能力。",
    "2. 绝不口头宣称「已写入/已采纳/已保存」—— 除非你看到用户明确说 TA 已点过采纳按钮。用户想落库时,引导 TA:先让你调工具产卡,再点卡上的按钮。",
    "3. 用户要新定位 → 必须调 positioning.generate 工具(产带采纳按钮的卡),不要只在文本里写定位 —— 文本无法被采纳。",
    "4. 工具有分页/条数上限时,如实告知拿到了多少、还有没有更多,不要谎称已看全部。",
  ].join("\n");
  const selectionBlock = assembleSelectionContext(chatContext.selection);
  // T-039a 补:复盘对话「瞎问复盘对象」根因 —— 本项目真材料虽已装进 context(reviewSubject reader)
  // 且进了 review.analyze 工具的 facets,但**没进对话系统提示**,故 LLM 在决定调用工具前不知道复盘哪条,
  // 于是反复问「复盘对象是什么」并退回账号级泛论。这里把「本次复盘对象(真标题+文案+数据+评论)」直接
  // 注进对话 system + 强指令「别再问、直接基于它复盘」,让模型一进来就扣住这条作品。有 projectId 才注入
  // (reviewTitle/reviewScript 非空);读不到(无脚本/数据)则该行省略,不喂空噪声。
  const reviewSubjectBlock =
    context.reviewTitle || context.reviewScript || context.reviewMetrics
      ? [
          "【本次复盘对象 —— 创作者已在工作台选定这一条作品,请直接基于它提炼可复用要素,不要再问用户「复盘对象是什么」、也不要退回账号整体泛论】",
          context.reviewTitle ? `标题:《${context.reviewTitle}》` : "",
          context.reviewScript ? `文案/逐字稿:\n${context.reviewScript}` : "",
          context.reviewMetrics ? `真实数据:${context.reviewMetrics}` : "",
          context.reviewComments ? `观众评论(真实):\n${context.reviewComments}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const system = [baseSystem, honestyBlock, reviewSubjectBlock, selectionBlock]
    .filter(Boolean)
    .join("\n\n");
  // 选中态标题 —— 工具入参兜底(模型没显式传 title/subject 时用它,避免拿空标题去诊断)。
  const selectionTitle = chatContext.selection?.label?.trim() || "";

  // 5) 工具白名单层:按 skill 白名单挂工具,execute 复用现有 runner 核心产**候选**(非实体)。
  const toolDeps: ChatToolDeps = {
    generateTopics: async ({ basis, extraBrief }) => {
      // 复用 ai-worker.runTopicNode —— 产 TopicItem[] 候选(与一键岛同一引擎)。
      const basisBrief =
        basis === "comments"
          ? context.signalsBrief
          : basis === "knowledge"
            ? context.knowledgeBrief
            : (extraBrief ?? "");
      const { topics } = await runTopicNode({
        model,
        positioningBrief: context.positioningBrief,
        basisBrief,
        basis,
      });
      return topics.map((t) => ({
        title: t.title,
        angle: t.angle,
        contentRole: t.contentRole,
        predictedScore: t.predictedScore,
        reason: t.reason,
      }));
    },
    enrichTopic: async ({ title, angle }) => {
      // 复用 topic-enrich-runner 的 enrich prompt + parseCard —— 产选题卡候选(非实体)。
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const prompt = buildEnrichPrompt(context, { title, angle });
      const res = await runAgentNode({
        model,
        system:
          "你是这位创作者的选题策划 agent,把一条选题补全成完整选题卡。只输出 JSON,不要多余文字。",
        prompt,
        maxSteps: 2,
      });
      return parseCard(res.text);
    },
    generateHooks: async ({ topic, direction }) => {
      // [T-055c] 复用 runAgentNode 一次调用产 hook 候选组(非实体)。主题兜底:模型没传
      // topic 时用选中项目标题(稿面右栏常驻 = 当前项目)。产出走 ChatHookCard 逐条写入稿面。
      const effTopic = topic?.trim() || selectionTitle || "";
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const prompt = [
        "为这条短视频内容生成 4 条口播开场 hook 候选(前 3 秒抓注意力的第一句话)。",
        effTopic ? `内容主题:《${effTopic}》` : "内容主题:见下方创作者定位,选最有张力的切入。",
        context.positioningBrief
          ? `创作者定位:
${context.positioningBrief}`
          : "",
        direction ? `方向要求:${direction}` : "",
        '4 条彼此切角不同(如:反常识断言 / 数据冲击 / 场景代入 / 利益承诺)。每条 ≤40 字,口语化,不要书面腔。',
        '只输出 JSON 数组,形如 [{"text":"hook 文案","angle":"切角名"}],不要多余文字。',
      ]
        .filter(Boolean)
        .join("\n");
      const res = await runAgentNode({
        model,
        system:
          "你是这位创作者的口播编导,专门打磨前 3 秒开场 hook。只输出 JSON,不要多余文字。",
        prompt,
        maxSteps: 2,
      });
      return parseHookItems(res.text);
    },
    draftScript: async ({ topic, angle }) => {
      // [T-057⑤] 复用 runScriptNode(与旧 ScriptDraftIsland/任务链同引擎,script.draft
      // capability 的用户配模型);shots → 编辑器 sections(与 script-runner renderSections 同形)。
      const effTopic = topic?.trim() || selectionTitle || "";
      const spec = await deps.resolveModelSpec(ctx, "script.draft");
      const { runScriptNode } = await import("@creatoros/ai-worker");
      const { shots } = await runScriptNode({
        model: modelFor(spec),
        positioningBrief: context.positioningBrief,
        learningsBrief: context.learningsBrief,
        topicTitle: effTopic,
        topicAngle: angle ?? "",
      });
      return shots.map((shot, i) => {
        const label = shot.口播 ? shot.口播.slice(0, 16) : `分镜 ${i + 1}`;
        const heading = shot.时长
          ? `${i + 1}. ${label}（${shot.时长}）`
          : `${i + 1}. ${label}`;
        const body = [
          shot.口播 && `口播：${shot.口播}`,
          shot.画面 && `画面：${shot.画面}`,
          shot.字幕 && `字幕：${shot.字幕}`,
        ]
          .filter((l): l is string => Boolean(l))
          .join("\n");
        return { heading, body };
      });
    },
    gatherMaterials: async ({ query }) => {
      // [T-057④] 复用 runResearchNode(research.gather capability,四类结构化素材)。
      const spec = await deps.resolveModelSpec(ctx, "research.gather");
      const { runResearchNode } = await import("@creatoros/ai-worker");
      const { items } = await runResearchNode({
        model: modelFor(spec),
        positioningBrief: context.positioningBrief,
        topicTitle: query?.trim() || selectionTitle || "",
      });
      return items.map((it) => ({
        title: it.title,
        url: it.url,
        source: it.source,
        whyRelevant: it.why_relevant,
        category: it.source || "素材",
      }));
    },
    diagnoseContent: async ({ title, script }) => {
      // 复用 calibration.diagnose 模板 + parseDiagnosis(与 calibration-diagnose-runner 同源)。
      // 对话里没有库内 rubric reader → 用通用维度评(诚实降级)。产诊断候选(非实体)。
      // T-027:模型没显式传 title 时用工作台选中内容的标题兜底(不拿空标题去诊断)。
      const effTitle = title?.trim() ? title : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "calibration.diagnose");
      const rubricBlock = GENERIC_RUBRIC_DIMENSIONS.map(
        (d, i) => `${i + 1}. ${d.label}（key=${d.key}） —— ${d.description}`,
      ).join("\n");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("calibration.diagnose"),
        facets: {
          positioning: context.positioningBrief
            ? context.positioningBrief
            : "（创作者尚未设置定位——按通用爆款逻辑判断）",
          learnings: context.learningsBrief
            ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
            : "",
          rubricBlock,
          title: effTitle || "（未提供标题）",
          script:
            script && script.trim()
              ? script
              : "（暂无文稿——请基于标题与定位做尽力诊断,拿不准的指标给 null）",
        },
      });
      const parsed = parseDiagnosis(
        text,
        new Set(GENERIC_RUBRIC_DIMENSIONS.map((d) => d.key)),
      );
      if (!parsed) return null;
      // 对话卡只用维度评分 + 综合判断三段(performance 留给工作台诊断卡;对话里不渲分数 chips)。
      return {
        dimensions: parsed.dimensions,
        verdict: parsed.verdict,
        mainIssues: parsed.mainIssues,
        priorityFixes: parsed.priorityFixes,
      };
    },
    analyzeReview: async ({ subject }) => {
      // 复用 review.insights 模板 + reviewFacets + parseLearnings(与 review-runner 同源、同一份
      // 真数据注入,不造影子)。T-039a:facets 走共用 reviewFacets —— 它把本项目的真文案/数据/评论
      // 拼成整块注入(前提是上面 assembleCreativeContext 拿到了 projectId → reviewSubject reader 读齐)。
      // subject 优先级:模型显式传 > 工作台选中标题 > 作品真标题(reviewFacets 内兜底)。
      const effSubject = subject?.trim() ? subject : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "review.insights");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("review.insights"),
        facets: reviewFacets(context, effSubject),
      });
      return parseLearnings(text);
    },
    generatePositioning: async () => {
      // 复用 positioning-runner 的 prompt + parseSuggestion —— 产定位提案候选(非实体)。
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const spec = await deps.resolveModelSpec(ctx, "positioning.generate");
      const res = await runAgentNode({
        model: modelFor(spec),
        system: "你是这位创作者的定位策略 agent。只输出 JSON,不要多余文字。",
        prompt: buildPositioningPrompt(context),
        maxSteps: 2,
      });
      return parseSuggestion(res.text);
    },
    // 只读 context 工具 —— execute 直接调注入的 user-scoped 读端口(不跑模型、不产候选、不写实体)。
    // 端口未装配(contextReaders 缺省)→ 回空数组(诚实降级,绝不塞假数据),模型据此如实作答。
    listProjects: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listProjects(ctx, { limit, offset });
    },
    listComments: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listComments(ctx, { limit, offset });
    },
    searchKnowledge: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchKnowledge(ctx, { query, limit });
    },
    searchMaterials: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchMaterials(ctx, { query, limit });
    },
  };
  const tools = buildChatTools(toolWhitelist, toolDeps);

  return { skillId, system, tools, modelSpec };
}

/**
 * 串起 streamText(SPEC §3.3)—— 装配 + 把 UIMessage[] 转成 ModelMessage[] 喂模型,流式产出。
 * `onFinish` 由路由传入(落 ai_messages 的 assistant 文本)。返回 StreamTextResult,路由用
 * `toUIMessageStreamResponse()` 流回前端(useChat 消费)。
 */
export async function runChatStream(
  ctx: RequestContext,
  input: { messages: UIMessage[]; chatContext: ChatContext },
  deps: AssembleChatDeps,
  onFinish?: (finalText: string) => void | Promise<void>,
) {
  const assembly = await buildChatAssembly(ctx, input.chatContext, deps);
  const { modelFor } = await import("@creatoros/ai-worker");
  const modelMessages = await convertToModelMessages(input.messages);
  const result = streamText({
    model: modelFor(assembly.modelSpec),
    system: assembly.system,
    messages: modelMessages,
    tools: assembly.tools,
    // 工具调用后让模型据工具结果继续把话说完(候选已在 tool-result part 里流回前端渲卡)。
    stopWhen: stepCountIs(5),
    onFinish: onFinish
      ? async ({ text }) => {
          await onFinish(text);
        }
      : undefined,
  });
  return result;
}

// [T-055c] script.hooks 的宽容 JSON 解析:剥围栏 → 找首个 [...] → 逐条收窄。
// 模型输出不合形 → 返回 []（诚实空,前端渲「没生成出来」而非崩)。
export function parseHookItems(
  raw: string,
): Array<{ text: string; angle: string }> {
  const text = raw.replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => {
        const o = it as { text?: unknown; angle?: unknown };
        const t = typeof o.text === "string" ? o.text.trim() : "";
        const a = typeof o.angle === "string" ? o.angle.trim() : "";
        return t ? { text: t, angle: a || "hook" } : null;
      })
      .filter((x): x is { text: string; angle: string } => x !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}
