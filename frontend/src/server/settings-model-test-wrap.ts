import { ENDPOINTS, type Transport } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/contract";

/**
 * [T-377] 「测试连接」composition-only op(settings.models.test):wrap settings transport,
 * 拦 settings.models.test(module transport 不认它 —— 探测要各能力的解析器 + provider
 * adapter/registry,它们都住组合根,在 composition 层才可见,同 projects.transcribe 约定)。
 * 其余 op 透传。
 *
 * 探测策略(按 capability,走**现有解析链**解析已保存配置,再发最便宜的真实调用):
 *   - default / script.review(文本 LLM):resolveLlmConfig → 1 token chat 补全
 *     (anthropic → POST /v1/messages;openai_chat → POST /chat/completions;
 *      openai_responses → POST /responses)。
 *   - chat.fallback:resolveDedicatedLlm(只认专配行,不回退主模型)→ 同上 1 token 补全。
 *   - asset.classify(视觉,OpenAI 兼容 chat):resolveMultimodal → 纯文本 1 token 补全
 *     (校验鉴权 + 模型可达;不传图,足以判连通)。
 *   - knowledge.search.embed:resolveEmbed → POST /embeddings 单短串(本就是最小调用)。
 *   - image.generate:resolveMultimodal → **真实最小生图调用**(供应商无免费探测端点;
 *     消耗少量额度 —— UI 文案已提示)。definitive:出字节 = 真连通。
 *   - video.generate:生视频分钟级且计费,不真生成 —— 对生成端点发**缺 prompt 的鉴权探测**
 *     (401/403 或 MiniMax base_resp 1004 → 鉴权失败;参数级报错 → 鉴权/端点可达)。
 *   - transcribe.audio:resolveTranscribe → whisper-local(本地免 key)返回中性说明;云端 ASR →
 *     GET /v1/models 鉴权探测(OpenAI 兼容端点通用)。
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
}

export interface MmSpecLite {
  provider: string;
  baseUrl: string | null;
  model: string;
  token: string;
}

export interface SearchSpecLite {
  provider: string;
  baseUrl: string | null;
  model: string | null;
  token: string;
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
  /** ASR 解析:未配回退 whisper-local(不抛)。 */
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
  fetchImpl: typeof fetch;
}

// ── 各家默认端点(与对应 adapter 内的 DEFAULT_BASE_URL 对齐;探测层本地镜像,不反向
//    依赖 adapter 私有常量)──────────────────────────────────────────────────────
const ANTHROPIC_DEFAULT = "https://api.anthropic.com";
const OPENAI_DEFAULT = "https://api.openai.com/v1";
const MINIMAX_DEFAULT = "https://api.minimax.io"; // multimodal-minimax DEFAULT_BASE_URL
const SILICONFLOW_ASR_DEFAULT = "https://api.siliconflow.cn"; // multimodal-openai-asr
const SILICONFLOW_V1_DEFAULT = "https://api.siliconflow.cn/v1"; // vision.ts baseURL 默认

const trimBase = (url: string): string => url.replace(/\/+$/, "");

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 探测失败的技术细节(状态码 / 响应体 / 异常)只进 console,**绝不**渲染给用户;
 * prod 静默(与 lib/ai-error-humanize 的 describeUserError 同一纪律)。
 */
function logProbeFailure(where: string, ...detail: unknown[]): void {
  // [T-444] **刻意不按 NODE_ENV 门控** —— 打包版恒 `production`,原来那道判断让「测试连接失败」的
  //   HTTP status 与服务端响应片段在**用户机上永远不打印**:用户只看到「密钥或接口地址可能不对」,
  //   而日志里一片空白 → 谁也定位不了(2026-07-20 两位用户同时报"连不上",全靠猜配置)。
  //   诊断信息恰恰在**用户机**最需要,不该只给开发机看。
  //   泄露评估:只打 where + status + 响应体前 200 字(**服务端返回的错误文本**,不含我方密钥/token),
  //   且 sidecar 日志本身是加密落盘(T-391)。
  // eslint-disable-next-line no-console
  console.error(`[settings.models.test] ${where}`, ...detail);
}

async function bodyHead(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

// ── 文本类 1 token 补全探测(Anthropic / Chat Completions / Responses)────────────
async function chatProbe(
  spec: LlmSpecLite,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (spec.apiFormat === "anthropic") {
      const url = `${trimBase(spec.baseUrl ?? ANTHROPIC_DEFAULT)}/v1/messages`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      if (spec.authStyle === "x-api-key") headers["x-api-key"] = spec.token;
      else headers.Authorization = `Bearer ${spec.token}`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: spec.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) return { ok: true, detail: "已发 1 token 真实补全,连通。" };
      logProbeFailure("chatProbe/anthropic", res.status, await bodyHead(res));
      return {
        ok: false,
        detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
      };
    }
    if (spec.apiFormat === "openai_responses") {
      const url = `${trimBase(spec.baseUrl ?? OPENAI_DEFAULT)}/responses`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${spec.token}`,
        },
        body: JSON.stringify({
          model: spec.model,
          input: "ping",
          max_output_tokens: 1,
        }),
      });
      if (res.ok) {
        return { ok: true, detail: "已发 1 token Responses 真实补全,连通。" };
      }
      logProbeFailure(
        "chatProbe/openai-responses",
        res.status,
        await bodyHead(res),
      );
      return {
        ok: false,
        detail: "连接失败:密钥、接口地址或 Responses 兼容性可能不对,请核对后重试。",
      };
    }
    const url = `${trimBase(spec.baseUrl ?? OPENAI_DEFAULT)}/chat/completions`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${spec.token}`,
      },
      body: JSON.stringify({
        model: spec.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) return { ok: true, detail: "已发 1 token 真实补全,连通。" };
    logProbeFailure("chatProbe/openai", res.status, await bodyHead(res));
    return {
      ok: false,
      detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
    };
  } catch (err) {
    logProbeFailure("chatProbe", err);
    return {
      ok: false,
      detail: "连接失败,请检查网络和接口地址后重试。",
    };
  }
}

// ── 生成端点鉴权探测(video.generate:不真生成,发缺 prompt 请求判鉴权)────────────
async function generationAuthProbe(
  spec: MmSpecLite,
  path: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const url = `${trimBase(spec.baseUrl ?? MINIMAX_DEFAULT)}${path}`;
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
      logProbeFailure("generationAuthProbe/auth", res.status);
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
      logProbeFailure("generationAuthProbe/1004", parsed.base_resp?.status_msg);
      return {
        ok: false,
        detail: "密钥无效或无权限,请检查 API 密钥后重试。",
      };
    }
    if (res.status >= 500) {
      logProbeFailure("generationAuthProbe/5xx", res.status);
      return { ok: false, detail: "对方服务开小差了,请稍后重试。" };
    }
    return {
      ok: true,
      detail:
        "鉴权与端点可达(未实际生成视频 —— 生视频分钟级且计费,只校验了密钥与端点)。",
    };
  } catch (err) {
    logProbeFailure("generationAuthProbe", err);
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
    const url = `${trimBase(spec.baseUrl ?? SILICONFLOW_ASR_DEFAULT)}/v1/models`;
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
    logProbeFailure("modelsListProbe", res.status, await bodyHead(res));
    return {
      ok: false,
      status: "fail",
      detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
    };
  } catch (err) {
    logProbeFailure("modelsListProbe", err);
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
    logProbeFailure("embedProbe", res.status, await bodyHead(res));
    return {
      ok: false,
      detail: "连接失败:密钥或接口地址可能不对,请核对后重试。",
    };
  } catch (err) {
    logProbeFailure("embedProbe", err);
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
        const r = await chatProbe(spec, fetchImpl);
        return { ...r, provider: spec.apiFormat, model: spec.model };
      }
      case "chat.fallback": {
        const spec = await deps.resolveDedicatedLlm(ctx, capability);
        if (!spec) {
          return unconfigured(
            "备用对话模型只认专配行(不回退主模型),请先保存配置。",
          );
        }
        const r = await chatProbe(spec, fetchImpl);
        return { ...r, provider: spec.apiFormat, model: spec.model };
      }
      case "asset.classify": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        // 视觉卡走 OpenAI 兼容 chat:纯文本 1 token 补全足以校验鉴权 + 模型可达。
        const r = await chatProbe(
          {
            apiFormat: "openai_chat",
            baseUrl: spec.baseUrl ?? SILICONFLOW_V1_DEFAULT,
            model: spec.model,
            authStyle: "bearer",
            token: spec.token,
          },
          fetchImpl,
        );
        return { ...r, provider: spec.provider, model: spec.model };
      }
      case "knowledge.search.embed": {
        const spec = await deps.resolveEmbed(ctx);
        if (!spec) return unconfigured("请先保存语义搜索模型配置。");
        const r = await embedProbe(spec, fetchImpl);
        return { ...r, provider: spec.apiFormat, model: spec.model };
      }
      case "image.generate": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        // 供应商无免费生图探测端点 → 真实最小调用(消耗少量额度;UI 已提示)。
        try {
          const { byteLength } = await deps.generateImageMinimal(spec);
          if (byteLength > 0) {
            return {
              ok: true,
              provider: spec.provider,
              model: spec.model,
              detail: "已真实生成一张最小测试图,连通(消耗了少量生图额度)。",
            };
          }
          logProbeFailure("image.generate", "empty bytes");
          return {
            ok: false,
            provider: spec.provider,
            model: spec.model,
            detail: "连接失败:没能生成测试图,请核对密钥与接口地址后重试。",
          };
        } catch (err) {
          logProbeFailure("image.generate", err);
          return {
            ok: false,
            provider: spec.provider,
            model: spec.model,
            detail: "连接失败,请检查网络和接口地址后重试。",
          };
        }
      }
      case "video.generate": {
        const spec = await deps.resolveMultimodal(ctx, capability);
        const r = await generationAuthProbe(
          spec,
          "/v1/video_generation",
          fetchImpl,
        );
        return { ...r, provider: spec.provider, model: spec.model };
      }
      case "transcribe.audio": {
        const spec = await deps.resolveTranscribe(ctx);
        if (spec.provider === "whisper-local") {
          return {
            ok: true,
            // [T-470] 这里验证的是「转写能力有本地兜底」，不是「这张云端配置已连通」。
            // 用 warn 中性态避免通用按钮渲绿色 ✓，同时保留本地 Whisper 可用的真实说明。
            status: "warn",
            provider: spec.provider,
            model: spec.model,
            detail:
              "未配置云端 ASR，当前使用本地 Whisper(免 key，首次自动下载模型)；没有云端连接可测试。",
          };
        }
        const r = await modelsListProbe(spec, fetchImpl);
        return { ...r, provider: spec.provider, model: spec.model };
      }
      case "web.search": {
        const spec = await deps.resolveSearch(ctx);
        if (spec.provider === "browser") {
          return {
            ok: true,
            provider: spec.provider,
            model: spec.model ?? "",
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
                provider: spec.provider,
                model: "",
                detail: "信源可达,连通。",
              };
            }
            logProbeFailure("web.search/rss", res.status, firstFeed);
            return {
              ok: false,
              provider: spec.provider,
              model: "",
              detail: "热点拉取失败,请检查网络后重试。",
            };
          } catch (err) {
            logProbeFailure("web.search/rss", err);
            return {
              ok: false,
              provider: spec.provider,
              model: "",
              detail: "热点拉取失败,请检查网络后重试。",
            };
          }
        }
        // bocha / tavily / serpapi:真实最小检索(1 条,消耗少量额度)。
        try {
          const count = await deps.searchMinimal(ctx, spec);
          return {
            ok: true,
            provider: spec.provider,
            model: spec.model ?? "",
            detail: `已发一次最小真实检索(返回 ${count} 条),连通(消耗少量检索额度)。`,
          };
        } catch (err) {
          logProbeFailure("web.search", err);
          return {
            ok: false,
            provider: spec.provider,
            model: spec.model ?? "",
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
    logProbeFailure("runModelConnectionTest", err);
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
