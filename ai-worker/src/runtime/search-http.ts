import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
// 联网检索适配器共用的 HTTP 小工具(SPEC 2026-07-03 §1.1 T-084a)—— 三家 provider 适配器
// (bocha/tavily/serpapi)共用:带超时的 fetch、安全读 body、字符串归一。集中一处,避免各适配器
// 重复实现 10s 超时逻辑(SPEC §1.2:单次检索 10s 失败降级)。

import { SearchExecutionError } from "./search-factory";

/** 把任意值归一成 trim 过的字符串(非字符串 → "");响应字段防御性映射用。 */
export function toStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 安全读响应 body(截断 300 字)供错误信息;读失败不再抛。 */
export async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

/**
 * 带超时的 fetch —— 超时(AbortController)/网络失败都转成 SearchExecutionError(带 provider
 * 名),由调用方 catch 成 model_memory 降级(SPEC §1.3),不 crash。注入 fetchImpl 供单测。
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
  signal?: AbortSignal,
): Promise<Response> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, {once: true});
  timeoutMs = executionTimeoutMs(timeoutMs);
  const timer = setTimeout(() => controller.abort(new Error("SEARCH_EXECUTION_TIMEOUT")), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    // 搜索本就需要完整 JSON/XML；在同一超时/取消生命周期内读完正文。
    const body = await response.text();
    signal?.throwIfAborted();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (err) {
    signal?.throwIfAborted();
    if (err instanceof Error && err.name === "AbortError") {
      throw new SearchExecutionError(
        `${provider} 检索超时(>${timeoutMs}ms)`,
      );
    }
    throw new SearchExecutionError(
      `${provider} 检索请求失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    clearTimeout(timer);
  }
}
