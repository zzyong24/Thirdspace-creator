import {
  copyFileSync,
  cpSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { ensureFfmpegStatic, ensureFfprobeStatic } from "../../frontend/scripts/desktop/fetch-ffmpeg.mjs";
import { playwrightBrowsersCacheRoot } from "../../frontend/scripts/desktop/platform-paths.mjs";

import { stageLayeredWorkers } from "./stage-layered-workers.mjs";

const [closureArg, piBundleArg] = process.argv.slice(2);
if (!closureArg || !piBundleArg) {
  throw new Error(
    "usage: node assemble-runtime-layers.mjs <closure-dir> <pi-bundle.mjs>",
  );
}

const repoRoot = process.cwd();
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
const closureRoot = resolve(repoRoot, closureArg);
const piBundle = resolve(repoRoot, piBundleArg);
if (!closureRoot.startsWith(`${safeOutputBase}${sep}`)) {
  throw new Error(`[closure-rat] closure 必须位于 ${safeOutputBase} 内`);
}
if (!piBundle.startsWith(`${safeOutputBase}${sep}`) || !existsSync(piBundle)) {
  throw new Error(`[closure-rat] Pi bundle 缺失或越界:${piBundle}`);
}

const coreVendor = resolve(closureRoot, "frontend", ".next", "vendor");
const browserVendor = resolve(closureRoot, "layers", "browser", "vendor");
const localAiVendor = resolve(closureRoot, "layers", "local-ai", "vendor");
const coreRenderVendor = resolve(
  closureRoot,
  "layers",
  "core",
  "render",
  "vendor",
);
for (const root of [browserVendor, localAiVendor, coreRenderVendor]) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
}

function packagePath(root, packageName) {
  return resolve(root, ...packageName.split("/"));
}

const movedPackages = [];
function movePackage(packageName, destinationRoot) {
  const source = packagePath(coreVendor, packageName);
  if (!existsSync(source)) return;
  const destination = packagePath(destinationRoot, packageName);
  mkdirSync(dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  renameSync(source, destination);
  movedPackages.push(packageName);
}

const browserPackages = new Set([
  "@bramus/specificity",
  "@playwright/test",
  "balanced-match",
  "bidi-js",
  "brace-expansion",
  "css-tree",
  "data-urls",
  "decimal.js",
  "entities",
  "html-encoding-sniffer",
  "is-potential-custom-element-name",
  "jsdom",
  "mdn-data",
  "parse5",
  "playwright",
  "playwright-core",
  "punycode",
  "saxes",
  "symbol-tree",
  "tldts",
  "tough-cookie",
  "tr46",
  "undici",
  "w3c-xmlserializer",
  "webidl-conversions",
  "whatwg-mimetype",
  "whatwg-url",
  "xml-name-validator",
  "xmlchars",
]);
const localAiPackages = new Set([
  "@exodus/bytes",
  "@huggingface/jinja",
  "@xenova/transformers",
  "color",
  "color-convert",
  "color-name",
  "color-string",
  "detect-libc",
  "is-arrayish",
  "onnxruntime-common",
  "onnxruntime-node",
  "onnxruntime-web",
  "sharp",
  "simple-swizzle",
]);

for (const scope of ["@asamuzakjp", "@csstools"]) {
  const scopeRoot = resolve(coreVendor, scope);
  if (!existsSync(scopeRoot)) continue;
  for (const entry of readdirSync(scopeRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) browserPackages.add(`${scope}/${entry.name}`);
  }
}
for (const packageName of [...browserPackages].sort()) {
  movePackage(packageName, browserVendor);
}
for (const packageName of [...localAiPackages].sort()) {
  movePackage(packageName, localAiVendor);
}

// sharp 0.32 的 vendor/include 是编译头文件，运行时只加载 build/Release + vendor/lib。
// 仅删除明确的 include 子树，并由后续真 import 证明没有误剪运行资产。
let removedSharpHeaders = 0;
let copiedSharpDlls = 0;
const sharpRoot = packagePath(localAiVendor, "sharp");
if (existsSync(sharpRoot)) {
  const pending = [sharpRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = resolve(current, entry.name);
      if (entry.name === "include") {
        rmSync(entryPath, { recursive: true, force: true });
        removedSharpHeaders += 1;
      } else {
        pending.push(entryPath);
      }
    }
  }

  // sharp 0.32 的 Windows 安装脚本会把 vendor/lib 下的 libvips DLL 复制到
  // build/Release，Windows loader 才能在加载 sharp-*.node 时找到它们。
  // NFT 只能看到 `.node` 的 JS 引用，看不到 PE 文件的 DLL imports，因此这里
  // 显式重放这一步；否则闭包“文件数合格”但原生模块一定在用户机器上启动失败。
  if (process.platform === "win32") {
    const sharpManifest = JSON.parse(
      readFileSync(resolve(sharpRoot, "package.json"), "utf8"),
    );
    const sourcePnpmRoot = resolve(repoRoot, "node_modules", ".pnpm");
    const sharpEntry = readdirSync(sourcePnpmRoot).find((entry) =>
      entry.startsWith(`sharp@${sharpManifest.version}`),
    );
    if (!sharpEntry) {
      throw new Error(
        `[closure-rat] sharp ${sharpManifest.version} 源包缺失，无法补齐 Windows DLL`,
      );
    }
    const sourceSharpRoot = resolve(
      sourcePnpmRoot,
      sharpEntry,
      "node_modules",
      "sharp",
    );
    const buildReleaseRoot = resolve(sharpRoot, "build", "Release");
    mkdirSync(buildReleaseRoot, { recursive: true });

    const dllPending = [
      resolve(sourceSharpRoot, "vendor"),
      resolve(sourceSharpRoot, "build", "Release"),
    ].filter((candidate) => existsSync(candidate));
    const copiedDllNames = new Set();
    while (dllPending.length > 0) {
      const current = dllPending.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          dllPending.push(entryPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".dll")) {
          copyFileSync(entryPath, resolve(buildReleaseRoot, entry.name));
          copiedDllNames.add(entry.name.toLowerCase());
        }
      }
    }
    copiedSharpDlls = copiedDllNames.size;
    if (copiedSharpDlls === 0) {
      throw new Error(
        `[closure-rat] sharp ${sharpManifest.version} Windows vendor 未发现 DLL`,
      );
    }
  }
}

function findSourcePackage(packageName) {
  const pnpmRoot = resolve(repoRoot, "node_modules", ".pnpm");
  const encoded = packageName.replace("/", "+");
  for (const entry of readdirSync(pnpmRoot)) {
    if (!entry.startsWith(`${encoded}@`)) continue;
    const candidate = resolve(
      pnpmRoot,
      entry,
      "node_modules",
      ...packageName.split("/"),
    );
    if (existsSync(resolve(candidate, "package.json"))) return candidate;
  }
  throw new Error(`[closure-rat] 源包缺失:${packageName}`);
}

const esbuildModule = resolve(
  repoRoot,
  "node_modules",
  ".pnpm",
  "node_modules",
  "esbuild",
  "lib",
  "main.js",
);
if (!existsSync(esbuildModule)) {
  throw new Error(`[closure-rat] esbuild module 缺失:${esbuildModule}`);
}
const { buildSync } = createRequire(import.meta.url)(esbuildModule);
function esbuildBundle(input, output, format, options = {}) {
  mkdirSync(dirname(output), { recursive: true });
  buildSync({
    entryPoints: [input],
    bundle: true,
    platform: "node",
    format,
    target: "node25",
    outfile: output,
    logLevel: "warning",
    banner: options.banner ? { js: options.banner } : undefined,
    external: options.external,
  });
}

// 把仍需作为 Next external 的纯 JS 包收成极少文件。入口/子路径保持原契约，
// native/WASM 包不走这里。
const zodSource = findSourcePackage("zod");
const zodDestination = packagePath(coreVendor, "zod");
rmSync(zodDestination, { recursive: true, force: true });
for (const subpath of ["index", "v3", "v4"]) {
  const source = resolve(zodSource, subpath === "index" ? "index.js" : subpath, subpath === "index" ? "" : "index.js");
  const outputBase = resolve(zodDestination, `${subpath}`);
  esbuildBundle(source, `${outputBase}.mjs`, "esm");
  esbuildBundle(source, `${outputBase}.cjs`, "cjs");
}
writeFileSync(
  resolve(zodDestination, "package.json"),
  `${JSON.stringify({
    name: "zod",
    type: "module",
    exports: Object.fromEntries(
      ["index", "v3", "v4"].map((subpath) => [
        subpath === "index" ? "." : `./${subpath}`,
        {
          import: `./${subpath}.mjs`,
          require: `./${subpath}.cjs`,
          default: `./${subpath}.mjs`,
        },
      ]),
    ),
  }, null, 2)}\n`,
);

const otelSource = findSourcePackage("@opentelemetry/api");
const otelDestination = packagePath(coreVendor, "@opentelemetry/api");
rmSync(otelDestination, { recursive: true, force: true });
esbuildBundle(
  resolve(otelSource, "build", "src", "index.js"),
  resolve(otelDestination, "index.cjs"),
  "cjs",
);
writeFileSync(
  resolve(otelDestination, "package.json"),
  `${JSON.stringify({
    name: "@opentelemetry/api",
    main: "./index.cjs",
    exports: { ".": "./index.cjs" },
  }, null, 2)}\n`,
);

const s3Source = findSourcePackage("@aws-sdk/client-s3");
const s3BundleTemp = resolve(closureRoot, "layers", "core", "s3-client.cjs");
esbuildBundle(
  resolve(s3Source, "dist-cjs", "index.js"),
  s3BundleTemp,
  "cjs",
);
for (const scope of ["@aws", "@aws-crypto", "@aws-sdk", "@smithy"]) {
  rmSync(resolve(coreVendor, scope), { recursive: true, force: true });
}
const s3Destination = packagePath(coreVendor, "@aws-sdk/client-s3");
mkdirSync(s3Destination, { recursive: true });
renameSync(s3BundleTemp, resolve(s3Destination, "index.cjs"));
writeFileSync(
  resolve(s3Destination, "package.json"),
  `${JSON.stringify({
    name: "@aws-sdk/client-s3",
    main: "./index.cjs",
    exports: { ".": "./index.cjs" },
  }, null, 2)}\n`,
);

const pgliteRoot = packagePath(coreVendor, "@electric-sql/pglite");
let removedUnusedPgliteFiles = 0;
for (const removable of [
  resolve(pgliteRoot, "dist", "contrib"),
]) {
  if (!existsSync(removable)) continue;
  const before = treeFileCount(removable);
  rmSync(removable, { recursive: true, force: true });
  removedUnusedPgliteFiles += before;
}
const pglitePending = [resolve(pgliteRoot, "dist")];
while (pglitePending.length > 0) {
  const current = pglitePending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) pglitePending.push(entryPath);
    else if (entry.isFile() && entry.name.endsWith(".tar.gz")) {
      rmSync(entryPath, { force: true });
      removedUnusedPgliteFiles += 1;
    }
  }
}

const hyperframesSource = findSourcePackage("hyperframes");
const hyperframesDestination = packagePath(coreRenderVendor, "hyperframes");
mkdirSync(resolve(hyperframesDestination, "dist"), { recursive: true });
copyFileSync(
  resolve(hyperframesSource, "package.json"),
  resolve(hyperframesDestination, "package.json"),
);
esbuildBundle(
  resolve(hyperframesSource, "dist", "cli.js"),
  resolve(hyperframesDestination, "dist", "cli.js"),
  "esm",
  {
    banner:
      "import { createRequire as __creatorosCreateRequire } from 'node:module'; const require = __creatorosCreateRequire(import.meta.url);",
    external: [
      "onnxruntime-node",
      "sharp",
      "canvas",
      "bufferutil",
      "utf-8-validate",
      "@hyperframes/aws-lambda/sdk",
      "@hyperframes/gcp-cloud-run/sdk",
    ],
  },
);
const hyperframeCoreDist = resolve(
  closureRoot,
  "layers",
  "core",
  "render",
  "core",
  "dist",
);
mkdirSync(hyperframeCoreDist, { recursive: true });
for (const file of [
  "hyperframe.manifest.json",
  "hyperframe.runtime.iife.js",
]) {
  copyFileSync(
    resolve(hyperframesSource, "dist", file),
    resolve(hyperframeCoreDist, file),
  );
}
const gsapSource = findSourcePackage("gsap");
for (const file of ["package.json", "dist/gsap.min.js"]) {
  const destination = resolve(coreRenderVendor, "gsap", file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(gsapSource, file), destination);
}

const hyperframesEsbuild = realpathSync(
  resolve(hyperframesSource, "..", "esbuild"),
);
const esbuildPlatformPackage =
  process.platform === "win32"
    ? "@esbuild/win32-x64"
    : process.platform === "darwin"
      ? `@esbuild/darwin-${process.arch}`
      : `@esbuild/linux-${process.arch}`;
const esbuildPlatformSource = realpathSync(
  resolve(hyperframesEsbuild, "..", "@esbuild", esbuildPlatformPackage.split("/")[1]),
);
cpSync(
  esbuildPlatformSource,
  packagePath(coreRenderVendor, esbuildPlatformPackage),
  { recursive: true, dereference: true },
);

const piDestination = resolve(
  closureRoot,
  "layers",
  "core",
  "pi",
  "pi-bundle.mjs",
);
mkdirSync(dirname(piDestination), { recursive: true });
copyFileSync(piBundle, piDestination);

const browserRegistry = JSON.parse(
  readFileSync(resolve(browserVendor, "playwright-core", "browsers.json"), "utf8"),
);
const chromiumRevisions = {};
const browserCacheRoot = playwrightBrowsersCacheRoot(
  process.platform,
  process.env,
  homedir(),
);
for (const browserName of ["chromium", "chromium-headless-shell"]) {
  const browser = browserRegistry.browsers.find(
    (entry) => entry.name === browserName,
  );
  if (!browser?.revision) {
    throw new Error(`[closure-rat] playwright-core 未声明 ${browserName} revision`);
  }
  chromiumRevisions[browserName] = browser.revision;
  const cacheName = `${browserName.replaceAll("-", "_")}-${browser.revision}`;
  const browserSource = resolve(browserCacheRoot, cacheName);
  if (!existsSync(browserSource)) {
    throw new Error(
      `[closure-rat] ${browserName} ${browser.revision} 未安装:${browserSource}`,
    );
  }
  const browserDestination = resolve(
    closureRoot,
    "layers",
    "browser",
    "browsers",
    cacheName,
  );
  mkdirSync(dirname(browserDestination), { recursive: true });
  cpSync(browserSource, browserDestination, {
    recursive: true,
    dereference: true,
  });
}

const tripleByHost = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
};
const triple = tripleByHost[`${process.platform}-${process.arch}`];
if (!triple) {
  throw new Error(`[closure-rat] 未映射 host:${process.platform}-${process.arch}`);
}
const mediaBin = resolve(closureRoot, "layers", "media", "bin");
mkdirSync(mediaBin, { recursive: true });
for (const [name, source] of [
  ["ffmpeg", ensureFfmpegStatic(triple)],
  ["ffprobe", ensureFfprobeStatic(triple)],
]) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const destination = resolve(mediaBin, `${name}${suffix}`);
  copyFileSync(source, destination);
  if (process.platform !== "win32") chmodSync(destination, 0o755);
}

const runtimeBin = resolve(closureRoot, "layers", "core", "bin");
mkdirSync(runtimeBin, { recursive: true });
const runtimeNode = resolve(
  runtimeBin,
  process.platform === "win32" ? "creatoros-server.exe" : "creatoros-server",
);
copyFileSync(process.execPath, runtimeNode);
if (process.platform !== "win32") chmodSync(runtimeNode, 0o755);

stageLayeredWorkers({repoRoot, runtimeRoot: closureRoot});

function treeStats(root) {
  if (!existsSync(root)) return { files: 0, bytes: 0, symlinks: 0 };
  let files = 0;
  let bytes = 0;
  let symlinks = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = resolve(current, entry.name);
      const stat = lstatSync(entryPath);
      if (stat.isSymbolicLink()) symlinks += 1;
      else if (stat.isDirectory()) pending.push(entryPath);
      else if (stat.isFile()) {
        files += 1;
        bytes += stat.size;
      }
    }
  }
  return { files, bytes, symlinks };
}

function treeFileCount(root) {
  return treeStats(root).files;
}

let nodeModulesDirectories = 0;
const scan = [closureRoot];
while (scan.length > 0) {
  const current = scan.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules") nodeModulesDirectories += 1;
    scan.push(resolve(current, entry.name));
  }
}

const frontendStats = treeStats(resolve(closureRoot, "frontend"));
const backendStats = treeStats(resolve(closureRoot, "backend"));
const coreLayerStats = treeStats(resolve(closureRoot, "layers", "core"));
const summary = {
  schemaVersion: 1,
  target: `${process.platform}-${process.arch}`,
  triple,
  chromiumRevisions,
  movedPackages: movedPackages.length,
  removedSharpHeaders,
  copiedSharpDlls,
  removedUnusedPgliteFiles,
  core: {
    files: frontendStats.files + backendStats.files + coreLayerStats.files,
    bytes: frontendStats.bytes + backendStats.bytes + coreLayerStats.bytes,
  },
  browser: treeStats(resolve(closureRoot, "layers", "browser")),
  media: treeStats(resolve(closureRoot, "layers", "media")),
  localAi: treeStats(resolve(closureRoot, "layers", "local-ai")),
  runtime: treeStats(closureRoot),
  nodeModulesDirectories,
};
if (
  (process.platform === "win32" && summary.runtime.symlinks !== 0) ||
  nodeModulesDirectories !== 0
) {
  throw new Error(
    `[closure-rat] 产物结构违规:symlinks=${summary.runtime.symlinks} node_modules=${nodeModulesDirectories}`,
  );
}
writeFileSync(
  resolve(closureRoot, "layer-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
