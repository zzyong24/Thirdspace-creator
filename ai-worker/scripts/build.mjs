import { build } from "esbuild";
import { fileURLToPath } from "node:url";
await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/execution-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@playwright/test", "jsdom", "@mozilla/readability"],
});

await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/agentic-worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/agentic-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@playwright/test", "jsdom", "@mozilla/readability"],
});

// 浏览器库入口仅加载运行代码；真实启动仍需显式调用并传受控上下文。
await build({
  entryPoints: [fileURLToPath(new URL("../src/runtime/browser/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/browser-runtime.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@playwright/test", "jsdom", "@mozilla/readability"],
});
