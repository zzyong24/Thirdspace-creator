import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createBuildSmokeVerdictToken } from "../../frontend/scripts/desktop/verdict-key-material.mjs";

const [closureArg] = process.argv.slice(2);
if (!closureArg) {
  throw new Error("usage: node runtime-smoke.mjs <closure-dir>");
}
const repoRoot = process.cwd();
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
const runtimeRoot = resolve(repoRoot, closureArg);
if (!runtimeRoot.startsWith(`${safeOutputBase}${sep}`)) {
  throw new Error(`[closure-rat] runtime 必须位于 ${safeOutputBase} 内`);
}

const target = `${process.platform}-${process.arch}`;
const suffix = process.platform === "win32" ? ".exe" : "";
const expectedPackageBrandName =
  process.env.CREATOROS_EXPECTED_PACKAGE_BRAND_NAME?.trim() || "CreatorOS";
const expectedMainTitle = `<title>${expectedPackageBrandName
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")}</title>`;
const runtimeNode = resolve(
  runtimeRoot,
  "layers",
  "core",
  "bin",
  `creatoros-server${suffix}`,
);
// Homebrew/macOS 的 node 是依赖外部 dylib 的开发机产物；T-565 目标 Windows 的
// node.exe 是自包含 PE。macOS 预检用当前 Node，Windows RAT 必须真跑随包 node.exe。
const smokeNode = process.platform === "win32" ? runtimeNode : process.execPath;
const browsersDir = resolve(runtimeRoot, "layers", "browser", "browsers");
const mediaBin = resolve(runtimeRoot, "layers", "media", "bin");
const piBundle = resolve(
  runtimeRoot,
  "layers",
  "core",
  "pi",
  "pi-bundle.mjs",
);
const hyperframesCli = resolve(
  runtimeRoot,
  "layers",
  "core",
  "render",
  "vendor",
  "hyperframes",
  "dist",
  "cli.js",
);
const moduleResolver = resolve(
  runtimeRoot,
  "frontend",
  "creatoros-module-resolver.cjs",
);
for (const required of [
  runtimeNode,
  browsersDir,
  piBundle,
  hyperframesCli,
  moduleResolver,
]) {
  if (!existsSync(required)) {
    throw new Error(`[closure-rat] smoke 输入缺失:${required}`);
  }
}

const results = {};
const startedAt = Date.now();
const record = (name, value = true) => {
  results[name] = value;
  console.log(`[closure-rat] ✓ ${name}${value === true ? "" : `: ${value}`}`);
};

const zod3 = await import("zod/v3");
const zod4 = await import("zod/v4");
if (
  zod3.z.string().parse("ok") !== "ok" ||
  zod4.z.string().parse("ok") !== "ok"
) {
  throw new Error("[closure-rat] bundled zod v3/v4 smoke 失败");
}
record("zod-v3-v4");

const otel = await import("@opentelemetry/api");
if (!otel.trace || !otel.context) {
  throw new Error("[closure-rat] bundled OpenTelemetry smoke 失败");
}
record("opentelemetry");

const s3 = await import("@aws-sdk/client-s3");
const s3Client = new s3.S3Client({
  region: "us-east-1",
  credentials: { accessKeyId: "rat", secretAccessKey: "rat-secret" },
});
if (!s3Client || typeof s3.PutObjectCommand !== "function") {
  throw new Error("[closure-rat] bundled S3 client smoke 失败");
}
s3Client.destroy();
record("s3-client");

const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();
const queryResult = await db.query("select 1 as ok");
if (queryResult.rows[0]?.ok !== 1) {
  throw new Error("[closure-rat] PGlite query smoke 失败");
}
await db.close();
record("pglite-query");

const transformers = await import("@xenova/transformers");
if (typeof transformers.pipeline !== "function") {
  throw new Error("[closure-rat] Xenova pipeline smoke 失败");
}
const sharpModule = await import("sharp");
const sharp = sharpModule.default ?? sharpModule;
const png = await sharp({
  create: {
    width: 2,
    height: 2,
    channels: 4,
    background: { r: 12, g: 34, b: 56, alpha: 1 },
  },
})
  .png()
  .toBuffer();
if (png.length < 16) {
  throw new Error("[closure-rat] sharp native smoke 失败");
}
record("local-ai-native");

// T-886：主进程能 import 不代表 worker_threads 能消费主线程注册的 resolver。
// 使用随包 Node 拉起真实 worker，只做模块加载（不下载模型、不跑推理），锁定生产消费边界。
const whisperWorkerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const req = createRequire(workerData.requireBase);
process.env.CREATOROS_RUNTIME_ROOT = workerData.runtimeRoot;
req(workerData.moduleResolverPath);
const loaded = req("@xenova/transformers");
parentPort.postMessage(typeof loaded.pipeline === "function" ? "ok" : "missing-pipeline");
`;
const whisperWorkerProbe = `
const { Worker } = require("node:worker_threads");
const worker = new Worker(${JSON.stringify(whisperWorkerSource)}, {
  eval: true,
  workerData: {
    requireBase: ${JSON.stringify(resolve(runtimeRoot, "frontend", "package.json"))},
    moduleResolverPath: ${JSON.stringify(moduleResolver)},
    runtimeRoot: ${JSON.stringify(runtimeRoot)},
  },
});
const timer = setTimeout(() => { console.error("worker-timeout"); process.exit(2); }, 30000);
worker.once("message", async (message) => {
  clearTimeout(timer);
  await worker.terminate();
  if (message !== "ok") process.exit(3);
  console.log("whisper-worker-module-load");
});
worker.once("error", (error) => { clearTimeout(timer); console.error(error); process.exit(4); });
`;
const whisperWorkerResult = spawnSync(smokeNode, ["-e", whisperWorkerProbe], {
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    CREATOROS_RUNTIME_ROOT: runtimeRoot,
  },
  timeout: 35_000,
});
if (
  whisperWorkerResult.status !== 0 ||
  !`${whisperWorkerResult.stdout}`.includes("whisper-worker-module-load")
) {
  throw new Error(
    `[closure-rat] Whisper worker 模块加载 smoke 失败(status=${whisperWorkerResult.status})\n${whisperWorkerResult.stdout}${whisperWorkerResult.stderr}`,
  );
}
record("whisper-worker-module-load");

const pi = await import(pathToFileURL(piBundle).href);
for (const name of [
  "createAgentSession",
  "ModelRegistry",
  "AuthStorage",
  "SessionManager",
  "DefaultResourceLoader",
]) {
  if (typeof pi[name] !== "function") {
    throw new Error(`[closure-rat] Pi bundle export 缺失:${name}`);
  }
}
record("pi-bundle");

const render = spawnSync(
  smokeNode,
  ["--require", moduleResolver, hyperframesCli, "--help"],
  {
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    CREATOROS_RUNTIME_ROOT: runtimeRoot,
  },
  timeout: 30_000,
  },
);
if (
  render.status !== 0 ||
  !`${render.stdout}`.includes("hyperframes") ||
  !`${render.stdout}`.includes("render")
) {
  throw new Error(
    `[closure-rat] HyperFrames CLI smoke 失败\n${render.stdout}${render.stderr}`,
  );
}
record("hyperframes-cli");

const ffmpegPath = resolve(mediaBin, `ffmpeg${suffix}`);
const ffprobePath = resolve(mediaBin, `ffprobe${suffix}`);
for (const [tool, toolPath] of [
  ["ffmpeg", ffmpegPath],
  ["ffprobe", ffprobePath],
]) {
  const probe = spawnSync(toolPath, ["-version"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (probe.status !== 0 || !`${probe.stdout}`.startsWith(`${tool} version`)) {
    throw new Error(
      `[closure-rat] ${tool} smoke 失败\n${probe.stdout}${probe.stderr}`,
    );
  }
  record(`${tool}-binary`);
}

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;
process.env.CREATOROS_BROWSERS_DIR = browsersDir;
const playwright = await import("@playwright/test");
const browser = await playwright.chromium.launch({ headless: true });
const chromiumPath = playwright.chromium.executablePath();
try {
  const page = await browser.newPage();
  await page.setContent("<title>CreatorOS RAT</title><main>ready</main>");
  if ((await page.title()) !== "CreatorOS RAT") {
    throw new Error("[closure-rat] Chromium 页面 smoke 失败");
  }
} finally {
  await browser.close();
}
record("bundled-chromium");

const tempRoot = mkdtempSync(resolve(tmpdir(), "creatoros-closure-rat-"));
const renderProject = resolve(tempRoot, "render-project");
const renderOutput = resolve(tempRoot, "render-smoke.mp4");
const gsapFile = resolve(
  runtimeRoot,
  "layers",
  "core",
  "render",
  "vendor",
  "gsap",
  "dist",
  "gsap.min.js",
);
mkdirSync(renderProject, { recursive: true });
writeFileSync(
  resolve(renderProject, "index.html"),
  `<!doctype html>
<html><head><meta charset="utf-8"><script src="gsap.min.js"></script></head>
<body style="margin:0;background:#111;color:#fff">
  <div id="root" data-composition-id="main" data-start="0" data-duration="0.20"
       data-width="320" data-height="180">
    <div id="card" class="clip" data-start="0" data-duration="0.20"
         data-track-index="1">CreatorOS</div>
  </div>
  <script>
    const tl = gsap.timeline({paused:true});
    tl.fromTo("#card",{opacity:0},{opacity:1,duration:.10},0);
    window.__timelines = {main:tl};
  </script>
</body></html>`,
);
copyFileSync(gsapFile, resolve(renderProject, "gsap.min.js"));
const renderVideo = spawnSync(
  smokeNode,
  [
    "--require",
    moduleResolver,
    hyperframesCli,
    "render",
    renderProject,
    "--output",
    renderOutput,
    "--fps",
    "24",
    "--quality",
    "draft",
    "--workers",
    "1",
    "--no-browser-gpu",
  ],
  {
    encoding: "utf8",
    env: {
      PATH: `${mediaBin}${delimiter}${process.env.PATH ?? ""}`,
      SystemRoot: process.env.SystemRoot,
      CREATOROS_RUNTIME_ROOT: runtimeRoot,
      HYPERFRAMES_BROWSER_PATH: chromiumPath,
      HYPERFRAMES_FFMPEG_PATH: ffmpegPath,
      HYPERFRAMES_FFPROBE_PATH: ffprobePath,
      HYPERFRAMES_TELEMETRY: "0",
    },
    timeout: 120_000,
  },
);
if (
  renderVideo.status !== 0 ||
  !existsSync(renderOutput) ||
  readFileSync(renderOutput).length < 1_000
) {
  throw new Error(
    `[closure-rat] HyperFrames 真渲染 smoke 失败(status=${renderVideo.status})\n${renderVideo.stdout}${renderVideo.stderr}`,
  );
}
record("hyperframes-render", `${readFileSync(renderOutput).length} bytes`);

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

const port = await freePort();
const verdictToken = createBuildSmokeVerdictToken({ sidecarPort: port });
const serverLogs = [];
const sidecarEnv = {
  ...process.env,
  CREATOROS_RUNTIME_ROOT: runtimeRoot,
  CREATOROS_BROWSERS_DIR: browsersDir,
  PLAYWRIGHT_BROWSERS_PATH: browsersDir,
  CREATOROS_BIN_DIR: mediaBin,
  CREATOROS_DESKTOP: "1",
  CREATOROS_SIDECAR_VERDICT_TOKEN: verdictToken,
  PGLITE_DATA_DIR: resolve(tempRoot, "db"),
  HOSTNAME: "127.0.0.1",
  PORT: String(port),
  NODE_ENV: "production",
};
delete sidecarEnv.CREATOROS_VERDICT_SIGNING_KEY_B64;
delete sidecarEnv.CREATOROS_VERDICT_PUBKEY_B64;
delete sidecarEnv.CREATOROS_ALLOW_VERDICT_SIGNING_KEY;
delete sidecarEnv.CREATOROS_SMOKE_BYPASS_VERDICT;
const sidecar = spawn(smokeNode, [resolve(runtimeRoot, "frontend", "server.js")], {
  cwd: resolve(runtimeRoot, "frontend"),
  env: sidecarEnv,
  // Windows 生产壳会持有 sidecar stdin，并以管道断开作为父进程死亡信号。
  // RAT 必须复现同一契约；`ignore` 会立即产生 EOF，让正确的孤儿防护主动退出。
  stdio: ["pipe", "pipe", "pipe"],
});
sidecar.stdout.on("data", (chunk) => serverLogs.push(`${chunk}`));
sidecar.stderr.on("data", (chunk) => serverLogs.push(`${chunk}`));
let mainHtml = "";
try {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (sidecar.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) {
        mainHtml = await response.text();
        if (mainHtml.includes(expectedMainTitle)) break;
      }
    } catch {
      // Server is still initializing.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  if (!mainHtml.includes(expectedMainTitle)) {
    throw new Error(
      `[closure-rat] Next 主页面 120 秒内未就绪(expectedTitle=${expectedMainTitle}, exit=${sidecar.exitCode})\n${serverLogs.join("").slice(-8000)}`,
    );
  }
  record(
    "next-main-page",
    `${expectedPackageBrandName}, ${mainHtml.length} bytes`,
  );
} finally {
  let requestedWindowsShutdown = false;
  let gracefulShutdownCompleted = true;
  if (sidecar.exitCode === null) {
    const exitPromise = new Promise((resolveExit) =>
      sidecar.once("exit", () => resolveExit(true)),
    );
    if (process.platform === "win32" && sidecar.stdin?.writable) {
      requestedWindowsShutdown = true;
      sidecar.stdin.write("__CREATOROS_SHUTDOWN__\n");
      sidecar.stdin.end();
    } else {
      sidecar.kill("SIGTERM");
    }
    gracefulShutdownCompleted = await Promise.race([
      exitPromise,
      new Promise((resolveWait) =>
        setTimeout(() => resolveWait(false), 10_000),
      ),
    ]);
  }
  if (sidecar.exitCode === null) sidecar.kill("SIGKILL");
  rmSync(tempRoot, { recursive: true, force: true });
  if (requestedWindowsShutdown && !gracefulShutdownCompleted) {
    throw new Error(
      "[closure-rat] Windows sidecar 未在停机哨兵后 10 秒内优雅退出",
    );
  }
  if (requestedWindowsShutdown) {
    record("windows-stdin-shutdown", "sentinel");
  }
}

const layerSummary = JSON.parse(
  readFileSync(resolve(runtimeRoot, "layer-summary.json"), "utf8"),
);
if (
  // [T-675] 与正式安装包使用同一总文件硬门；core 另保留更宽但明确的警戒线。
  // 旧 1,000 门槛已被正常业务闭包(1,022)越过，却仍远低于总预算，不能让 RAT
  // 与正式 Gate 使用两套互相矛盾的发布语义。
  layerSummary.runtime.files > 3_500 ||
  layerSummary.core.files > 1_500 ||
  layerSummary.nodeModulesDirectories !== 0
) {
  throw new Error(
    `[closure-rat] 文件预算失败:runtime=${layerSummary.runtime.files} core=${layerSummary.core.files} node_modules=${layerSummary.nodeModulesDirectories}`,
  );
}
record("file-budget", `runtime=${layerSummary.runtime.files},core=${layerSummary.core.files}`);

const report = {
  schemaVersion: 1,
  target,
  durationMs: Date.now() - startedAt,
  layerSummary,
  results,
};
writeFileSync(
  resolve(runtimeRoot, "runtime-smoke-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
