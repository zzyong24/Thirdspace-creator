/**
 * 静态 HTML 可显示行内样式、SVG 与 data 图片；脚本、远程资源、表单、子框架一律关闭。
 * 纯常量可同时供 HTTP 响应与客户端 srcDoc 使用，不含任何服务端凭据。
 */
export const WORKBENCH_PREVIEW_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** HTTP 导航也强制 opaque origin；组件的 iframe sandbox 再守一层。 */
export const WORKBENCH_PREVIEW_RESPONSE_CSP =
  `sandbox; frame-ancestors 'self'; ${WORKBENCH_PREVIEW_DOCUMENT_CSP}`;
