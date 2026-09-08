import { ErrorCode } from "@creatoros/contract";
import type { RadarSource } from "./intelligence-workbench-types";
export function favoriteFoldersErrorMessage(error: unknown): string {
  let code: unknown = null;
  let name: unknown = null;
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current !== "object") break;
    const record = current as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
      error?: unknown;
    };
    code = typeof record.code === "string" ? record.code : code;
    name = typeof record.name === "string" ? record.name : name;
    if (code) break;
    current = record.cause ?? record.error;
  }
  if (!code) {
    const byName: Record<string, ErrorCode> = {
      DouyinFavoritesSessionExpiredError:
        ErrorCode.DouyinFavoritesSessionExpired,
      DouyinNotLoggedInError: ErrorCode.DouyinFavoritesSessionExpired,
      DouyinFavoritesBrowserLockedError:
        ErrorCode.DouyinFavoritesBrowserLocked,
      BrowserProfileLockedError: ErrorCode.DouyinFavoritesBrowserLocked,
      DouyinFavoritesCaptchaError: ErrorCode.DouyinFavoritesCaptcha,
      DouyinFavoritesNetworkError: ErrorCode.DouyinFavoritesNetwork,
      DouyinFavoritesUpstreamError: ErrorCode.DouyinFavoritesUpstream,
      DouyinFavoritesInvalidResponseError:
        ErrorCode.DouyinFavoritesInvalidResponse,
    };
    code = typeof name === "string" ? byName[name] : null;
  }
  switch (code) {
    case ErrorCode.DouyinFavoritesSessionExpired:
      return "抖音收藏登录已失效，请重新登录当前账号后再读取。";
    case ErrorCode.OwnershipError:
    case ErrorCode.AccountRequiredError:
      return "当前页面账号与收藏登录档案不一致，请切回正确账号后重试。";
    case ErrorCode.DouyinFavoritesBrowserLocked:
      return "当前账号的登录浏览器档案正在被占用，请关闭相关浏览器窗口后重试。";
    case ErrorCode.DouyinFavoritesCaptcha:
      return "抖音要求完成验证码，请先完成验证后再读取收藏夹。";
    case ErrorCode.DouyinFavoritesNetwork:
      return "读取收藏夹时网络连接失败，请检查网络后重试。";
    case ErrorCode.DouyinFavoritesInvalidResponse:
      return "抖音收藏接口返回了不完整数据，本次未按 0 个处理，请稍后重试。";
    case ErrorCode.DouyinFavoritesUpstream:
      return "抖音收藏接口暂时拒绝请求，请稍后重试。";
    default:
      return "收藏夹服务暂时不可用，请稍后重试；本次不会被记成 0 个。";
  }
}

export function structuredErrorSignal(error: unknown): string {
  const values: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  for (let depth = 0; queue.length > 0 && depth < 8; depth += 1) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === "string") {
      values.push(current);
      continue;
    }
    if (typeof current !== "object") continue;
    const record = current as Record<string, unknown>;
    for (const key of ["code", "name", "message"]) {
      if (typeof record[key] === "string") values.push(record[key]);
    }
    for (const key of ["cause", "error", "body", "response"]) {
      if (record[key]) queue.push(record[key]);
    }
  }
  return values.join(":");
}

export function sourceVerificationErrorMessage(
  type: RadarSource["type"],
  error: unknown,
): string {
  if (type === "favorites_folder") return favoriteFoldersErrorMessage(error);
  const signal = structuredErrorSignal(error);
  if (type === "darkhorse_query") {
    if (/NotLoggedIn|LOGIN_REQUIRED|SessionExpired|OAuth|授权|登录/i.test(signal)) {
      return "热点宝尚未授权。请在弹出的 Chrome 窗口完成热点宝授权后重试。";
    }
    if (/NoValidResponse|NO_VALID_RESPONSE|TIMEOUT|Timeout/i.test(signal)) {
      return "热点宝暂时没有返回有效结果，请检查网络后重新验证授权。";
    }
    if (/ResponseShapeChanged|RESPONSE_SHAPE_CHANGED/i.test(signal)) {
      return "热点宝页面结构发生变化，当前无法确认授权状态；本次不会误记为同步成功。";
    }
    return "热点宝授权验证失败，请确认授权窗口可正常打开后重试。";
  }
  if (type === "creator_profile") {
    if (/DouyinNoValidResponseError/i.test(signal)) {
      return "本次没有读到有效作品列表，不能把它判断成 0 条。请重新测试一次。";
    }
    if (/DouyinResponseShapeChangedError/i.test(signal)) {
      return "已打开主页，但作品列表结构发生变化，当前不能给出可信作品数。";
    }
    if (/Captcha|验证码|验证/i.test(signal)) {
      return "抖音要求完成验证码，请处理后再测试；不会把它显示成 0 条。";
    }
    if (
      /NotLoggedIn|LOGIN_REQUIRED|DOUYIN_FAVORITES_SESSION_EXPIRED|SessionExpired|登录/i.test(
        signal,
      )
    ) {
      return "当前抖音登录状态不可用，请重新登录后再测试。";
    }
    return "主页验证失败：请确认已登录抖音，并输入完整的 /user/… 主页链接。";
  }
  if (type === "web" || type === "rss") {
    if (/LOGIN_WALL|LoginRequired/i.test(signal)) {
      return "网页要求登录。请先在“设置 → 网站登录保管库”登录该网站，再重新测试。";
    }
    if (/UNSAFE_URL|UrlBlocked/i.test(signal)) {
      return "这个地址不是可安全访问的公网网页，请检查网址后重试。";
    }
    if (/TIMEOUT|Timeout/i.test(signal)) {
      return "网页连接超时，请检查网络或稍后重新测试。";
    }
    if (/HTTP_ERROR|HTTP\s*[45]\d\d/i.test(signal)) {
      return "网页服务器拒绝访问或暂时异常，请确认链接在浏览器中可以正常打开。";
    }
    if (/PARSE_FAILED|Parse/i.test(signal)) {
      return type === "rss"
        ? "已打开地址，但没有解析到有效 RSS/Atom 内容。"
        : "已打开网页，但没有读到可监控的真实正文；请换成具体文章或内容页。";
    }
    return "来源验证失败：请检查网址、登录状态或页面是否允许读取。";
  }
  return "来源验证失败，请检查采集账号和来源配置。";
}

export function transcriptSaveErrorMessage(error: unknown): string {
  const signal = structuredErrorSignal(error);
  if (/TRANSCRIPT_LOCKED/.test(signal)) {
    return "这份逐字稿已经生成过选题候选，现已永久锁定，不能再替换。";
  }
  if (/TRANSCRIPT_TOPIC_BUSY/.test(signal)) {
    return "选题正在生成，完成前暂时不能替换逐字稿。";
  }
  if (/TRANSCRIPT_BUSY/.test(signal)) {
    return "逐字稿正在转写，完成后再替换。";
  }
  if (
    /TRANSCRIPT_FILE_(EMPTY|INVALID_ENCODING|TOO_LARGE|UNSUPPORTED_FORMAT|EXTENSION_MISMATCH)/.test(
      signal,
    )
  ) {
    return "逐字稿正文无效或超出限制，请检查文件格式、乱码和内容大小。";
  }
  return "逐字稿保存失败，请检查内容后重试。";
}

