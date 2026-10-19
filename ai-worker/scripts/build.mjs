import { build as esbuild } from "esbuild";
import { piRuntimeInitializationPlugin } from "./pi-runtime-bundle.mjs";
const build = options => esbuild({...options, plugins: [...(options.plugins ?? []), piRuntimeInitializationPlugin()]});
import { fileURLToPath } from "node:url";
await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/execution-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@openclaw/fs-safe", "mammoth", "pdf-parse", "@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"],
});

await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/agentic-worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/agentic-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["mammoth", "pdf-parse", "@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"],
});

// 浏览器库入口仅加载运行代码；真实启动仍需显式调用并传受控上下文。
await build({
  entryPoints: [fileURLToPath(new URL("../src/runtime/browser/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/browser-runtime.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["mammoth", "pdf-parse", "@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"],
});

// 原情报任务 claim 内的模型进程，不另建执行任务。
await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/intelligence-generation-worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/intelligence-generation-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"],
});

// 情报原 transcript claim 的 ASR 进程，不创建 ai_task。
await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/intelligence-transcript-worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/intelligence-transcript-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
  external: ["@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"],
});
await build({entryPoints:[fileURLToPath(new URL("../src/io/embedding-worker-entry.ts",import.meta.url))],outfile:fileURLToPath(new URL("../dist/embedding-worker.cjs",import.meta.url)),bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning"});

// 原 scheduled.* 任务的固定飞轮模型与收藏 ASR 阶段，共用原 claim。
await build({
  entryPoints:[fileURLToPath(new URL("../src/execution/flywheel-generation-worker-entry.ts",import.meta.url))],
  outfile:fileURLToPath(new URL("../dist/flywheel-generation-worker.cjs",import.meta.url)),
  bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning",
  external:["@playwright/test","jsdom","@mozilla/readability","@xenova/transformers"],
});
await build({entryPoints:[fileURLToPath(new URL("../src/io/model-probe-worker-entry.ts",import.meta.url))],outfile:fileURLToPath(new URL("../dist/model-probe-worker.cjs",import.meta.url)),bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning"});

await build({entryPoints:[fileURLToPath(new URL("../src/execution/codex-status-entry.ts",import.meta.url))],outfile:fileURLToPath(new URL("../dist/codex-status-worker.cjs",import.meta.url)),bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning",external:["@openclaw/fs-safe"]});

// 固定上游源码经当前构建器打包；不运行上游脚本或浮动下载。
await build({entryPoints:[fileURLToPath(new URL("../vendor/codex-acp/src/index.ts",import.meta.url))],outfile:fileURLToPath(new URL("../dist/codex-acp.cjs",import.meta.url)),bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning",banner:{js:'// Derived from codex-acp 2.1.1 (Apache-2.0), commit 68d7d2d5ddfc0ed5746f9f6130892dda685e65dd.'}});

// 原成片任务的可选视觉审核，独立Worker共用原父任务期限与持久调用账本。
await build({entryPoints:[fileURLToPath(new URL("../src/execution/video-visual-review-worker-entry.ts",import.meta.url))],outfile:fileURLToPath(new URL("../dist/video-visual-review-worker.cjs",import.meta.url)),bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"warning",external:["@openclaw/fs-safe"]});
