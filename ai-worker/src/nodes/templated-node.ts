import type { LanguageModel } from "ai";
import { runAgentNode, type AgentStepEvent } from "../runtime/agent-runtime";
import { bindPrompt, type PromptTemplate } from "../prompt/template";

// 通用模板节点(脊柱-1)—— 任何"装配上下文 → 跑一次 agent → 拿最终文本"的纯生成 runner 共用一条路。
// 不内联任何 prompt:模板(skill)外置在 prompt/templates/,facets 由调用方(各 frontend runner)按
// CreativeContext 字段映射后注入。bindPrompt 缺必需 facet 直接报错(不静默拼空)。
// parse 逻辑留在调用方(各 runner 有自己的 JSON 约定);本节点只负责绑定 + 运行,返回 {text, steps}。
//
// script-node 是写文案的"专用"节点(产 ScriptShot[] 并在内部 parse);本节点是 6 个无工具
// 纯生成节点的"通用"壳 —— 一处建,六个 runner 共用。换方法论 = 换模板,不动本文件。

export interface RunTemplatedNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 该能力的外置提示词模板(= 一份可版本化的 skill)。 */
  template: PromptTemplate;
  /** 注入的 facets(由调用方按 CreativeContext 映射)。缺必需 facet → bindPrompt 报错。 */
  facets: Readonly<Record<string, string | undefined>>;
  /** 护栏:最大步数(默认 4,纯生成无工具,一步即出)。 */
  maxSteps?: number;
  /** 步骤回调 —— 喂窗口步骤日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
}

export interface RunTemplatedNodeResult {
  /** agent 最终文本(供调用方按各自 JSON 约定 parse)。 */
  text: string;
  /** 全部步骤事件(审计 + 日志)。 */
  steps: AgentStepEvent[];
}

/** 跑一次通用模板节点 —— bindPrompt(模板,facets) → runAgentNode → 返回 {text, steps}。 */
export async function runTemplatedNode(
  input: RunTemplatedNodeInput,
): Promise<RunTemplatedNodeResult> {
  const { system, prompt } = bindPrompt(input.template, input.facets);
  const res = await runAgentNode({
    model: input.model,
    system,
    prompt,
    maxSteps: input.maxSteps ?? 4,
    onStep: input.onStep,
  });
  return { text: res.text, steps: res.steps };
}
