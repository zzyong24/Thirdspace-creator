// T-1273 只在桌面正式构建固化响应头；不新增请求级nonce或动态渲染。
export const DESKTOP_RELEASE_CSP = [
  "default-src 'self'",
  // 既有sandbox视频预览使用此固定GSAP入口；仅放行该文件，不放行整个CDN。
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:* https://growth.aitongban.cloud https://creatoros.aitongban.cloud https://license.aitongban.cloud",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");
export function desktopReleaseHeaders(env = process.env) {
  if (env.CREATOROS_DESKTOP !== "1" || env.CREATOROS_SIDECAR_SIGNING_REQUIRED !== "1") return [];
  return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: DESKTOP_RELEASE_CSP }] }];
}
