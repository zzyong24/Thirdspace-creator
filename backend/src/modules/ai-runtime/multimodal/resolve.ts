import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import {
  channelMultimodalSpecFromRoute,
  resolveChannelCapabilityRoute,
  type ChannelModelPayload,
} from "../channel-model-config";

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
  | "image.edit"
  | "video.generate"
  | "transcribe.audio"
  // [T-055h SPEC §6.2 第二层] 素材 AI 归类:视觉模型看图打标签+一句话描述。
  | "asset.classify";

/** 与 ai-worker multimodal-factory.MultimodalSpec 结构对齐(见上方分层说明)。
 *  `kind:"audio"` 走 ASR(transcribeAudio),与 image/video 同结构、仅能力语义不同。 */
export interface MultimodalSpec {
  provider: string;
  baseUrl: string | null;
  model: string;
  token: string;
  kind: "image" | "video" | "audio" | "vision";
  /** 已验签渠道配置里的模型参数；适配器只读取各自认识且通过范围校验的字段。 */
  settings?: Record<string, unknown>;
  displayModelKey?: "channel-managed";
  /** 渠道受管凭据生命周期。persistent 继续从系统密钥库读取；per_request 必须在
   * 每次真实调用前向权益服务领取短效凭据，且只允许停留在本次调用内存中。 */
  credentialLifecycle?: "persistent" | "per_request";
  /** 仅供可信 server 组合层申请短效凭据，绝不进入用户界面或日志。 */
  serviceId?: string;
  /** 受管连接的签名协议族；适配器据此 fail-closed，禁止把未知协议当兼容接口调用。 */
  apiFormat?: string;
}

export interface ResolveMultimodalDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
  getChannelModelConfig?: () => Promise<ChannelModelPayload | null>;
  getChannelModelCredential?: (serviceId: string) => Promise<string | null>;
  getChannelModelSelection?: (capability: string) => Promise<string | null>;
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

/** ASR 专用兼容错误。默认解析已在 T-641 改为本地 Whisper 回退；该类型只保留给旧 host
 *  或显式注入的配置失败路径，让 runner 能精确收口而不残留 running 任务。 */
export class TranscribeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscribeConfigError";
  }
}

/** [T-376] 把 runner catch 到的失败分类成人话 —— 区分「未配置」vs「配置了但调用失败」,
 *  写进 task 步骤流末条(kind:"error"),前端失败卡原样展示。病根:此前 runner 把一切失败
 *  (key 无效/模型名不对/网络/审核/超时)统一吞成 cancelTask,UI 兜底文案一律「很可能是还没
 *  配置生图模型」—— 用户明明配了也被指去配置(2026-07-17 真机反馈)。 */
export function describeMultimodalFailure(err: unknown, label: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  // 按 name 判而非 instanceof:MultimodalConfigError 在本文件与 ai-worker multimodal-factory
  // 各有一份同名类(结构投影两处声明),instanceof 跨包/跨 dedupe 不可靠,name 两处一致。
  if (name === "MultimodalConfigError") {
    // resolve 层「未配置…去设置里配」全文自带指路;factory 层「未知 provider / 不支持该能力」
    // 也是配置问题,补上下文前缀。
    return msg.includes("未配置") ? msg : `${label}模型配置有问题:${msg}`;
  }
  // 文本 LLM 凭据错误(封面链先跑文案 LLM)—— 不冤枉生图配置。
  if (name === "LlmCredentialError") {
    return `文本模型凭据问题(非${label}模型):${msg}`;
  }
  return `${label}模型已配置,但调用失败:${msg}`;
}

type MultimodalKind = "image" | "video" | "audio" | "vision";

const CAP_TO_KIND: Record<MultimodalCapability, MultimodalKind> = {
  "image.generate": "image",
  "image.edit": "image",
  "video.generate": "video",
  "transcribe.audio": "audio",
  "asset.classify": "vision",
};

// 各能力的全局默认回退键(与文本层 "default" 平行,但多模态各档不混用一个 default ——
// 按 kind 分开回退:image.default / video.default / asr.default)。
const CAP_DEFAULT: Record<MultimodalCapability, string> = {
  "image.generate": "image.default",
  "image.edit": "image.edit.default",
  "video.generate": "video.default",
  "transcribe.audio": "asr.default",
  "asset.classify": "vision.default",
};

// "env:FOO" → env.FOO;trim;缺/空 → ""(cc-switch first_non_empty:空串占位必须 SKIP)。
// 与 llm/resolve.ts resolveSecret 同语义。
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m || !m[1]) return "";
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
  "image.edit": {
    secretRef: "CREATOROS_IMAGE_EDIT_SECRET_REF",
    baseUrl: "CREATOROS_IMAGE_EDIT_BASE_URL",
    provider: "CREATOROS_IMAGE_EDIT_PROVIDER",
    model: "CREATOROS_IMAGE_EDIT_MODEL",
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
  "asset.classify": {
    secretRef: "CREATOROS_VISION_SECRET_REF",
    baseUrl: "CREATOROS_VISION_BASE_URL",
    provider: "CREATOROS_VISION_PROVIDER",
    model: "CREATOROS_VISION_MODEL",
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
  source?:'official'|'self',
): Promise<MultimodalSpec> {
  const { env } = deps;
  const kind = CAP_TO_KIND[capability];
  const channel = source==='self'?null:await deps.getChannelModelConfig?.();
  const selectedOptionId = source==='self'?undefined:await deps.getChannelModelSelection?.(capability);
  if (channel) {
    const route = resolveChannelCapabilityRoute(channel, capability, {
      selectedOptionId,
    });
    if (route && route.kind === kind) {
      // per_request短时凭据在真实派发前领取，不触碰本机长期凭据读取器。
      const credential = route.credentialLifecycle !== "per_request" && route.serviceId
        ? await deps.getChannelModelCredential?.(route.serviceId)
        : null;
      return channelMultimodalSpecFromRoute(route, credential);
    }
  }
  if(source==='official')throw new MultimodalConfigError('所选官方模型尚未提供该能力，请检查官方配置；来源未切换。');

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

  if (capability === "image.edit") {
    // T-831：官方托管渠道按 capability 独立裁决。若官方已经接管 image.generate，
    // 参考图就只能由官方明确声明的 image.edit 承担，不能偷偷拿本地文生图配置替代。
    // 反之，本地自配（包括既有 Dudu/OpenAI-compatible 中转站）继续兼容复用原来的
    // image.generate/image.default 与 CREATOROS_IMAGE_*，不要求用户重复配置一份 Key。
    const channelImageGenerate = channel
      ? resolveChannelCapabilityRoute(channel, "image.generate", {
          selectedOptionId:
            await deps.getChannelModelSelection?.("image.generate"),
        })
      : null;
    if (channelImageGenerate?.kind === "image") {
      throw new MultimodalConfigError(
        "官方渠道暂未配置参考图模型（image.edit），已停止调用以免把文生图模型误送到图片编辑接口。",
      );
    }

    const legacyGenerate = tryDbRow(
      await deps.getModelConfig(ctx, "image.generate"),
      kind,
      env,
    );
    if (legacyGenerate) return legacyGenerate;
    const legacyDefault = tryDbRow(
      await deps.getModelConfig(ctx, "image.default"),
      kind,
      env,
    );
    if (legacyDefault) return legacyDefault;
    const legacyEnv = tryEnvRow("image.generate", kind, env);
    if (legacyEnv) return legacyEnv;
  }

  // Tier 3 — 未配:诚实抛错(不假装能生成)。
  const label =
    kind === "image" ? "生图" : kind === "video" ? "生视频" : "逐字稿转写";
  throw new MultimodalConfigError(
    `capability "${capability}" 未配置${label}模型:请在设置里为 ${capability} 配 provider/model/key,` +
      `或设置 .env.local 的 ${ENV_KEYS[capability].provider}/${ENV_KEYS[capability].model}/${ENV_KEYS[capability].secretRef}`,
  );
}

// 本地 Whisper 回退 provider 名（与 ai-worker registry 的 "whisper-local" 对齐）。
export const WHISPER_LOCAL_PROVIDER = "whisper-local";
const DEFAULT_WHISPER_LEVEL = "small";
const VALID_WHISPER_LEVELS: ReadonlySet<string> = new Set([
  "tiny",
  "base",
  "small",
  "medium",
]);

function resolveWhisperLevel(env: Record<string, string | undefined>): string {
  const raw = env.CREATOROS_WHISPER_LEVEL?.trim().toLowerCase();
  return raw && VALID_WHISPER_LEVELS.has(raw) ? raw : DEFAULT_WHISPER_LEVEL;
}

/**
 * ASR 逐字稿模型解析(T-641)—— 用户云端配置优先；完全未配置时回退本地 Whisper。
 * 本地回退保证新用户无需先申请第三方 Key 也能完成逐字稿，只是处理时间可能更长。
 * 返回的 spec.kind === "audio",喂给 ai-worker `transcribeAudio` 工厂(按 provider 取 ASR adapter)。
 */
export async function resolveTranscribeSpec(
  ctx: RequestContext,
  deps: ResolveMultimodalDeps,
  source?:'official'|'self'|'local',
): Promise<MultimodalSpec> {
  if(source==='local')return {provider:WHISPER_LOCAL_PROVIDER,baseUrl:null,model:resolveWhisperLevel(deps.env),token:'',kind:'audio'};
  // 显式来源的本地降级由原任务冻结策略决定，不能在这里丢失已选来源或未知远端回合。
  if(source!==undefined)return resolveMultimodalSpec(ctx,'transcribe.audio',deps,source);
  try {
    return await resolveMultimodalSpec(ctx, "transcribe.audio", deps);
  } catch {
    // T-768：任何在线/渠道配置解析失败都丢弃不可信路径并使用本地 Whisper。
    // 这里不继续使用异常携带的配置，也不把底层错误投影到用户表面。
    return {
      provider: WHISPER_LOCAL_PROVIDER,
      baseUrl: null,
      model: resolveWhisperLevel(deps.env),
      token: "",
      kind: "audio",
    };
  }
}
