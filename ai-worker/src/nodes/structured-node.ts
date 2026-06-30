import { generateObject, type LanguageModel, type FlexibleSchema } from "ai";
import { bindPrompt, type PromptTemplate } from "../prompt/template";
import {
  hasTemplate,
  registerAllTemplates,
  resolveOutputSchema,
} from "../prompt/registry";

// 结构化模板节点(每轮 schema 约束脊梁,SPEC §4.2)—— 任何「装配上下文 → 跑一次模型 →
// 拿一个被 schema 卡死的结构化对象」的节点共用一条路。与 templated-node(generateText 拿自由
// 文本、parse 留调用方)不同:本节点用 Vercel AI SDK 的 generateObject 绑 outputSchema,
// 模型必须吐合 schema 的 JSON,**校验失败由 SDK 自动重试**(防发散)——这正是宪法 §9 铁律4 /
// data-foundation SPEC §4.2 要求的「每轮输出被 schema 约束」。
//
// 收口(本任务,SPEC §4.2 统一防发散入口):outputSchema **从 registry 取**(skill 三位一体的
// 「输出 Zod schema」位),不再散落在 template 文件由调用方手传。registry 的 resolveOutputSchema
// 还吃 JSON Schema 配置覆盖(SPEC §4.3 口子):后台下发新契约 → 运行时这里自动套用,不改代码。
// 调用方仍可显式传 outputSchema 作逃生口(优先级最高),但默认走 registry 收口。
//
// 不内联任何 prompt:模板(skill)外置在 prompt/templates/;facets 由调用方按 CreativeContext +
// 真实数据映射后注入。bindPrompt 缺必需 facet 直接报错(不静默拼空)。

export interface RunStructuredNodeInput<T> {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 该能力的外置提示词模板(= 一份可版本化的 skill)。其 id 用于从 registry 取 outputSchema。 */
  template: PromptTemplate;
  /** 注入的 facets(由调用方按 CreativeContext + 真实数据映射)。缺必需 facet → bindPrompt 报错。 */
  facets: Readonly<Record<string, string | undefined>>;
  /**
   * 输出契约(= skill 的 outputSchema)。**默认从 registry 取**(resolveOutputSchema，统一收口 +
   * 吃 JSON Schema 配置覆盖);显式传入即作逃生口覆盖 registry。generateObject 绑它校验 + 不符自动重试。
   */
  outputSchema?: FlexibleSchema<T>;
  /** 护栏:校验失败的最大重试次数(默认 2,Vercel SDK 透传)。 */
  maxRetries?: number;
}

export interface RunStructuredNodeResult<T> {
  /** 已被 outputSchema 校验通过的结构化对象。 */
  object: T;
}

/**
 * 跑一次结构化模板节点 —— 解析 outputSchema(registry 收口,或显式覆盖)→ bindPrompt(模板,facets)
 * → generateObject(绑 outputSchema) → 返回已校验对象。模型吐的 JSON 不合 schema 时,Vercel SDK
 * 自动重试(maxRetries);仍不合则抛(调用方接住 → 任务进终态,绝不落一条编造的候选)。
 */
export async function runStructuredNode<T>(
  input: RunStructuredNodeInput<T>,
): Promise<RunStructuredNodeResult<T>> {
  // 默认从 registry 取 outputSchema(统一防发散入口 + 吃 JSON Schema 配置覆盖)。registry 未被
  // 宿主显式 bootstrap 时,惰性全量注册一次(幂等),保证 frontend 直接调本节点也能收口到 registry。
  if (!hasTemplate(input.template.id)) registerAllTemplates();
  const schema: FlexibleSchema<T> =
    input.outputSchema ??
    (resolveOutputSchema(input.template.id) as FlexibleSchema<T>);

  const { system, prompt } = bindPrompt(input.template, input.facets);
  const { object } = await generateObject({
    model: input.model,
    system,
    prompt,
    schema,
    maxRetries: input.maxRetries ?? 2,
  });
  return { object: object as T };
}
