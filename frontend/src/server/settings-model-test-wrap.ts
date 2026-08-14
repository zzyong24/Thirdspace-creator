import { ENDPOINTS, type Transport } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/contract";

/**
 * [T-377] 「测试连接」composition-only op(settings.models.test):wrap settings transport,
 * 拦 settings.models.test(module transport 不认它 —— 探测要各能力的解析器 + provider
 * adapter/registry,它们都住组合根,在 composition 层才可见,同 projects.transcribe 约定)。
 * 其余 op 透传。
 *
 * 探测策略(按 capability,走**现有解析链**解析已保存配置,再发最便宜的真实调用):
 *   - default / script.review(文本 LLM):resolveLlmConfig → 与正式聊天相同的
 *     modelFor + streamText 流式探针，且必须收到非空文本。测试层不再手拼 URL/请求体，
 *     避免把 HTML 200 或 2xx 空流误判为连通。
 *   - chat.fallback:resolveDedicatedLlm(只认专配行,不回退主模型)→ 同上最小流式探测。
 *   - asset.classify(视觉,OpenAI 兼容 chat):resolveMultimodal → 纯文本 1 token 补全
 *     (校验鉴权 + 模型可达;不传图,足以判连通)。
 *   - knowledge.search.embed:resolveEmbed → POST /embeddings 单短串(本就是最小调用)。
 *   - image.generate:resolveMultimodal → **真实最小生图调用**(供应商无免费探测端点;
 *     消耗少量额度 —— UI 文案已提示)。definitive:出字节 = 真连通。
 *   - video.generate:生视频分钟级且计费,不真生成 —— 对生成端点发**缺 prompt 的鉴权探测**
 *     (401/403 或 MiniMax base_resp 1004 → 鉴权失败;参数级报错 → 鉴权/端点可达)。
 *   - transcribe.audio:云端配置 → GET /v1/models 鉴权探测；未配置 → 中性说明本地 Whisper 回退。
 *   - web.search:resolveSearch → browser 免 key 直接 ✓;rss → GET 首个 feed URL;
 *     bocha/tavily/serpapi → 真实最小检索(1 条,消耗少量额度)。
 *
 * 诚实纪律:任何失败按「未配置」vs「配置了但调用失败:<真实原因>」分开表述,不吞不编。
 * 抽成独立工厂(非 persistence-client 内联)为可确定性单测:注入 fake 解析器 / fetch /
 * adapter 即可全路径验证,不必 boot pglite + 打真网络。
 */

export interface LlmSpecLite {
  apiFormat: "anthropic" | "openai_chat" | "openai_responses";
  baseUrl: string | null;
  model: string;
  authStyle: "bearer" | "x-api-key";
  token: string;
  displayModelKey?: "channel-managed";
}

export interface MmSpecLite {
  provider: string;
  baseUrl: string | null;
  model: string;
  token: string;
  displayModelKey?: "channel-managed";
}

export interface SearchSpecLite {
  provider: string;
  baseUrl: string | null;
  model: string | null;
  token: string;
  displayModelKey?: "channel-managed";
}

export interface ModelTestResult {
  ok: boolean;
  provider: string;
  model: string;
  detail: string;
  /** [T-384] 三态:"warn" = 无法探测但也无法证伪配置(诚实中间态,ok=true);
   *  缺省按 ok 二态解释(ok→"ok",!ok→"fail"),向后兼容。 */
  status?: "ok" | "warn" | "fail";
}

export interface SettingsModelTestDeps {
  settings: Transport;
  /** 文本 LLM 解析(default / script.review;三层回退)。未配 → 抛 LlmCredentialError。 */
  resolveLlm: (ctx: RequestContext, capability: string) => Promise<LlmSpecLite>;
  /** 备用对话模型:只认专配行,未配 → null(不回退主模型)。 */
  resolveDedicatedLlm: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<LlmSpecLite | null>;
  /** 多模态解析(image.generate / video.generate / asset.classify)。未配 → 抛
   *  MultimodalConfigError。 */
  resolveMultimodal: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<MmSpecLite>;
  /** ASR 解析：云端配置优先，未配返回 whisper-local。 */
  resolveTranscribe: (ctx: RequestContext) => Promise<MmSpecLite>;
  /** embedding 解析:未配 → null。 */
  resolveEmbed: (ctx: RequestContext) => Promise<LlmSpecLite | null>;
  /** 搜索解析:未配 → 抛 SearchConfigError。 */
  resolveSearch: (ctx: RequestContext) => Promise<SearchSpecLite>;
  /** 真实最小生图(image.generate 走真调用;host 绑 multimodal registry 的 generateImage)。 */
  generateImageMinimal: (spec: MmSpecLite) => Promise<{ byteLength: number }>;
  /** 真实最小检索(bocha/tavily/serpapi;host 绑 searchWeb + registry,count=1)。 */
  searchMinimal: (
    ctx: RequestContext,
    spec: SearchSpecLite,
  ) => Promise<number>;
  /**
   * 文本模型正式通路探针：host 必须用与聊天一致的 modelFor + streamText 实现。
   * 正文或思考流任一有内容均证明鉴权、端点与模型真实可达；二者全空才算失败。
   * 流内 error 必须抛出，不能被折叠成空响应。
   */
  probeTextModel: (
    spec: LlmSpecLite,
  ) => Promise<{ text: string; reasoningText?: string }>;
  fetchImpl: typeof fetch;
}

// ── 各家默认端点(与对应 adapter 内的 DEFAULT_BASE_URL 对齐;探测层本地镜像,不反向
//    依赖 adapter 私有常量)──────────────────────────────────────────────────────
const MINIMAX_DEFAULT = "https://api.minimax.io"; // multimodal-minimax DEFAULT_BASE_URL
const OMNIHI_VIDEO_DEFAULT = "https://api.omnihi.ai/media/v1";
const SILICONFLOW_ASR_DEFAULT = "https://api.siliconflow.cn"; // multimodal-openai-asr
const SILICONFLOW_V1_DEFAULT = "https://api.siliconflow.cn/v1"; // vision.ts baseURL 默认

const trimBase = (url: string): string => url.replace(/\/+$/, "");

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAuthenticationFailure(err: unknown): boolean {
  const message = errMsg(err).toLowerCase();
  return (
    /\b(?:401|403)\b/.test(message) ||
    /authentication(?:\s+fails?|\s+error)?/.test(message) ||
    /invalid[\s_-]*(?:api[\s_-]*)?key/.test(message) ||
    /(?:api[\s_-]*)?key[^.;,\n]{0,40}invalid/.test(message) ||
    /\bunauthorized\b|\bforbidden\b/.test(message)
  );
}

/**
 * 探测失败的技术细节(状态码 / 响应体 / 异常)只进 console,**绝不**渲染给用户;
 * prod 静默(与 lib/ai-error-humanize 的 describeUserError 同一纪律)。
 */
function logProbeFailure(
  where: string,
  detail: {
    category: string;
    status?: number;
    correlationId?: string;
  },
): void {
  // 渠道 payload、响应正文和 raw Error 均不得进入日志；只留稳定分类、状态码和关联号。
  console.error(`[settings.models.test] ${where}`, detail);
}

function resultIdentity(
  spec: { displayModelKey?: "channel-managed" },
  provider: string,
  model: string | null | undefined,
): Pick<ModelTestResult, "provider" | "model"> {
  if (spec.displayModelKey === "channel-managed") {
    return { provider: "channel-managed", model: "channel-managed" };
  }
  return { provider, model: model ?? "" };
}

export interface TextProbeStreamPart {
  type: string;
  text?: string;
  error?: unknown;
}

/**
 * AI SDK 的 `textStream` 不会把所有 provider 的流内错误重新抛给调用方；401 等错误可能只
 * 出现在 `fullStream` 的 error part，随后 textStream 以空文本结束。探针必须直接消费
 * fullStream，显式抛出 error，同时把 DeepSeek V4 等模型的 reasoning-delta 作为真实连通证据。
 */
export async function consumeTextProbeStream(
  stream: AsyncIterable<TextProbeStreamPart>,
): Promise<{ text: string; reasoningText: string }> {
  let text = "";
  let reasoningText = "";
  for await (const part of stream) {
    if (part.type === "error") {
      throw part.error;
    }
    if (part.type === "text-delta") {
      text += part.text ?? "";
    } else if (part.type === "reasoning-delta") {
      reasoningText += part.text ?? "";
    }
    // 测试的是连通性，不是回答质量；收到任一真实内容后立即结束，避免思考模型产生无谓费用。
    if (text.trim().length > 0 || reasoningText.trim().length > 0) {
      break;
    }
  }
  return { text, reasoningText };
}

// ── 文本类正式流式探针(Anthropic / Chat Completions / Responses)───────────────
async function textModelProbe(
  spec: LlmSpecLite,
  probe: SettingsModelTestDeps["probeTextModel"],
): Promise<{ ok: boolean; detail: string }> {
  try {
    const { text, reasoningText = "" } = await probe(spec);
    if (text.trim().length > 0) {
      return {
        ok: true,
        detail: "已按正式聊天通路完成流式回复,连通。",
      };
    }
    if (reasoningText.trim().length > 0) {
      return {
        ok: true,
        detail: "已收到模型思考流，鉴权、端点和模型均已连通。",
      };
    }
    logProbeFailure("textModelProbe/empty-stream", {
      category: "empty_stream",
    });
    return {
      ok: false,
      detail:
        "连接建立了，但模型没有返回有效文本。请核对 Base URL、协议和模型 ID。",
    };
  } catch (err) {
    logProbeFailure("textModelProbe", {
      category: isAuthenticationFailure(err)
        ? "authentication_error"
        : "provider_error",
    });
    if (isAuthenticationFailure(err)) {
      return {
        ok: false,
        detail: "密钥无效或无权限，请检查 API 密钥后重试。",
      };
    }
    return {
      ok: false,
      detail:
        "连接失败：请核对密钥、Base URL、接口格式和模型 ID 后重试。",
    };
  }
}

// ── 生成端点鉴权探测(video.generate:不真生成,发缺 prompt 请求判鉴权)────────────
async function generationAuthProbe(
  spec: MmSpecLite,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const provider = spec.provider.toLowerCase();
    const omnihi = provider === "omnihi" || provider === "seedance" || provider === "seeddance";
    const defaultBase = omnihi ? OMNIHI_VIDEO_DEFAULT : MINIMAX_DEFAULT;
    const h3 = provider === "minimax" && spec.model.trim().toLowerCase() === "minimax-h3";
    const path = omnihi
      ? "/videos/generations"
      : h3
        ? "/v2/video_generation"
        : "/v1/video_generation";
    const url = `${trimBase(spec.baseUrl ?? defaultBase)}${path}`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${spec.token}`,
      },
      // 故意不带 prompt:鉴权通过 → 参数级报错(不触发计费生成);鉴权失败 → 401/1004。
      body: JSON.stringify({ model: spec.model }),
    });
    if (res.status === 401 || res.status === 403) {
      logProbeFailure("generationAuthProbe/auth", {
        category: "authentication_error",
        status: res.status,
      });
      return {
        ok: false,
        detail: "密钥无效或无权限,请检查 API 密钥后重试。",
      };
    }
    // MiniMax 惯例:HTTP 200 + base_resp.status_code 载真实结果(1004=鉴权失败)。
    let parsed: { base_resp?: { status_code?: number; status_msg?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      /* 非 JSON → 按 HTTP 状态判 */
    }
    const code = parsed.base_resp?.status_code;
    if (code === 1004) {
      logProbeFailure("generationAuthProbe/1004", {
        category: "authentication_error",
        status: 1004,
      });
      return {
        ok: false,
        detail: "密钥无效或无权限,请检查 API 密钥后重试。",
      };
    }
    if (res.status >= 500) {
      logProbeFailure("generationAuthProbe/5xx", {
        category: "authority_unavailable",
        status: res.status,
      });
      return { ok: false, detail: "对方服务开小差了,请稍后重试。" };
    }
    return {
      ok: true,
      detail:
        "鉴权与端点可达(未实际生成视频 —— 生视频分钟级且计费,只校验了密钥与端点)。",
    };
  } catch {
    logProbeFailure("generationAuthProbe", { category: "network_error" });
    return {
      ok: false,
      detail: "连接失败,请检查网络和接口地址后重试。",
    };
  }
}

// ── OpenAI 兼容 GET /v1/models 鉴权探测(云端 ASR)────────────────────────────────
// [T-384] 三态:并非所有 OpenAI 兼容厂商/中转都有 /v1/models(SiliconFlow ASR 域等回 404)——
//   404/405 = 「端点不存在」而非「配置错」,无法证伪用户配置 → 回 ⚠ warn 诚实中间态,
//   不再误报 ✗ 失败(真机 T-384:用户配置本正常,被 404 判死)。鉴权类失败(401/403 等)照旧 ✗。
async function modelsListProbe(
  spec: MmSpecLite,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; detail: string; status?: "ok" | "warn" | "fail" }> {
  try {
    const base = trimBase(spec.baseUrl ?? SILICONFLOW_ASR_DEFAULT);
    const url = `${base.endsWith("/v1") ? base : `${base}/v1`}/models`;
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${spec.token}` },
    });
    if (res.ok) return { ok: true, status: "ok", detail: "鉴权通过(GET /v1/models 连通)。" };
    if (res.status === 404 || res.status === 405) {
      return {
        ok: true,
        status: "warn",
        detail:
          `无法探测(该厂商无 /v1/models 端点,HTTP ${res.status}),配置可能正常 —— 将在真实转写时验证。`,
      };
    }
    logProbeFailure("modelsListProbe", {
      category: "provider_rejected",
      status: res.status,
    });
    return {
      ok: false,
      status: "fail",
      detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
    };
  } catch {
    logProbeFailure("modelsListProbe", { category: "network_error" });
    return {
      ok: false,
      status: "fail",
      detail: "连接失败,请检查网络和接口地址后重试。",
    };
  }
}

// ── embedding 最小真实调用 ────────────────────────────────────────────────────────
async function embedProbe(
  spec: LlmSpecLite,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const url = `${trimBase(spec.baseUrl ?? SILICONFLOW_V1_DEFAULT)}/embeddings`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${spec.token}`,
      },
      body: JSON.stringify({ model: spec.model, input: "ping" }),
    });
    if (res.ok) return { ok: true, detail: "已算一条最小 embedding,连通。" };
    logProbeFailure("embedProbe", {
      category: "provider_rejected",
      status: res.status,
    });
    return {
      ok: false,
      detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
    };
  } catch {
    logProbeFailure("embedProbe", { category: "network_error" });
    return {
      ok: false,
      detail: "连接失败,请检查网络和接口地址后重试。",
    };
  }
}

/** 按 name 判「未配置」类错误(LlmCredentialError / MultimodalConfigError /
 *  SearchConfigError —— 跨包同名类 instanceof 不可靠,与 describeMultimodalFailure 同理)。 */
function isUnconfiguredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "LlmCredentialError" ||
    err.name === "MultimodalConfigError" ||
    err.name === "TranscribeConfigError" ||
    err.name === "SearchConfigError"
  );
}

export async function runModelConnectionTest(
  ctx: RequestContext,
  capability: string,
  deps: Omit<SettingsModelTestDeps, "settings">,
): Promise<ModelTestResult> {
  const { fetchImpl } = deps;
  const unconfigured = (msg: string): ModelTestResult => ({
    ok: false,
    provider: "",
    model: "",
    detail: `未配置:${msg}`,
  });

  try {
    switch (capability) {
      case "default":
      case "script.review": {
        const spec = await deps.resolveLlm(ctx, capability);
        const r = await textModelProbe(spec, deps.probeTextModel);
        return {
          ...r,
          ...resultIdentity(spec, spec.apiFormat, spec.model),
        };
      }
      case "chat.fallback": {
        const spec = await deps.resolveDedicatedLlm(ctx, capability);
        if (!spec) {
          return unconfigured(
            "备用对话模型只认专配行(不回退主模型),请先保存配置。",
          );
        }
        const r = await textModelProbe(spec, deps.probeTextModel);
        return {
          ...r,
          ...resultIdentity(spec, spec.apiFormat, spec.model),
        };
      }
      case "asset.classify": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        // 视觉卡走 OpenAI 兼容 chat:纯文本 1 token 补全足以校验鉴权 + 模型可达。
        const r = await textModelProbe(
          {
            apiFormat: "openai_chat",
            baseUrl: spec.baseUrl ?? SILICONFLOW_V1_DEFAULT,
            model: spec.model,
            authStyle: "bearer",
            token: spec.token,
            ...(spec.displayModelKey
              ? { displayModelKey: spec.displayModelKey }
              : {}),
          },
          deps.probeTextModel,
        );
        return {
          ...r,
          ...resultIdentity(spec, spec.provider, spec.model),
        };
      }
      case "knowledge.search.embed": {
        const spec = await deps.resolveEmbed(ctx);
        if (!spec) return unconfigured("请先保存语义搜索模型配置。");
        const r = await embedProbe(spec, fetchImpl);
        return {
          ...r,
          ...resultIdentity(spec, spec.apiFormat, spec.model),
        };
      }
      case "image.generate": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        // 供应商无免费生图探测端点 → 真实最小调用(消耗少量额度;UI 已提示)。
        try {
          const { byteLength } = await deps.generateImageMinimal(spec);
          if (byteLength > 0) {
            return {
              ok: true,
              ...resultIdentity(spec, spec.provider, spec.model),
              detail: "已真实生成一张最小测试图,连通(消耗了少量生图额度)。",
            };
          }
          logProbeFailure("image.generate", { category: "empty_result" });
          return {
            ok: false,
            ...resultIdentity(spec, spec.provider, spec.model),
            detail: "连接失败:没能生成测试图,请核对密钥与接口地址后重试。",
          };
        } catch {
          logProbeFailure("image.generate", {
            category: "provider_error",
          });
          return {
            ok: false,
            ...resultIdentity(spec, spec.provider, spec.model),
            detail: "连接失败,请检查网络和接口地址后重试。",
          };
        }
      }
      case "video.generate": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        const r = await generationAuthProbe(
          spec,
          fetchImpl,
        );
        return {
          ...r,
          ...resultIdentity(spec, spec.provider, spec.model),
        };
      }
      case "transcribe.audio": {
        const spec = await deps.resolveTranscribe(ctx);
        if (spec.provider === "whisper-local") {
          return {
            ok: true,
            status: "warn",
            ...resultIdentity(spec, spec.provider, spec.model),
            detail:
              "未配置云端 ASR，当前使用本地 Whisper；仍可转录，但处理时间可能更长。没有云端连接可测试。",
          };
        }
        const r = await modelsListProbe(spec, fetchImpl);
        return {
          ...r,
          ...resultIdentity(spec, spec.provider, spec.model),
        };
      }
      case "web.search": {
        const spec = await deps.resolveSearch(ctx);
        if (spec.provider === "browser") {
          return {
            ok: true,
            ...resultIdentity(spec, spec.provider, spec.model),
            detail: "浏览器搜索免 key,即开即用,无需连接测试。",
          };
        }
        if (spec.provider === "rss") {
          const firstFeed = (spec.baseUrl ?? "").split(",")[0]?.trim() ?? "";
          if (!firstFeed) {
            return unconfigured("rss 需在接口地址填 feed URL(逗号分隔多个)。");
          }
          try {
            const res = await fetchImpl(firstFeed, { method: "GET" });
            if (res.ok) {
              return {
                ok: true,
                ...resultIdentity(spec, spec.provider, ""),
                detail: "信源可达,连通。",
              };
            }
            logProbeFailure("web.search/rss", {
              category: "feed_unavailable",
              status: res.status,
            });
            return {
              ok: false,
              ...resultIdentity(spec, spec.provider, ""),
              detail: "热点拉取失败,请检查网络后重试。",
            };
          } catch {
            logProbeFailure("web.search/rss", {
              category: "network_error",
            });
            return {
              ok: false,
              ...resultIdentity(spec, spec.provider, ""),
              detail: "热点拉取失败,请检查网络后重试。",
            };
          }
        }
        // bocha / tavily / serpapi:真实最小检索(1 条,消耗少量额度)。
        try {
          const count = await deps.searchMinimal(ctx, spec);
          return {
            ok: true,
            ...resultIdentity(spec, spec.provider, spec.model),
            detail: `已发一次最小真实检索(返回 ${count} 条),连通(消耗少量检索额度)。`,
          };
        } catch {
          logProbeFailure("web.search", {
            category: "provider_error",
          });
          return {
            ok: false,
            ...resultIdentity(spec, spec.provider, spec.model),
            detail: "连接失败,请检查网络和接口地址后重试。",
          };
        }
      }
      default:
        return {
          ok: false,
          provider: "",
          model: "",
          detail: `该能力(${capability})暂无内置连接测试。`,
        };
    }
  } catch (err) {
    // 解析层抛错:未配置类 → 「未配置」;其它 → 人话兜底(技术原因只进 console)。
    if (isUnconfiguredError(err)) return unconfigured(errMsg(err));
    logProbeFailure("runModelConnectionTest", {
      category: "configuration_error",
    });
    return {
      ok: false,
      provider: "",
      model: "",
      detail: "连接失败,请检查网络和接口地址后重试。",
    };
  }
}

export function createSettingsWithModelTest(
  deps: SettingsModelTestDeps,
): Transport {
  const { settings, ...rest } = deps;
  return {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "settings.models.test") {
        if (!ctx) {
          throw new Error("AuthenticationError: model test requires ctx");
        }
        const { params } = (input ?? {}) as {
          params?: { capability?: string };
        };
        const capability = params?.capability ?? "";
        const result = await runModelConnectionTest(ctx, capability, rest);
        return { data: result, meta: { requestId: ctx.requestId } };
      }
      return settings.request(endpoint, input, ctx);
    },
  };
}

// 类型对齐锚:ENDPOINTS.testModelConnection 存在即编译期保证 op id 没打错。
void ENDPOINTS.testModelConnection;
