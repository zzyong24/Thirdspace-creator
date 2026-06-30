import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { bindPrompt, type PromptTemplate } from "../prompt/template";

// 结构化模板节点(每轮 schema 约束脊梁,SPEC §4.2)—— 任何「装配上下文 → 跑一次模型 →
// 拿一个被 Zod 卡死的结构化对象」的节点共用一条路。与 templated-node(generateText 拿自由
// 文本、parse 留调用方)不同:本节点用 Vercel AI SDK 的 generateObject 绑 outputSchema,
// 模型必须吐合 schema 的 JSON,**校验失败由 SDK 自动重试**(防发散)——这正是宪法 §9 铁律4 /
// data-foundation SPEC §4.2 要求的「每轮输出被 schema 约束」。
//
// 不内联任何 prompt:模板(skill)外置在 prompt/templates/;facets 由调用方按 CreativeContext +
// 真实数据映射后注入。bindPrompt 缺必需 facet 直接报错(不静默拼空)。outputSchema 由调用方传
// (= skill 的输出契约),本节点只负责绑定 + 运行 + 返回已校验对象。

export interface RunStructuredNodeInput<T> {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 该能力的外置提示词模板(= 一份可版本化的 skill)。 */
  template: PromptTemplate;
  /** 注入的 facets(由调用方按 CreativeContext + 真实数据映射)。缺必需 facet → bindPrompt 报错。 */
  facets: Readonly<Record<string, string | undefined>>;
  /** 输出契约(= skill 的 outputSchema)。generateObject 绑它校验 + 不符自动重试。 */
  outputSchema: z.ZodType<T>;
  /** 护栏:校验失败的最大重试次数(默认 2,Vercel SDK 透传)。 */
  maxRetries?: number;
}

export interface RunStructuredNodeResult<T> {
  /** 已被 outputSchema 校验通过的结构化对象。 */
  object: T;
}

/**
 * 跑一次结构化模板节点 —— bindPrompt(模板,facets) → generateObject(绑 outputSchema) →
 * 返回已校验对象。模型吐的 JSON 不合 schema 时,Vercel SDK 自动重试(maxRetries);仍不合则抛
 * (调用方接住 → 任务进终态,绝不落一条编造的候选)。
 */
export async function runStructuredNode<T>(
  input: RunStructuredNodeInput<T>,
): Promise<RunStructuredNodeResult<T>> {
  const { system, prompt } = bindPrompt(input.template, input.facets);
  const { object } = await generateObject({
    model: input.model,
    system,
    prompt,
    schema: input.outputSchema,
    maxRetries: input.maxRetries ?? 2,
  });
  return { object };
}
