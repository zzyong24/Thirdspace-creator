// [T-257 v4] open-url 纯逻辑(与 route 分离,好单测):校验 URL + 选平台命令。
// 安全核心:只允许 http/https,防 `open` 被喂 file://、自定义 scheme 而启动本地 app / 打开文件。

export type OpenUrlPlan =
  | { ok: true; cmd: string; args: string[] }
  | { ok: false; status: number; error: string };

export function planOpenUrl(rawUrl: unknown, platform: NodeJS.Platform): OpenUrlPlan {
  const raw = typeof rawUrl === "string" ? rawUrl : "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: "invalid url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, status: 400, error: "only http(s) urls allowed" };
  }
  const url = parsed.toString();
  if (platform === "darwin") return { ok: true, cmd: "open", args: [url] };
  if (platform === "win32") {
    // start 的第一个引号参数是窗口标题(留空),第二个才是 URL。
    return { ok: true, cmd: "cmd", args: ["/c", "start", "", url] };
  }
  return { ok: true, cmd: "xdg-open", args: [url] };
}
