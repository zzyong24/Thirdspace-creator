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
import { assertVerdictPublicKey } from "../../frontend/scripts/desktop/verdict-key-material.mjs";

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

// Next build 的 public key 不能靠旧 build-sidecar 兜底：精简闭包不再经过那条巨型
// node_modules 组装链，所以在进入 Tauri 之前明确烘焙并校验。
const { publicKeyB64 } = assertVerdictPublicKey();
const verdictPath = resolve(
  closureRoot,
  "frontend",
  ".next",
  "server",
  "verdict-verify-key.json",
);
mkdirSync(dirname(verdictPath), { recursive: true });
writeFileSync(
  verdictPath,
  `${JSON.stringify({ publicKeyB64 }, null, 2)}\n`,
);

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
if (files > 3_500) {
  throw new Error(`[T-565] package runtime 超出 3,500 文件预算:${files}`);
}

const summary = {
  schemaVersion: 1,
  target: "windows-x86_64",
  runtimeFiles: files,
  runtimeBytes: bytes,
  nodeModulesDirectories,
  linksOrReparsePoints,
  externalBinBytes: statSync(externalBin).size,
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
