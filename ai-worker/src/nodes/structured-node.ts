import {
  generateObject,
  generateText,
  asSchema,
  NoObjectGeneratedError,
  type LanguageModel,
  type LanguageModelUsage,
  type FlexibleSchema,
} from "ai";
import { bindPrompt, type PromptTemplate } from "../prompt/template";
import {
  hasTemplate,
  registerAllTemplates,
  resolveOutputSchema,
  normalizeOfficialOutput,
  isCreativePartialOutput,
} from "../prompt/registry";
import { structuredProtocolCandidates } from "../prompt/creative-output-recovery";
import {
  getActiveEffectiveSkillSnapshot,
  getEffectiveSkill,
  getEffectiveTemplate,
  hasActiveEffectiveSkillSnapshot,
  resolveEffectiveOutputSchema,
} from "../prompt/effective-skill-runtime";
import {
  CompletionPolicyRuntimeError,
  enforceCompletionPolicy,
  evaluateCompletionPolicy,
  type CompletionPolicyViolation,
} from "../prompt/completion-policy";
import type { CompletionPolicyV1 } from "../prompt/effective-skill-types";

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
  /** 护栏:校验失败的最大重试次数(默认 0；显式配置才允许增加)。 */
  maxRetries?: number;
  /** 限制单次响应 token，避免小型结构化任务被超长输出拖慢。 */
  maxOutputTokens?: number;
  /**
   * 创作型业务的确定性归一化钩子。只允许把同一次模型输出整理成业务 schema
   * （如单值转数组、裁掉超长尾部、兼容包装层），不得补造模型没有表达的事实。
   * 判断/控制型任务默认不传，继续严格 fail-closed。
   */
  normalizeObject?: (raw: unknown) => unknown;
  /**
   * 少数 reasoning 模型会把最终 JSON 留在 reasoningText、正文为空。默认关闭；调用方必须
   * 提供原始对象完整性门，只有正文严格为空时才会读取同一响应的 reasoningText。
   */
  reasoningFallback?: {
    acceptRaw: (raw: unknown) => boolean;
  };
}

export interface RunStructuredNodeResult<T> {
  /** 已被 outputSchema 校验通过的结构化对象。 */
  object: T;
  generation: {
    finishReason: string;
    usage: StructuredNodeUsage;
    attempts: Array<{
      finishReason: string;
      usage: StructuredNodeUsage;
      kind: "initial" | "repair";
    }>;
  };
  validation?: {
    status: "valid" | "partial";
    errors: CompletionPolicyViolation[];
    policySnapshot: {
      policy: CompletionPolicyV1;
      adapter: { id: string; version: string };
    };
    originalSegmentCount: number;
    finalSegmentCount: number;
    repairAttemptsUsed: number;
    repairReasons: CompletionPolicyViolation[];
  };
}

export interface StructuredNodeUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
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

  // 不能用「第一个 { 到最后一个 }」：DeepSeek 等 reasoning 模型可能在 JSON 前后
  // 解释对象形状，旧算法会把两段花括号粘成一个必坏字符串。逐个起点做字符串感知的
  // 括号配对，返回第一个可解析对象；正文中的 { } 和 JSON 字符串里的转义括号都不干扰。
  for (let start = body.indexOf("{"); start !== -1; start = body.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < body.length; index += 1) {
      const char = body[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(body.slice(start, index + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // 当前起点不是完整 JSON，继续找下一个可能的对象起点。
          }
          break;
        }
      }
    }
  }
  return null;
}

/**
 * 部分 provider 在结构化响应被截断时抛 AI_JSONParseError / Invalid JSON response，而不是
 * NoObjectGeneratedError。只识别明确的 JSON 解析类信号，鉴权、网络、超时仍原样抛出。
 */
export function isStructuredResponseParseError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : "";
      const message =
        typeof record.message === "string" ? record.message : "";
      if (
        /(?:AI_)?JSONParseError/i.test(name) ||
        /invalid\s+json\s+(?:response|output)|json\s+parse\s+error/i.test(
          message,
        )
      ) {
        return true;
      }
      current = record.cause;
      continue;
    }
    break;
  }
  return false;
}

/**
 * 跑一次结构化模板节点 —— 解析 outputSchema(registry 收口,或显式覆盖)→ bindPrompt(模板,facets)
 * → generateObject(绑 outputSchema)。模型吐的 JSON 不合 schema 时 Vercel SDK 自动重试。
 *
 * 若 generateObject 落空(NoObjectGeneratedError —— 端点不可靠地不走结构化响应格式),**不放弃
 * schema 约束**:降级到 generateText + extractJsonObject + 用同一 schema 校验(asSchema().validate),
 * 小重试几次。两条路都拿不到合 schema 的对象才抛(调用方接住 → 任务进终态,绝不落一条编造的候选)。
 */
// [T-122] 单次模型调用硬超时(ms)。Vercel SDK 的 generateObject/generateText 默认**无超时**:
// 模型端点挂起(不响应也不报错)→ `await` 永不 settle → 调它的 AI 任务(script.review 审核 /
// topic.enrich 补全 / calibration.diagnose 等)永远卡 running,前端一直转圈。加 AbortSignal.timeout
// 把「挂起」变成「reject(TimeoutError)」→ 调用方的 try/catch 接住 → 任务进入真实失败终态。
// 任何有限超时都能抓住挂起;90s 给正常慢模型足够余量,又不至于让用户无限等。
const MODEL_CALL_TIMEOUT_MS = 90_000;

function normalizeUsage(usage: LanguageModelUsage | undefined): StructuredNodeUsage {
  const inputTokens =
    typeof usage?.inputTokens === "number" ? usage.inputTokens : null;
  const outputTokens =
    typeof usage?.outputTokens === "number" ? usage.outputTokens : null;
  const cachedTokens =
    typeof usage?.inputTokenDetails?.cacheReadTokens === "number"
      ? usage.inputTokenDetails.cacheReadTokens
      : null;
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens:
      inputTokens === null && outputTokens === null
        ? null
        : (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

function addUsage(
  left: StructuredNodeUsage,
  right: StructuredNodeUsage,
): StructuredNodeUsage {
  const add = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    inputTokens: add(left.inputTokens, right.inputTokens),
    outputTokens: add(left.outputTokens, right.outputTokens),
    cachedTokens: add(left.cachedTokens, right.cachedTokens),
    totalTokens: add(left.totalTokens, right.totalTokens),
  };
}

const EMPTY_USAGE: StructuredNodeUsage = {
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  totalTokens: null,
};

function repairPrompt(
  basePrompt: string,
  violations: readonly CompletionPolicyViolation[],
  previousOutput: unknown,
): string {
  const reasons = violations
    .map((violation, index) => `${index + 1}. ${violation.message}`)
    .join("\n");
  return `${basePrompt}

【上次输出未通过当前 Skill 的完整性策略，请修复后重新输出】
${reasons}
只修复以上声明式完整性问题，并继续严格遵守原 outputSchema。不要解释，不要省略结构字段。
上次结构化输出：
${JSON.stringify(previousOutput)}`;
}

export async function runStructuredNode<T>(
  input: RunStructuredNodeInput<T>,
): Promise<RunStructuredNodeResult<T>> {
  const startedAt = Date.now();
  let modelCalls = 0;
  let lastPath: "structured" | "text_fallback" | "unknown" = "unknown";
  const hasEffectiveScope = hasActiveEffectiveSkillSnapshot();
  // T-513:只要声明了 completionPolicy/adapter，就不允许从无 snapshot 的 legacy 路径
  // 启动模型调用；普通旧 Skill 在宿主逐入口迁移期间仍走 official registry。
  if (
    !hasEffectiveScope &&
    (input.template.completionPolicy ||
      input.template.completionPolicyAdapter)
  ) {
    getActiveEffectiveSkillSnapshot(); // typed SKILL_SNAPSHOT_MISSING
  }
  // active scope 下 method/template/required facets 必须全部来自 immutable snapshot，
  // 不信任调用方传入的同 id 伪造对象。无 scope 的无策略旧入口维持现状，等待宿主迁移。
  const template = hasEffectiveScope
    ? getEffectiveTemplate(input.template.id)
    : input.template;
  // 默认从 effective snapshot / legacy registry 取 outputSchema。显式 schema 仍可做动态
  // refine 逃生口，但返回前 completionPolicy 永远执行，不能借显式 schema 绕过策略。
  if (!hasEffectiveScope && !hasTemplate(template.id)) registerAllTemplates();
  const schema: FlexibleSchema<T> =
    input.outputSchema ??
    ((hasEffectiveScope
      ? resolveEffectiveOutputSchema(template.id)
      : resolveOutputSchema(template.id)) as FlexibleSchema<T>);

  const { system, prompt } = bindPrompt(template, input.facets);
  // DEC-AI-025:默认一次结构化尝试 + 一次文本协议降级。继续自动重试会让所有
  // 交互工具在同一坏输出上成倍等待；离线任务如确有需要必须由调用方显式声明。
  const maxRetries = input.maxRetries ?? 0;
  const policy = hasEffectiveScope
    ? getEffectiveSkill(template.id).effective.completionPolicy
    : null;
  const repairBudget = policy?.repairAttempts ?? 0;
  const attempts: RunStructuredNodeResult<T>["generation"]["attempts"] = [];
  let totalUsage = EMPTY_USAGE;
  let firstSegmentCount: number | null = null;
  let finalSegmentCount: number | null = null;
  const repairReasons: CompletionPolicyViolation[] = [];
  const logPerformance = (
    status: "ok" | "error",
    path: "structured" | "text_fallback" | "unknown",
  ) => {
    console.info(
      `[structured-node] template=${template.id} status=${status} durationMs=${Date.now() - startedAt} path=${path} modelCalls=${modelCalls} inputTokens=${totalUsage.inputTokens ?? 0} outputTokens=${totalUsage.outputTokens ?? 0}`,
    );
  };

  const generateOnce = async (
    currentPrompt: string,
  ): Promise<{
    object: T;
    finishReason: string;
    usage: StructuredNodeUsage;
    path: "structured" | "text_fallback";
  }> => {
    try {
      lastPath = "structured";
      modelCalls += 1;
      const result = await generateObject({
        model: input.model,
        system,
        prompt: currentPrompt,
        schema,
        maxRetries,
        maxOutputTokens: input.maxOutputTokens,
        // [T-122] 防端点挂起把任务永远卡 running(见 MODEL_CALL_TIMEOUT_MS 注释)。
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
      });
      return {
        object: result.object as T,
        finishReason: String(result.finishReason),
        usage: normalizeUsage(result.usage),
        path: "structured",
      };
    } catch (err) {
      // 只对「模型没产出结构化对象」降级(端点 tool-mode flaky);其它错误(鉴权/网络)照常抛。
      if (
        !NoObjectGeneratedError.isInstance(err) &&
        !isStructuredResponseParseError(err)
      ) {
        throw err;
      }

      // 文本兜底:把模型当成「只输出 JSON」用,宽容抽 JSON,再用同一 schema 校验。
      const validator = asSchema(schema);
      const validate = validator.validate?.bind(validator);
      if (!validate) throw err;
      lastPath = "text_fallback";
      let lastError: unknown = err;
      const textAttempts = Math.max(maxRetries, 0) + 1;
      let fallbackUsage = normalizeUsage(
        (err as { usage?: LanguageModelUsage }).usage,
      );

      const validateRaw = async (raw: unknown) => {
        let lastValidationError: unknown = new Error("没有可校验的结构化候选");
        for (const candidate of structuredProtocolCandidates(raw)) {
          try {
            const normalized = input.normalizeObject
              ? input.normalizeObject(candidate)
              : normalizeOfficialOutput(template.id, candidate);
            const result = await validate(normalized);
            if (result.success) return result;
            lastValidationError = result.error;
          } catch (normalizationError) {
            lastValidationError = normalizationError;
          }
        }
        return { success: false as const, error: lastValidationError };
      };

      // generateObject 校验失败时 SDK 会把已经生成的原文保存在 NoObjectGeneratedError.text。
      // 旧实现无视这份结果，再完整调用一次模型；创作型调用传 normalizer 后先在本地抢救，
      // 成功即一轮结束，既降低延迟，也避免第二次输出继续出现同类格式偏差。
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        const raw = extractJsonObject(err.text);
        if (raw !== null) {
          const validated = await validateRaw(raw);
          if (validated.success) {
            return {
              object: validated.value as T,
              finishReason: String(err.finishReason ?? "unknown"),
              usage: fallbackUsage,
              path: "text_fallback",
            };
          }
          lastError = validated.error;
        }
      }

      for (let i = 0; i < textAttempts; i++) {
        modelCalls += 1;
        const result = await generateText({
          model: input.model,
          system,
          prompt: currentPrompt,
          maxRetries: 0,
          maxOutputTokens: input.maxOutputTokens,
          abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
        });
        fallbackUsage = addUsage(fallbackUsage, normalizeUsage(result.usage));
        let raw = extractJsonObject(result.text);
        // T-766：只在正文为空且调用方显式开启时读取同一响应的 reasoningText。
        // 不读 error cause/provider metadata，不把原始 reasoning 写日志或返回给调用方。
        if (
          raw === null &&
          result.text.trim() === "" &&
          input.reasoningFallback
        ) {
          const reasoningRaw = extractJsonObject(result.reasoningText ?? "");
          if (
            reasoningRaw !== null &&
            input.reasoningFallback.acceptRaw(reasoningRaw)
          ) {
            raw = reasoningRaw;
          } else {
            lastError = new Error("reasoning 中没有完整合法的结构化对象");
          }
        }
        if (raw !== null) {
          const validated = await validateRaw(raw);
          if (validated.success) {
            return {
              object: validated.value as T,
              finishReason: String(result.finishReason),
              usage: fallbackUsage,
              path: "text_fallback",
            };
          }
          lastError = validated.error;
        }
      }
      throw new Error(
        "结构化节点:generateObject 落空,文本兜底仍未得到合 schema 的对象" +
          (lastError instanceof Error ? ` (${lastError.message})` : ""),
        { cause: lastError },
      );
    }
  };

  try {
    let currentPrompt = prompt;
    for (
      let repairAttempt = 0;
      repairAttempt <= repairBudget;
      repairAttempt += 1
    ) {
      const generated = await generateOnce(currentPrompt);
      lastPath = generated.path;
      attempts.push({
        finishReason: generated.finishReason,
        usage: generated.usage,
        kind: repairAttempt === 0 ? "initial" : "repair",
      });
      totalUsage = addUsage(totalUsage, generated.usage);

      let violations: CompletionPolicyViolation[] = [];
      let evaluation = null;
      if (hasEffectiveScope) {
        evaluation = evaluateCompletionPolicy(template.id, generated.object);
        if (evaluation) {
          firstSegmentCount ??= evaluation.segmentCount;
          finalSegmentCount = evaluation.segmentCount;
          violations = [...evaluation.errors];
        }
      }
      if (
        generated.finishReason === "length" ||
        generated.finishReason === "content-filter" ||
        generated.finishReason === "error"
      ) {
        violations.push({
          code: "OUTPUT_INCOMPLETE",
          path: "finishReason",
          message: `模型终止原因 ${generated.finishReason} 表明输出可能未完成`,
        });
      }

      if (violations.length === 0) {
        const enforced = hasEffectiveScope
          ? enforceCompletionPolicy(template.id, generated.object)
          : null;
        logPerformance("ok", generated.path);
        return {
          object: generated.object,
          generation: {
            finishReason: generated.finishReason,
            usage: totalUsage,
            attempts,
          },
          ...(enforced
            ? {
                validation: {
                  status: "valid" as const,
                  errors: [] as [],
                  policySnapshot: {
                    policy: structuredClone(enforced.policy),
                    adapter: structuredClone(enforced.adapter),
                  },
                  originalSegmentCount:
                    firstSegmentCount ?? enforced.segmentCount,
                  finalSegmentCount:
                    finalSegmentCount ?? enforced.segmentCount,
                  repairAttemptsUsed: repairAttempt,
                  repairReasons,
                },
              }
            : {}),
        };
      }

      repairReasons.push(...violations);
      if (repairAttempt >= repairBudget) {
        if (evaluation) {
          if (!isCreativePartialOutput(template.id)) {
            throw new CompletionPolicyRuntimeError(
              "COMPLETION_POLICY_REPAIR_EXHAUSTED",
              `skill "${template.id}" 输出未满足完整性策略，自动修复 ${repairBudget} 次后仍失败；请重试生成`,
              violations,
              firstSegmentCount,
              finalSegmentCount,
              undefined,
              {
                finishReason: generated.finishReason,
                usage: totalUsage,
                attempts,
              },
            );
          }
          // 创作结果优先：对象已经通过业务 outputSchema，只是镜数/角色完整度不足。
          // 保留为不可直接采纳的 partial 候选，由 UI 告诉用户缺什么；不能为了完整性
          // 把已生成内容清空，更不能在默认策略下整稿重写多遍。
          logPerformance("ok", generated.path);
          return {
            object: generated.object,
            generation: {
              finishReason: generated.finishReason,
              usage: totalUsage,
              attempts,
            },
            validation: {
              status: "partial",
              errors: violations,
              policySnapshot: {
                policy: structuredClone(evaluation.policy),
                adapter: structuredClone(evaluation.adapter),
              },
              originalSegmentCount:
                firstSegmentCount ?? evaluation.segmentCount,
              finalSegmentCount:
                finalSegmentCount ?? evaluation.segmentCount,
              repairAttemptsUsed: repairAttempt,
              repairReasons,
            },
          };
        }
        throw new Error(
          `结构化节点:模型输出未完整结束(${generated.finishReason})`,
        );
      }
      currentPrompt = repairPrompt(prompt, violations, generated.object);
    }

    throw new Error("结构化节点:不可达的 repair 状态");
  } catch (error) {
    logPerformance("error", lastPath);
    throw error;
  }
}
