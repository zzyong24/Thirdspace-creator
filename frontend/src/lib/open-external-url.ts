/**
 * Remote WebView 不持有 opener capability。外链统一交给 sidecar 的严格 http(s) schema
 * route；route 再用平台适配器打开系统浏览器。
 */
export async function openExternalUrl(rawUrl: string): Promise<void> {
  const target = new URL(rawUrl);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("外部地址未通过安全校验");
  }
  if (target.username || target.password) {
    throw new Error("外部地址未通过安全校验");
  }
  const response = await fetch("/api/v1/local/open-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: target.toString() }),
  });
  if (!response.ok) throw new Error("没有打开官方页面，请稍后再试。");
}
