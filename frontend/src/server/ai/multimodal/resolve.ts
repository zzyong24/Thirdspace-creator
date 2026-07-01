import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";

// 多模态 model-config 解析(SPEC 2026-07-01 §2.2 / §8 M1)—— 与文本 `resolveLlmConfig`
// (../llm/resolve.ts)**并列**的一层:把用户在 model_configurations 表里为 image.generate /
// video.generate 两个 capability 配的 provider/model/baseUrl/key,按同款优先级(库存密钥 >
// env > 内置默认)投影成 MultimodalSpec,喂给 ai-worker 的多模态 provider 工厂。
//
// 分层沿用文本层的既定切分:**解析(读 ctx + DB row)在 frontend,provider 调用(SDK/REST)
// 在 ai-worker**。故此处的 `MultimodalSpec` 是与 ai-worker `multimodal-factory.ts` 里那份
// **结构对齐的本地声明**(和 frontend `ResolvedLlmConfig` vs ai-worker `ModelSpec` 完全同样的
// 两处独立声明、结构投影——resolve 层不反向依赖 factory 层的实现)。

/** capability 约定串(SPEC §2.1 / §5.1,复用 model_configurations 表,零 schema 改)。
 *  `transcribe.audio`(逐字稿 ASR,T-030-D1)与 image/video 并列——同一张 model_configurations
 *  表、同一条解析优先级,仅 kind/env 前缀不同。capability 在 contract 全线是自由字符串
 *  (settings/ai resources 皆 `z.string()`,无枚举校验),故新增此值零 contract 改动。 */
export type MultimodalCapability =
  | "image.generate"
  | "video.generate"
  | "transcribe.audio";

/** 与 ai-worker multimodal-factory.MultimodalSpec 结构对齐(见上方分层说明)。
 *  `kind:"audio"` 走 ASR(transcribeAudio),与 image/video 同结构、仅能力语义不同。 */
export interface MultimodalSpec {
  provider: string;
  baseUrl: string | null;
  model: string;
  token: string;
  kind: "image" | "video" | "audio";
}

export interface ResolveMultimodalDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
}

/** 未配 / 无凭据 —— 上层(asset.generate runner)接住 → cancelTask + 录制页显
 *  「未配置生图/生视频模型,去设置配」(SPEC §2.1 诚实禁用),不假装能生成。与文本
 *  LlmCredentialError 平行。 */
export class MultimodalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultimodalConfigError";
  }
}

/** 未配 / 无凭据的 ASR 专用错误(T-030-D1)—— 与 MultimodalConfigError 平行,但让上层
 *  (D2 transcribe-runner)能按类型精确接住「逐字稿未配」→ 停任务 + 引导去设置配 ASR,
 *  区别于图/视频的 MultimodalConfigError。语义同款(诚实禁用,不假装能转写)。 */
export class TranscribeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscribeConfigError";
  }
}

type MultimodalKind = "image" | "video" | "audio";

const CAP_TO_KIND: Record<MultimodalCapability, MultimodalKind> = {
  "image.generate": "image",
  "video.generate": "video",
  "transcribe.audio": "audio",
};

// 各能力的全局默认回退键(与文本层 "default" 平行,但多模态各档不混用一个 default ——
// 按 kind 分开回退:image.default / video.default / asr.default)。
const CAP_DEFAULT: Record<MultimodalCapability, string> = {
  "image.generate": "image.default",
  "video.generate": "video.default",
  "transcribe.audio": "asr.default",
};

// "env:FOO" → env.FOO;trim;缺/空 → ""(cc-switch first_non_empty:空串占位必须 SKIP)。
// 与 llm/resolve.ts resolveSecret 同语义。
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m) return "";
  return (env[m[1]] ?? "").trim();
}

// 从一条 DB row 投影成 MultimodalSpec,无可用 token 时返 null(库存 secretValue 优先于
// env-ref secretReference —— cc-switch first_non_empty,与文本层 tryDbRow 一致)。
function tryDbRow(
  row: ModelConfigInternal | null,
  kind: MultimodalKind,
  env: Record<string, string | undefined>,
): MultimodalSpec | null {
  if (!row) return null;
  const token =
    row.secretValue?.trim() || resolveSecret(row.secretReference, env);
  if (!token) return null;
  return {
    provider: row.provider,
    baseUrl: row.baseUrl ?? null,
    model: row.modelName,
    token,
    kind,
  };
}

// env 默认档的变量名(与文本层 CREATOROS_LLM_* 并列;图/视频各一组)。
const ENV_KEYS: Record<
  MultimodalCapability,
  { secretRef: string; baseUrl: string; provider: string; model: string }
> = {
  "image.generate": {
    secretRef: "CREATOROS_IMAGE_SECRET_REF",
    baseUrl: "CREATOROS_IMAGE_BASE_URL",
    provider: "CREATOROS_IMAGE_PROVIDER",
    model: "CREATOROS_IMAGE_MODEL",
  },
  "video.generate": {
    secretRef: "CREATOROS_VIDEO_SECRET_REF",
    baseUrl: "CREATOROS_VIDEO_BASE_URL",
    provider: "CREATOROS_VIDEO_PROVIDER",
    model: "CREATOROS_VIDEO_MODEL",
  },
  "transcribe.audio": {
    secretRef: "CREATOROS_ASR_SECRET_REF",
    baseUrl: "CREATOROS_ASR_BASE_URL",
    provider: "CREATOROS_ASR_PROVIDER",
    model: "CREATOROS_ASR_MODEL",
  },
};

// 内置默认(仅当 env 指了 provider/model 才成立 —— 多模态**没有**像文本 anthropic 官方那样的
// 免配兜底:图/视频必须真配 provider+model+key,否则诚实抛错)。这里返回 env 档,tier 3 交由
// resolveMultimodalSpec 收尾抛 MultimodalConfigError。
function tryEnvRow(
  cap: MultimodalCapability,
  kind: MultimodalKind,
  env: Record<string, string | undefined>,
): MultimodalSpec | null {
  const keys = ENV_KEYS[cap];
  const token = resolveSecret(env[keys.secretRef], env);
  if (!token) return null;
  const provider = env[keys.provider]?.trim();
  const model = env[keys.model]?.trim();
  // provider/model 是多模态分派与调用的必要项,缺则不成档(不瞎猜默认 provider)。
  if (!provider || !model) return null;
  return {
    provider,
    baseUrl: env[keys.baseUrl]?.trim() || null,
    model,
    token,
    kind,
  };
}

/**
 * 仿 resolveLlmConfig 优先级把 capability 解析成 MultimodalSpec:
 *   Tier 1 库存密钥:按 capability 查 model_configurations 行,未命中回退该 kind 的默认行
 *                    (image.default / video.default);库存 secretValue > env-ref。
 *   Tier 2 env 默认:CREATOROS_IMAGE_* / CREATOROS_VIDEO_*(需 provider+model+key 齐全)。
 *   Tier 3 未配:抛 MultimodalConfigError(上层 → cancelTask + UI「未配置生图/生视频模型」)。
 * 与文本层唯一实质差异:多模态无「anthropic 官方免配兜底」——生图/生视频必须真配,不假装能跑。
 */
export async function resolveMultimodalSpec(
  ctx: RequestContext,
  capability: MultimodalCapability,
  deps: ResolveMultimodalDeps,
): Promise<MultimodalSpec> {
  const { env } = deps;
  const kind = CAP_TO_KIND[capability];

  // Tier 1 — 用户配的 DB row(先 per-capability,再该 kind 的默认行)。
  const fromCap = tryDbRow(await deps.getModelConfig(ctx, capability), kind, env);
  if (fromCap) return fromCap;
  const defaultCap = CAP_DEFAULT[capability];
  const fromDefault = tryDbRow(
    await deps.getModelConfig(ctx, defaultCap),
    kind,
    env,
  );
  if (fromDefault) return fromDefault;

  // Tier 2 — env 默认档。
  const fromEnv = tryEnvRow(capability, kind, env);
  if (fromEnv) return fromEnv;

  // Tier 3 — 未配:诚实抛错(不假装能生成)。
  const label =
    kind === "image" ? "生图" : kind === "video" ? "生视频" : "逐字稿转写";
  throw new MultimodalConfigError(
    `capability "${capability}" 未配置${label}模型:请在设置里为 ${capability} 配 provider/model/key,` +
      `或设置 .env.local 的 ${ENV_KEYS[capability].provider}/${ENV_KEYS[capability].model}/${ENV_KEYS[capability].secretRef}`,
  );
}

/**
 * ASR 逐字稿模型解析(T-030-D1,SPEC §5.1)—— 与 image/video **完全同款**的三层回退,只是
 * capability 固定为 `transcribe.audio`、错误类型换成 `TranscribeConfigError`(供 D2
 * transcribe-runner 按类型精确接住「逐字稿未配」)。
 *   Tier 1 库存密钥:transcribe.audio 行 → asr.default 行;库存 secretValue > env-ref。
 *   Tier 2 env 默认:CREATOROS_ASR_*(需 provider+model+key 齐全)。
 *   Tier 3 未配:抛 TranscribeConfigError(上层 → 停任务 + UI「未配置逐字稿模型,去设置配」)。
 * 返回的 spec.kind === "audio",喂给 ai-worker `transcribeAudio` 工厂(按 provider 取 ASR adapter)。
 */
export async function resolveTranscribeSpec(
  ctx: RequestContext,
  deps: ResolveMultimodalDeps,
): Promise<MultimodalSpec> {
  try {
    return await resolveMultimodalSpec(ctx, "transcribe.audio", deps);
  } catch (err) {
    // 复用 resolveMultimodalSpec 的三层回退,仅把「未配」错误换成 ASR 专用类型(保留原文)。
    if (err instanceof MultimodalConfigError) {
      throw new TranscribeConfigError(err.message);
    }
    throw err;
  }
}
