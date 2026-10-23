import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { bakeVerdictPublicKey } from "./bake-verdict-public-key.mjs";
import { stageCreatorOsCliRuntime } from "../../frontend/scripts/desktop/creatoros-cli-runtime.mjs";
import {
  cleanSidecarReusable,
  writeCleanSidecarPolicy,
} from "../../frontend/scripts/desktop/build-sidecar.mjs";

import { reportCapacity } from "./runtime-diagnostics.mjs";

const [closureArg] = process.argv.slice(2);
if (!closureArg) {
  throw new Error(
    "usage: node prepare-packaged-runtime.mjs <closure-dir>",
  );
}
if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error(
    `[T-565] production Windows runtime 只能在 win32-x64 物化，当前=${process.platform}-${process.arch}`,
  );
}

const repoRoot = process.cwd();
const closureRoot = resolve(repoRoot, closureArg);
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
if (!closureRoot.startsWith(`${safeOutputBase}${sep}`)) {
  throw new Error(`[T-565] closure 必须位于 ${safeOutputBase} 内`);
}

const sidecarRoot = resolve(repoRoot, "frontend", "src-tauri", "sidecar");
const binariesRoot = resolve(repoRoot, "frontend", "src-tauri", "binaries");
const runtimeNode = resolve(
  closureRoot,
  "layers",
  "core",
  "bin",
  "creatoros-server.exe",
);
const serverEntry = resolve(closureRoot, "frontend", "server.js");
for (const required of [
  runtimeNode,
  serverEntry,
  resolve(closureRoot, "frontend", "creatoros-module-resolver.cjs"),
  resolve(closureRoot, "frontend", ".next"),
  resolve(closureRoot, "backend", "drizzle", "meta", "_journal.json"),
  resolve(closureRoot, "layers", "browser", "browsers"),
  resolve(closureRoot, "layers", "media", "bin"),
  resolve(closureRoot, "layers", "local-ai", "vendor"),
]) {
  if (!existsSync(required)) {
    throw new Error(`[T-565] package closure 缺关键资源:${required}`);
  }
}

// 精简闭包不经过旧 build-sidecar；公共构建入口已在 runtime smoke 前烘焙公钥，
// 这里再次执行同一个幂等 helper，防止脚本被单独调用时生成安装后必白屏的包。
bakeVerdictPublicKey(closureRoot);

// [T-847] 少文件 production closure 不经过 full build-sidecar，因此必须在复制给 Tauri 前
// 显式生成 contract 同源 CLI bundle，并复用本包的 creatoros-server.exe 作为 CLI Node。
// 这样 Tauri beforeBuildCommand 的二次幂等打包不会再因 CLI runtime 缺失而中止，也不会
// 把 CI runner 上可能不同版本的 process.execPath 混进用户安装包。
stageCreatorOsCliRuntime({
  repoRoot,
  runtimeRoot: closureRoot,
  nodeExecutablePath: runtimeNode,
  targetPlatform: "win32",
});

rmSync(sidecarRoot, { recursive: true, force: true });
rmSync(binariesRoot, { recursive: true, force: true });
mkdirSync(dirname(sidecarRoot), { recursive: true });
cpSync(closureRoot, sidecarRoot, {
  recursive: true,
  dereference: true,
  force: false,
  errorOnExist: true,
});

mkdirSync(binariesRoot, { recursive: true });
const externalBin = resolve(
  binariesRoot,
  "creatoros-server-x86_64-pc-windows-msvc.exe",
);
cpSync(runtimeNode, externalBin);

// Tauri externalBin 已经携带同一份 Node；安装 runtime 再留一份只会白白增加约 90MB。
rmSync(resolve(sidecarRoot, "layers", "core", "bin"), {
  recursive: true,
  force: true,
});

// RAT 报告作为 Actions 证据单独上传，不进入用户安装目录。
for (const report of [
  "layer-summary.json",
  "ncc-core-summary.json",
  "runtime-smoke-results.json",
]) {
  rmSync(resolve(sidecarRoot, report), { force: true });
}

// [T-675] 生产精简闭包已经是可复用的 clean runtime。显式写入发布 CSP
// 标记，供 package.mjs 后续 CREATOROS_SKIP_SIDECAR_REBUILD=1 稳定短路；
// 当前 prepare 步骤的 workflow env 可能没有 signing-required，不能直接透传。
const cleanPolicyEnv = {
  ...process.env,
  CREATOROS_SIDECAR_SIGNING_REQUIRED: "1",
};
writeCleanSidecarPolicy(sidecarRoot, cleanPolicyEnv);
if (!cleanSidecarReusable(sidecarRoot)) {
  throw new Error("[T-675] packaged runtime clean policy 写入后校验失败");
}

let files = 0;
let bytes = 0;
let nodeModulesDirectories = 0;
let linksOrReparsePoints = 0;
const pending = [sidecarRoot];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      linksOrReparsePoints += 1;
      continue;
    }
    if (stat.isDirectory()) {
      if (entry.name === "node_modules") nodeModulesDirectories += 1;
      pending.push(entryPath);
    } else if (stat.isFile()) {
      files += 1;
      bytes += statSync(entryPath).size;
    }
  }
}
if (nodeModulesDirectories !== 0 || linksOrReparsePoints !== 0) {
  throw new Error(
    `[T-565] package runtime 结构违规:node_modules=${nodeModulesDirectories}, links=${linksOrReparsePoints}`,
  );
}
const capacity = reportCapacity({runtimeFiles: files});

const summary = {
  schemaVersion: 1,
  target: "windows-x86_64",
  runtimeFiles: files,
  capacityWarnings: capacity,
  runtimeBytes: bytes,
  nodeModulesDirectories,
  linksOrReparsePoints,
  externalBinBytes: statSync(externalBin).size,
  cliBundle: relative(
    sidecarRoot,
    resolve(sidecarRoot, "frontend", "cli", "creatoros.cjs"),
  ).split(sep).join("/"),
  cliBundleBytes: statSync(
    resolve(sidecarRoot, "frontend", "cli", "creatoros.cjs"),
  ).size,
  cliNode: relative(
    sidecarRoot,
    resolve(sidecarRoot, "cli", "node.exe"),
  ).split(sep).join("/"),
  cliNodeBytes: statSync(resolve(sidecarRoot, "cli", "node.exe")).size,
  serverEntry: relative(sidecarRoot, resolve(sidecarRoot, "frontend", "server.js"))
    .split(sep)
    .join("/"),
};
const summaryPath = resolve(
  repoRoot,
  "tools",
  "windows-closure-rat",
  "out",
  "packaged-runtime-summary.json",
);
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
