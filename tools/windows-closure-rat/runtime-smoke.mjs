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
for (const required of [runtimeNode, browsersDir, piBundle, hyperframesCli]) {
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

for (const tool of ["ffmpeg", "ffprobe"]) {
  const toolPath = resolve(mediaBin, `${tool}${suffix}`);
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
const serverLogs = [];
const sidecar = spawn(smokeNode, [resolve(runtimeRoot, "frontend", "server.js")], {
  cwd: resolve(runtimeRoot, "frontend"),
  env: {
    ...process.env,
    CREATOROS_RUNTIME_ROOT: runtimeRoot,
    CREATOROS_BROWSERS_DIR: browsersDir,
    PLAYWRIGHT_BROWSERS_PATH: browsersDir,
    CREATOROS_BIN_DIR: mediaBin,
    CREATOROS_DESKTOP: "1",
    CREATOROS_SMOKE_BYPASS_VERDICT: "1",
    PGLITE_DATA_DIR: resolve(tempRoot, "db"),
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "production",
  },
  stdio: ["ignore", "pipe", "pipe"],
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
        if (mainHtml.includes("<title>CreatorOS</title>")) break;
      }
    } catch {
      // Server is still initializing.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  if (!mainHtml.includes("<title>CreatorOS</title>")) {
    throw new Error(
      `[closure-rat] Next 主页面 120 秒内未就绪(exit=${sidecar.exitCode})\n${serverLogs.join("").slice(-8000)}`,
    );
  }
  record("next-main-page", `${mainHtml.length} bytes`);
} finally {
  if (sidecar.exitCode === null) {
    sidecar.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => sidecar.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 10_000)),
    ]);
  }
  if (sidecar.exitCode === null) sidecar.kill("SIGKILL");
  rmSync(tempRoot, { recursive: true, force: true });
}

const layerSummary = JSON.parse(
  readFileSync(resolve(runtimeRoot, "layer-summary.json"), "utf8"),
);
if (
  layerSummary.runtime.files > 5_000 ||
  layerSummary.core.files > 1_000 ||
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
