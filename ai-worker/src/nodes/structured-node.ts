import {
  generateObject,
  generateText,
  asSchema,
  NoObjectGeneratedError,
  type LanguageModel,
  type FlexibleSchema,
} from "ai";
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
// 跨模型健壮性(L2 实测修复):generateObject 默认走 provider 的 **tool/json 响应格式**,但
// 部分 anthropic-兼容端点(如 MiniMax-M3)对复杂多字段 schema 不可靠地不调合成工具、改吐纯
// 文本 → SDK 抛 NoObjectGeneratedError(「the model did not return a response」),任务失败。
// 这不是 schema 不对(同一 schema 在 Claude / 短 prompt 下成功),而是 tool-mode 在该端点 flaky。
// 故本节点降级**不放弃 schema 约束**:generateObject 落空时,fall back 到 generateText 把模型
// 当成「只输出 JSON」用,宽容抽出 JSON 对象,再用**同一 schema** 校验(asSchema().validate,
// Zod / JSON-Schema 覆盖两条路都吃);小重试几次仍不合再抛。实测 MiniMax 在文本模式下稳定吐
// 合 schema 的 fenced JSON(钩子/案例/数据点/金句四类齐全),从而「任何模型都产可解析输出」。
//
// 收口(SPEC §4.2 统一防发散入口):outputSchema **从 registry 取**(skill 三位一体的「输出 Zod
// schema」位),不再散落在 template 文件由调用方手传。registry 的 resolveOutputSchema 还吃 JSON
// Schema 配置覆盖(SPEC §4.3 口子)。调用方仍可显式传 outputSchema 作逃生口(优先级最高)。

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
  /** 护栏:校验失败的最大重试次数(默认 2,Vercel SDK 透传 generateObject;文本兜底独立重试)。 */
  maxRetries?: number;
}

export interface RunStructuredNodeResult<T> {
  /** 已被 outputSchema 校验通过的结构化对象。 */
  object: T;
}

/**
 * 宽容地从模型自由文本里抽出**一个 JSON 对象**(容忍 ``` 包裹 / 前后散文)。抽不出返回 null。
 * 纯函数,确定性,无副作用 —— 文本兜底路径用它把模型当成「只输出 JSON」处理。
 */
export function extractJsonObject(text: string): unknown {
  if (!text) return null;
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * 跑一次结构化模板节点 —— 解析 outputSchema(registry 收口,或显式覆盖)→ bindPrompt(模板,facets)
 * → generateObject(绑 outputSchema)。模型吐的 JSON 不合 schema 时 Vercel SDK 自动重试。
 *
 * 若 generateObject 落空(NoObjectGeneratedError —— 端点不可靠地不走结构化响应格式),**不放弃
 * schema 约束**:降级到 generateText + extractJsonObject + 用同一 schema 校验(asSchema().validate),
 * 小重试几次。两条路都拿不到合 schema 的对象才抛(调用方接住 → 任务进终态,绝不落一条编造的候选)。
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
  const maxRetries = input.maxRetries ?? 2;

  try {
    const { object } = await generateObject({
      model: input.model,
      system,
      prompt,
      schema,
      maxRetries,
    });
    return { object: object as T };
  } catch (err) {
    // 只对「模型没产出结构化对象」降级(端点 tool-mode flaky);其它错误(鉴权/网络)照常抛。
    if (!NoObjectGeneratedError.isInstance(err)) throw err;

    // 文本兜底:把模型当成「只输出 JSON」用,宽容抽 JSON,再用同一 schema 校验。
    const validator = asSchema(schema);
    const validate = validator.validate?.bind(validator);
    if (!validate) throw err; // schema 无 validate(理论不至于)→ 维持原失败
    let lastError: unknown = err;
    const textAttempts = Math.max(maxRetries, 1) + 1;
    for (let i = 0; i < textAttempts; i++) {
      const { text } = await generateText({
        model: input.model,
        system,
        prompt,
        maxRetries: 0,
      });
      const raw = extractJsonObject(text);
      if (raw !== null) {
        const result = await validate(raw);
        if (result.success) return { object: result.value as T };
        lastError = result.error;
      }
    }
    throw new Error(
      "结构化节点:generateObject 落空,文本兜底仍未得到合 schema 的对象" +
        (lastError instanceof Error ? ` (${lastError.message})` : ""),
      { cause: lastError },
    );
  }
}
