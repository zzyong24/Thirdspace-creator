import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [portArg, outputArg] = process.argv.slice(2);
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !outputArg) {
  throw new Error(
    "usage: node inspect-installed-webview.mjs <devtools-port> <output-json>",
  );
}

const deadline = Date.now() + 30_000;
let targets = [];
while (Date.now() < deadline) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    );
    if (targets.length > 0) break;
  } catch {
    // WebView2 DevTools endpoint is not ready yet.
  }
  await new Promise((done) => setTimeout(done, 200));
}

const target = targets.find(
  (entry) =>
    entry.type === "page" &&
    /^http:\/\/(127\.0\.0\.1|localhost):/.test(entry.url),
);
if (!target?.webSocketDebuggerUrl) {
  throw new Error(
    `[T-565] 未发现已导航到本地 CreatorOS 页面的 WebView2 target:${JSON.stringify(
      targets.map(({ type, title, url }) => ({ type, title, url })),
    )}`,
  );
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  const timer = setTimeout(
    () => rejectOpen(new Error("[T-565] WebView2 CDP 连接超时")),
    10_000,
  );
  socket.addEventListener(
    "open",
    () => {
      clearTimeout(timer);
      resolveOpen();
    },
    { once: true },
  );
  socket.addEventListener(
    "error",
    () => {
      clearTimeout(timer);
      rejectOpen(new Error("[T-565] WebView2 CDP 连接失败"));
    },
    { once: true },
  );
});

const id = 1;
socket.send(
  JSON.stringify({
    id,
    method: "Runtime.evaluate",
    params: {
      returnByValue: true,
      expression: `(() => {
        const body = document.body;
        const text = body?.innerText?.trim() ?? "";
        const rect = body?.getBoundingClientRect();
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          textLength: text.length,
          textSample: text.slice(0, 240),
          bodyWidth: rect?.width ?? 0,
          bodyHeight: rect?.height ?? 0,
          childElements: body?.childElementCount ?? 0
        };
      })()`,
    },
  }),
);
const response = await new Promise((resolveResponse, rejectResponse) => {
  const timer = setTimeout(
    () => rejectResponse(new Error("[T-565] WebView2 DOM 读取超时")),
    10_000,
  );
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== id) return;
    clearTimeout(timer);
    resolveResponse(message);
  });
});
socket.close();

if (response.error || response.result?.exceptionDetails) {
  throw new Error(`[T-565] WebView2 DOM 读取失败:${JSON.stringify(response)}`);
}
const result = response.result?.result?.value;
if (
  !result ||
  result.readyState !== "complete" ||
  result.textLength < 20 ||
  result.bodyWidth < 640 ||
  result.bodyHeight < 400 ||
  result.childElements < 1
) {
  throw new Error(`[T-565] WebView2 页面仍为空白或未完成:${JSON.stringify(result)}`);
}

const output = resolve(outputArg);
writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      inspectedAt: new Date().toISOString(),
      ...result,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));
