// [T-372 L2] 启动级 nonce 握手 token —— 前端侧读取(loopback-guard.server.ts 的配对客户端)。
//
// 桌面壳(Tauri)每次启动随机生成 token:注入 sidecar env(服务端校验基准)+ 经 WebView
// Tauri initialization_script 把 token 只保存在闭包并统一 patch 同源 fetch；页面脚本不可读。
//
// web/dev:无该全局 → 返回空对象,不带头;服务端 env 也无 token → 检查不启用,行为不变。
// SSR 安全:无 window → 空对象。

export const HANDSHAKE_HEADER = "x-creatoros-handshake";

/**
 * 兼容既有调用形状。握手头由不可枚举的原生初始化闭包统一添加，页面 JS 不再持有 token。
 */
export function handshakeHeaders(): Record<string, string> {
  return {};
}
