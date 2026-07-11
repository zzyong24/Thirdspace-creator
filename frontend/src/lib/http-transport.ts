import type { Endpoint, Transport } from "@creatoros/contract";

// [T-136 切片 a] 当前选中抖音号的 localStorage 键(与 account-switcher 同一真值)。切号写它,
// 每次请求读它注入 x-account-id header。server 端会验属主(不属主降级 null),故这里带的值是
// 「意图」而非「授权」——安全边界在 server。
export const CURRENT_ACCOUNT_KEY = "creatoros:current-account";

// 读当前号 id。仅浏览器有 localStorage;SSR / 隐私模式禁用 storage → try/catch 降级为 null
// (= 未选号,server 退化全局,不崩)。复用 sidebar collapse 同款降级范式。
// [T-220] 导出:/api/chat 的 useChat transport 不走本 dispatch,需复用同一读法注入 x-account-id
//   (否则 chat 全程无号 → 截图/封面 asset 落 NULL 号 → 破图)。单一真值,不另抄 localStorage 键。
export function readCurrentAccountId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CURRENT_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

// Client-safe transport: serializes the operation to the /api/v1 RPC dispatch
// route, which runs the handler against the SERVER store and returns the
// contract envelope. Browser islands use this so their mutations reach the
// same server-side store the server components render from.
//
// No server imports here — keeps the mock backend + canonicalDataset out of the
// client bundle. Stage 16 replaces the route's handler with real persistence;
// this transport is unchanged.
export function createHttpTransport(baseUrl = "/api/v1"): Transport {
  return {
    async request(endpoint: Endpoint, input) {
      // [T-136 切片 a] 每次请求注入当前选中号 → server 据此(验属主后)按号过滤。集中在此一处,
      // 不散落到各 island。未选号 / storage 不可用 → 不带 header(server 退化全局)。
      const currentAccountId = readCurrentAccountId();
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (currentAccountId) headers["x-account-id"] = currentAccountId;
      const res = await fetch(`${baseUrl}/dispatch`, {
        method: "POST",
        headers,
        // Send the httpOnly session cookie so the route can derive the
        // RequestContext (multi-tenant). Same-origin defaults to sending it,
        // but make it explicit so a future base-url change can't silently drop
        // auth.
        credentials: "same-origin",
        body: JSON.stringify({ id: endpoint.id, input }),
      });
      if (!res.ok) {
        // 把后端的错误文案带上。否则前端只看到 "400/409",拿不到 DouyinNotLoggedInError /
        // 阶段交付物缺失 之类的可判定信息 —— 错误处理(未登录引导 / 进入下一步 gate 原因)失效。
        // dispatch body 有两种形状:① {error:"..."}(纯串);② {error:{code,message,details}}(结构化)。
        // 两者都抽出可读 message(结构化时优先 .message),供调用方就地展示真实原因。
        let detail = "";
        try {
          const body = (await res.json()) as {
            error?: unknown;
          };
          const err = body?.error;
          if (typeof err === "string") {
            detail = `: ${err}`;
          } else if (
            err &&
            typeof err === "object" &&
            typeof (err as { message?: unknown }).message === "string"
          ) {
            detail = `: ${(err as { message: string }).message}`;
          }
        } catch {
          /* 非 JSON body,忽略 */
        }
        throw new Error(
          `HttpTransport: ${res.status} for ${endpoint.id}${detail}`,
        );
      }
      return res.json();
    },
  };
}
