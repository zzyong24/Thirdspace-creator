import "server-only";

// [T-326 B-04] douyin-cdp 的错误类抽到这个**零依赖叶子模块**:
//   persistence-client 里有同步的 `err instanceof DouyinNotLoggedInError` 判别点
//   (runner 注入的 isNotLoggedInError 谓词是同步函数,不能 await 动态 import),
//   而 douyin-cdp 本体已改为运行时懒加载(动态 import 移到调用点,不再进任何路由的
//   静态编译图)。错误类身份必须全局唯一(instanceof 语义),所以两边都从这里拿:
//   douyin-cdp.ts re-export 保持既有 import 路径全部兼容。

/** 未登录抖音创作者中心 —— 调用方据此提示用户先「登录抖音」(弹窗扫码),区别于真正抓取失败。 */
export class DouyinNotLoggedInError extends Error {
  constructor() {
    super("DouyinNotLoggedInError: 未检测到抖音创作者中心登录态,请先扫码登录");
    this.name = "DouyinNotLoggedInError";
  }
}

/** 页面命中验证码/人机校验。新内容雷达严格路径必须把它标为 blocked，不能折叠成合法空数组。 */
export class DouyinCaptchaError extends Error {
  constructor() {
    super("DouyinCaptchaError: 抖音页面要求完成验证码或人机校验");
    this.name = "DouyinCaptchaError";
  }
}

/** 主页已打开，但没有取得任何可解析的作品列表响应；这是未知结果，绝不等同真实 0 条。 */
export class DouyinNoValidResponseError extends Error {
  constructor() {
    super("DouyinNoValidResponseError: 未取得有效的抖音作品列表响应");
    this.name = "DouyinNoValidResponseError";
  }
}

/** 命中作品接口但返回体已不符合已知列表结构，需要更新解析器，绝不等同真实 0 条。 */
export class DouyinResponseShapeChangedError extends Error {
  constructor() {
    super("DouyinResponseShapeChangedError: 抖音作品列表响应结构已变化");
    this.name = "DouyinResponseShapeChangedError";
  }
}

abstract class DouyinFavoritesError extends Error {
  abstract readonly code: string;
  readonly details: Record<string, unknown>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const DOUYIN_FAVORITES_ERROR_CODES = {
  sessionExpired: "DOUYIN_FAVORITES_SESSION_EXPIRED",
  browserLocked: "DOUYIN_FAVORITES_BROWSER_LOCKED",
  captcha: "DOUYIN_FAVORITES_CAPTCHA",
  network: "DOUYIN_FAVORITES_NETWORK",
  upstream: "DOUYIN_FAVORITES_UPSTREAM",
  invalidResponse: "DOUYIN_FAVORITES_INVALID_RESPONSE",
} as const;

/** 收藏读取使用的登录态不存在或已被上游判失效。 */
export class DouyinFavoritesSessionExpiredError extends DouyinNotLoggedInError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.sessionExpired;
  readonly details: Record<string, unknown>;

  constructor(upstreamStatusCode: number | null = null) {
    super();
    this.name = "DouyinFavoritesSessionExpiredError";
    this.message = "DouyinFavoritesSessionExpiredError: 抖音收藏登录会话已失效";
    this.details =
      upstreamStatusCode === null ? {} : { upstreamStatusCode };
    Object.setPrototypeOf(
      this,
      DouyinFavoritesSessionExpiredError.prototype,
    );
  }
}

/** Playwright 持久档案已被另一个浏览器进程占用。 */
export class DouyinFavoritesBrowserLockedError extends DouyinFavoritesError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.browserLocked;

  constructor() {
    super("DouyinFavoritesBrowserLockedError: 抖音登录浏览器档案正在被占用");
    this.name = "DouyinFavoritesBrowserLockedError";
  }
}

/** 收藏页触发验证码或人机校验。 */
export class DouyinFavoritesCaptchaError extends DouyinFavoritesError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.captcha;

  constructor() {
    super("DouyinFavoritesCaptchaError: 抖音收藏页要求完成验证码");
    this.name = "DouyinFavoritesCaptchaError";
  }
}

/** 页内 fetch、导航或连接层未取得响应；不保存上游原始错误文本。 */
export class DouyinFavoritesNetworkError extends DouyinFavoritesError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.network;

  constructor() {
    super("DouyinFavoritesNetworkError: 抖音收藏网络请求失败");
    this.name = "DouyinFavoritesNetworkError";
  }
}

/** 抖音接口返回非零且不属于登录/验证码的业务码。 */
export class DouyinFavoritesUpstreamError extends DouyinFavoritesError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.upstream;

  constructor(upstreamStatusCode: number | null = null) {
    super(
      "DouyinFavoritesUpstreamError: 抖音收藏接口拒绝请求",
      upstreamStatusCode === null ? {} : { upstreamStatusCode },
    );
    this.name = "DouyinFavoritesUpstreamError";
  }
}

/** 业务码或列表结构缺失/非法；这是未知结果，不能折叠成真实 0。 */
export class DouyinFavoritesInvalidResponseError extends DouyinFavoritesError {
  readonly code = DOUYIN_FAVORITES_ERROR_CODES.invalidResponse;

  constructor(reason: "status_code" | "folders" | "videos" = "status_code") {
    super("DouyinFavoritesInvalidResponseError: 抖音收藏响应结构无效", {
      reason,
    });
    this.name = "DouyinFavoritesInvalidResponseError";
  }
}

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return value !== null && typeof value === "object"
    ? (value as ErrorRecord)
    : null;
}

/**
 * 将跨 chunk、序列化和 Error.cause 包装后的收藏错误恢复成当前运行时的 canonical class。
 * 只读取稳定 code/name 和白名单 details；不复制 message、stack、URL 或上游正文。
 */
export function rehydrateDouyinFavoritesError(error: unknown): Error | null {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  for (let depth = 0; queue.length > 0 && depth < 8; depth += 1) {
    const current = queue.shift();
    if (current === null || current === undefined || seen.has(current)) continue;
    seen.add(current);
    const record = asRecord(current);
    if (!record) continue;

    const code = typeof record.code === "string" ? record.code : "";
    const name = typeof record.name === "string" ? record.name : "";
    const details = asRecord(record.details);
    const upstreamStatusCode =
      typeof details?.upstreamStatusCode === "number" &&
      Number.isInteger(details.upstreamStatusCode)
        ? details.upstreamStatusCode
        : null;

    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.sessionExpired ||
      name === "DouyinFavoritesSessionExpiredError" ||
      name === "DouyinNotLoggedInError"
    ) {
      return new DouyinFavoritesSessionExpiredError(upstreamStatusCode);
    }
    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.browserLocked ||
      code === "CHROMIUM_PROFILE_LOCKED" ||
      name === "DouyinFavoritesBrowserLockedError"
    ) {
      return new DouyinFavoritesBrowserLockedError();
    }
    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.captcha ||
      name === "DouyinFavoritesCaptchaError" ||
      name === "DouyinCaptchaError"
    ) {
      return new DouyinFavoritesCaptchaError();
    }
    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.network ||
      name === "DouyinFavoritesNetworkError"
    ) {
      return new DouyinFavoritesNetworkError();
    }
    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.upstream ||
      name === "DouyinFavoritesUpstreamError"
    ) {
      return new DouyinFavoritesUpstreamError(upstreamStatusCode);
    }
    if (
      code === DOUYIN_FAVORITES_ERROR_CODES.invalidResponse ||
      name === "DouyinFavoritesInvalidResponseError"
    ) {
      const reason = details?.reason;
      return new DouyinFavoritesInvalidResponseError(
        reason === "folders" || reason === "videos" ? reason : "status_code",
      );
    }

    // 只追踪常见错误包装槽位，禁止递归扫描任意对象内容。
    if ("cause" in record) queue.push(record.cause);
    if ("error" in record) queue.push(record.error);
    if ("originalError" in record) queue.push(record.originalError);
  }
  return null;
}
