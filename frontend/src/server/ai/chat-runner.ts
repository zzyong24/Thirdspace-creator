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
import { parseLearnings } from "./review-runner";
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
    REVIEW_INSIGHTS_TEMPLATE,
    CALIBRATION_DIAGNOSE_TEMPLATE,
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

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库),注进 system。
  const context = await assembleCreativeContext(
    ctx,
    { projectId: chatContext.projectId ?? null, topic: "" },
    deps,
  );
  // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
  // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
  const baseSystem = assembleChatSystem(skill.system, context);
  const selectionBlock = assembleSelectionContext(chatContext.selection);
  const system = selectionBlock ? `${baseSystem}\n\n${selectionBlock}` : baseSystem;
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
        template: CALIBRATION_DIAGNOSE_TEMPLATE,
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
      // 复用 review.insights 模板 + parseLearnings(与 review-runner 同源)—— 产经验候选(非实体)。
      // T-027:模型没显式传 subject 时用工作台选中内容的标题兜底。
      const effSubject = subject?.trim() ? subject : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "review.insights");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        template: REVIEW_INSIGHTS_TEMPLATE,
        facets: {
          positioning: context.positioningBrief
            ? context.positioningBrief
            : "（未设置定位——按通用内容方法论提炼）",
          priorLearnings: context.learningsBrief
            ? `\n【已有经验(避免重复)】\n${context.learningsBrief}`
            : "",
          subject: effSubject
            ? effSubject
            : "（未指定具体内容,按这个账号的整体表现提炼)",
        },
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
