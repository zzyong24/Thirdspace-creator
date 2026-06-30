import type { Endpoint, Transport } from "@creatoros/contract";

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
      const res = await fetch(`${baseUrl}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
