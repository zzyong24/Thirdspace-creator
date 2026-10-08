import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
// T-147 P5 桌面激活授权 —— activation-manager 在线服务客户端(接 license.aitongban.cloud)。
//
// 契约(源码核准,见 SPEC §2 + activation-manager src/lib/license-api.ts、license-result-service.ts):
//   - 全部 POST JSON;请求字段 code / machineId / projectKey(camelCase 即可)。
//   - 响应 wire 同时含 snake + camel 双份;**权威布尔 = success + valid**,时间 = expiresAt(ISO|null)。
//   - **无密码学签名**(服务端不支持 —— 已读源码坐实;客户端只能校布尔值,见 SPEC §5)。
//
// 本模块只做「发请求 + 归一响应」,不含状态机(状态机在 activation-service,注入本客户端)。
// fetch 可注入(测试传桩,绝不真联网 —— 铁律)。

// activation-manager 非 legacy 响应体(activate / status 用),字段可能缺(容错读)。
interface LicenseApiResponseBody {
  success?: boolean | null;
  message?: string | null;
  valid?: boolean | null;
  isActivated?: boolean | null;
  is_activated?: boolean | null;
  licenseMode?: string | null;
  license_mode?: string | null;
  expiresAt?: string | null;
  expires_at?: string | null;
  remainingCount?: number | null;
  remaining_count?: number | null;
}

// 归一后的内部结果 —— 状态机只认这几个字段。
export interface LicenseCheckResult {
  // HTTP + 业务双重成功(HTTP 2xx 且 body.success === true)。
  success: boolean;
  // 权威有效性布尔(服务端算好的 valid;success=false 时恒 false)。
  valid: boolean;
  // 到期 ISO;null = 永久 or 未知。
  expiresAt: string | null;
  // 'TIME' | 'COUNT' | null。
  licenseMode: string | null;
  isActivated: boolean;
  // 服务端可读消息(错误态展示用,如「激活码已过期」「激活码已被其他设备使用」)。
  message: string;
  // HTTP 状态码(400 过期/被他机用、404 码不存在、409 换绑冷却…)。
  httpStatus: number;
  // 网络不可达(fetch throw / 超时)= true —— 状态机据此走**离线宽限**分支(而非判失效)。
  networkError: boolean;
}

export interface LicenseRequest {
  code: string;
  machineId: string;
  projectKey: string;
}

export interface LicenseClientOptions {
  baseUrl: string;
  // 注入 fetch(测试传桩;运行时默认全局 fetch)。
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface LicenseClient {
  activate(req: LicenseRequest): Promise<LicenseCheckResult>;
  status(req: LicenseRequest): Promise<LicenseCheckResult>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeBody(
  body: LicenseApiResponseBody,
  httpStatus: number,
): LicenseCheckResult {
  const success = body.success === true && httpStatus >= 200 && httpStatus < 300;
  // valid 是服务端算好的权威布尔;success=false 时(过期/被他机用/码不存在)恒判无效。
  const valid = success && body.valid === true;
  return {
    success,
    valid,
    expiresAt: body.expiresAt ?? body.expires_at ?? null,
    licenseMode: body.licenseMode ?? body.license_mode ?? null,
    isActivated: (body.isActivated ?? body.is_activated) === true,
    message: typeof body.message === "string" ? body.message : "",
    httpStatus,
    networkError: false,
  };
}

// 网络层失败(fetch throw / 超时)——不是「授权无效」,是「校不到」。状态机据 networkError 走宽限。
function networkFailure(message: string): LicenseCheckResult {
  return {
    success: false,
    valid: false,
    expiresAt: null,
    licenseMode: null,
    isActivated: false,
    message,
    httpStatus: 0,
    networkError: true,
  };
}

async function postLicense(
  path: string,
  req: LicenseRequest,
  options: LicenseClientOptions,
): Promise<LicenseCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = executionTimeoutMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${options.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: req.code,
        machineId: req.machineId,
        projectKey: req.projectKey,
      }),
      signal: controller.signal,
    });
    let body: LicenseApiResponseBody = {};
    try {
      body = (await res.json()) as LicenseApiResponseBody;
    } catch {
      // 非 JSON 响应(假服务端 / 网关错误页)—— 当作校验失败(非网络错,是明确的坏响应)。
      return {
        success: false,
        valid: false,
        expiresAt: null,
        licenseMode: null,
        isActivated: false,
        message: "授权服务响应无法解析",
        httpStatus: res.status,
        networkError: false,
      };
    }
    return normalizeBody(body, res.status);
  } catch (err) {
    // fetch throw(网络不可达 / abort 超时)→ 网络失败(走宽限,不判失效)。
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "连接授权服务超时"
        : "无法连接授权服务";
    return networkFailure(message);
  } finally {
    clearTimeout(timer);
  }
}

export function createLicenseClient(
  options: LicenseClientOptions,
): LicenseClient {
  return {
    activate: (req) => postLicense("/api/license/activate", req, options),
    status: (req) => postLicense("/api/license/status", req, options),
  };
}
