// [T-372 L2] 启动级 nonce 握手 token —— 前端侧读取(loopback-guard.server.ts 的配对客户端)。
//
// 桌面壳(Tauri)每次启动随机生成 token:注入 sidecar env(服务端校验基准)+ 经 WebView
// 初始化脚本写入全局 `window.__CREATOROS_HANDSHAKE_TOKEN__`(见 src-tauri/src/lib.rs)。
// 前端有副作用请求(dispatch/chat/web-session)把它带在 `x-creatoros-handshake` 头上。
//
// web/dev:无该全局 → 返回空对象,不带头;服务端 env 也无 token → 检查不启用,行为不变。
// SSR 安全:无 window → 空对象。

export const HANDSHAKE_HEADER = "x-creatoros-handshake";

/** 附加到有副作用请求上的握手头(桌面壳里有 token 才带;否则空)。 */
export function handshakeHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = (window as unknown as Record<string, unknown>)
    .__CREATOROS_HANDSHAKE_TOKEN__;
  return typeof token === "string" && token
    ? { [HANDSHAKE_HEADER]: token }
    : {};
}
