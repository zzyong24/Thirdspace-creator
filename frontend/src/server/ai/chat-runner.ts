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
  assembleChatSystem,
  type ChatContext,
} from "./chat-context";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { buildEnrichPrompt, parseCard } from "./topic-enrich-runner";

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
  const { getTemplate, getTools, modelFor, runTopicNode } = await import(
    "@creatoros/ai-worker"
  );
  const skill = getTemplate(skillId);
  const toolWhitelist = getTools(skillId);

  // 3) 解析 model(按 skill 的能力名;chatbox.topic 复用 topic.generate 这档配置)。
  const modelSpec = await deps.resolveModelSpec(ctx, "topic.generate");
  const model = modelFor(modelSpec);

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库),注进 system。
  const context = await assembleCreativeContext(
    ctx,
    { projectId: chatContext.projectId ?? null, topic: "" },
    deps,
  );
  const system = assembleChatSystem(skill.system, context);

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
