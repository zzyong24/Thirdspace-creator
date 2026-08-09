#!/usr/bin/env node
import { isIP } from "node:net";

export function validateUpdateOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("更新源必须是无凭据、无路径、无查询的标准 HTTPS origin");
  }
  if (isIP(url.hostname) || url.hostname === "localhost") throw new Error("更新源不得使用 IP 或 localhost");
  return url.origin;
}

export async function probeUpdateObject(objectUrl, fetchImpl = fetch) {
  const url = new URL(objectUrl);
  validateUpdateOrigin(url.origin);
  const head = await fetchImpl(url, { method: "HEAD", redirect: "manual" });
  if (!head.ok) throw new Error(`HEAD 失败: HTTP ${head.status}`);
  const length = Number(head.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length <= 0) throw new Error("缺少有效 Content-Length");
  if (!head.headers.get("etag")) throw new Error("缺少 ETag");
  const range = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "manual" });
  if (range.status !== 206 || !range.headers.get("content-range")?.startsWith("bytes 0-0/")) {
    throw new Error("对象存储/CDN 不支持标准 Range 续传");
  }
  return { url: url.href, contentLength: length, etag: head.headers.get("etag"), range: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const objectUrl = process.argv[2];
  if (!objectUrl) {
    console.error("用法: node update-hosting-probe.mjs https://cdn.example.com/path/to/test-object");
    process.exit(2);
  }
  probeUpdateObject(objectUrl).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`[update-hosting-probe] ${error.message}`);
    process.exit(1);
  });
}
