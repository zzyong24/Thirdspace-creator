// [T-256b] 自主任务引擎接口 —— **按 Pi(@earendil-works/pi-agent-core `Agent`)形状预留**
// (SPEC §6:引擎选定 Pi,用户 2026-07-12 拍板,不做二选一实测)。
//
// 本接口逐项对齐 Pi Agent 契约,真 Pi 集成 = 把这些回调映射到 Pi 的对应钩子(见 pi-engine.ts):
//   - tools              ↔ Pi `AgentState.tools`(白名单=物理可用工具集,SPEC §4.1)
//   - llm(EngineLlm)     ↔ Pi `Agent.streamFn`(§6.1 硬门:回接 model-config 的用户 provider)
//   - controller         ↔ Pi `shouldStopAfterTurn`(步数/预算硬顶,SPEC §4.2)
//   - decideDryRun       ↔ Pi `beforeToolCall`(干跑 / 工具门,SPEC §4.4)
//   - onStep             ↔ Pi `Agent.subscribe`(事件流 → ai_task_steps 步骤流,SPEC §4.3)
//   - signal             ↔ Pi `Agent.abort()` / `Agent.signal`(abort 贯通,SPEC §4.7)
//
// 默认实现 = 确定性引擎(deterministic-engine.ts):同一接口跑通框架 + 测试 + headless 真机。
// 真 Pi 就绪后替换引擎实现即可(执行器/适配器/护栏零改动)。
import type { z } from "zod";
import type { LoopController } from "./loop-control";

/**
 * 工具副作用等级 —— 我方护栏语义(Pi 无此概念,由我方在 decideDryRun/beforeToolCall 门用):
 *   - none      = 只读(搜/读/列),放开跑(SPEC §3 调研安全风险低);
 *   - writeback = 落库产物(知识写入/素材归类),经端口 pending / 确认门(铁律②);
 *   - publish   = 对外发布,**强制干跑**(SPEC §4.4);
 *   - delete    = 删除,**强制干跑**(SPEC §4.4)。
 */
export type ToolEffect = "none" | "writeback" | "publish" | "delete";

/** 领域工具执行入参(引擎调工具时给)。 */
export interface AgenticToolExecOpts {
  /** abort 贯通(引擎的 run signal 透传到工具;工具须尽早响应)。 */
  signal: AbortSignal;
  /**
   * 干跑:true → 工具只产「计划预告」不落真副作用(SPEC §4.4)。发布/删除类恒 true;
   * 搜索/抓取类默认 false(过程可续可停,产物过采纳门即可)。
   */
  dryRun: boolean;
  toolCallId?: string;
}

/** 领域工具一次执行的产出(回给引擎读,并累积进最终产物)。 */
export interface AgenticToolResult {
  /** 端口确认返回真实来源、实体、候选或执行回执；登录提示与空检索不算。 */
  hasEvidence?: boolean;
  /** 人话一句(喂步骤流 + 产物 summary)。 */
  summary: string;
  /** 结构化数据(引擎下一步决策读它;落最终产物)。 */
  data?: unknown;
  /** 干跑时的计划预告文本(dryRun=true 时给,人过目用)。 */
  plan?: string;
}

/**
 * 领域工具 —— 适配器把现有端口包成的引擎认的 tool(SPEC §3/T-256c)。对齐 Pi `AgentTool`:
 *   name/label/description/parameters/execute。effect 与 planInput 是我方护栏/确定性引擎附加。
 */
export interface AgenticTool {
  /** 工具名(白名单键;Pi AgentTool.name)。 */
  name: string;
  /** UI 可读标签(Pi AgentTool.label)。 */
  label: string;
  /** 给引擎看的能力描述(Pi AgentTool.description)。 */
  description: string;
  /** 副作用等级(我方护栏用;Pi 侧在 beforeToolCall 判)。 */
  effect: ToolEffect;
  /** 入参 zod schema(我方;真 Pi 用 typebox,pi-engine 适配层转换)。 */
  parameters: z.ZodTypeAny;
  /** 冻结的模型可见JSON Schema；实际执行仍由parameters及后端权限校验。 */
  jsonParameters?: Record<string, unknown>;
  /** 执行工具(引擎决策后调)。真 Pi:execute(toolCallId, params, signal, onUpdate) 的裁剪映射。 */
  execute(
    input: unknown,
    opts: AgenticToolExecOpts,
  ): Promise<AgenticToolResult>;
  /**
   * [确定性引擎专用] 据当前目标 + 已有产出确定性构造本工具入参(无 LLM 也能驱动链路)。
   * 真 Pi 不需要(入参由模型产)—— 仅供 deterministic-engine 跑通框架/测试。返回 undefined = 跳过。
   */
  planInput?: (goal: string, priorOutputs: Record<string, unknown>) => unknown;
}

/** 引擎每步「想」的 LLM 结果。 */
export interface EngineLlmResult {
  text: string;
  /** 本次调用烧的 token(端口不回则由调用方 estimateTokens 兜);喂预算硬顶。 */
  tokensUsed: number;
}

/**
 * [T-313] Pi 引擎专用 —— **§6.1 raw model-config**。Pi 做原生 function-calling,不吃
 * `EngineLlm` 文本端口(见 pi-engine.ts),须拿到 `resolveLlmConfig` 解析出的原始 provider
 * 配置(base_url + key + model + api_format + auth_style)自建 pi-ai custom provider。
 *
 * 结构与 `@creatoros/backend/modules/ai-runtime` 的 `ResolvedLlmConfig` 兼容(其超集可直接赋值),
 * 但在 engine.ts 里**只声明结构类型**(不 import ai 层,守分层:执行/引擎层不反向依赖 ai-runtime)。
 * 确定性引擎 / 测试忽略此字段(它们走 `llm` 文本端口)。
 */
export interface RawLlmConfig {
  apiFormat: "anthropic" | "openai_chat" | "openai_responses";
  baseUrl: string | null;
  model: string;
  authStyle: "bearer" | "x-api-key";
  token: string;
  /**
   * 用户每-capability 可配的自由参数(= ResolvedLlmConfig.settings,运行时经 buildAgenticLlmConfig
   * 透传)。pi-engine 从中读**用户配的** maxTokens / contextWindow / reasoning 等 —— 不再硬编造
   * pi-ai 模型描述符(SPEC「模型须可配」/ 用户 2026-07-14 拍板)。缺失字段各自兜底,不阻断。
   */
  settings?: Record<string, unknown>;
  displayModelKey?: "channel-managed";
}

/**
 * 引擎每步推理的 LLM 端口 —— **§6.1 硬门:回接 model-config**。
 * 真 Pi:映射为 `Agent.streamFn`(pi-ai OpenAI-compatible provider ← resolveLlmConfig 解析出的
 * 用户 provider:base_url + key + model)—— 引擎的自由循环仍烧用户配的模型,不引第二套模型解析。
 * 确定性引擎 / 测试:注入 fake(不碰网络)。
 */
export type EngineLlm = (
  prompt: string,
  opts?: { system?: string; maxTokens?: number },
) => Promise<EngineLlmResult>;

/** 一次自主循环运行的输入(执行器组装,喂引擎)。 */
export interface AgenticEngineRunInput {
  /** 任务目标(自然语言)。 */
  goal: string;
  /** 系统提示(角色/护栏说明)。 */
  systemPrompt: string;
  /** 可用领域工具集 = **工具白名单**(物理只暴露这些;引擎调不到别的,SPEC §4.1)。 */
  tools: readonly AgenticTool[];
  /** LLM 端口(§6.1 回接 model-config;确定性引擎每步「想」用)。 */
  llm: EngineLlm;
  /**
   * [T-313] raw model-config(§6.1)—— Pi 引擎自建 provider 用;确定性引擎忽略。
   * 执行器经 `deps.resolveLlmConfig(ctx)` 注入;未注入(deterministic-only 装配)→ undefined。
   */
  llmConfig?: RawLlmConfig;
  /** 循环控制器(步数/预算硬顶;Pi: shouldStopAfterTurn)。 */
  controller: LoopController;
  /** 干跑决策(每工具;Pi: beforeToolCall)。发布/删除恒 true,余按任务级 dryRun。 */
  decideDryRun: (tool: AgenticTool) => boolean;
  /** 步骤流上报(落 ai_task_steps;Pi: subscribe 事件流)。 */
  onStep: (text: string, kind?: string) => Promise<void>;
  /** abort 信号(贯通到引擎/工具;Pi: agent.abort)。 */
  signal: AbortSignal;
}

/** 一次自主循环的最终产物(执行器写 out/ → manifest → 确认门)。 */
export interface AgenticEngineFinal {
  /** 由工具回执累计，不依据模型的“已完成”文本。 */
  hasUsableOutput?: boolean;
  /** 实际完成本次执行的引擎，包含 fallback 后的真实来源。 */
  actualEngine?: string;
  /** 人话一句(整轮结论)。 */
  summary: string;
  /** 结构化产物(含 goal/各工具产出/工具调用日志/停因)。 */
  output: Record<string, unknown>;
  /** 实际走的步数。 */
  steps: number;
  /** 终止原因(诚实:干完了 vs 到顶被截断)。 */
  stopReason: string;
}

/** 自主任务引擎(Pi 形状)。name 供日志/关于页标识(deterministic | pi)。 */
export interface AgenticEngine {
  readonly name: string;
  run(input: AgenticEngineRunInput): Promise<AgenticEngineFinal>;
}
