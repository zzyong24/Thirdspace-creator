import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve, sep } from "node:path";

const [closureArg, nccArg] = process.argv.slice(2);
if (!closureArg || !nccArg) {
  throw new Error(
    "usage: node finalize-ncc-core.mjs <closure-dir> <ncc-output-dir>",
  );
}

const repoRoot = process.cwd();
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
const closureRoot = resolve(repoRoot, closureArg);
const nccRoot = resolve(repoRoot, nccArg);
for (const target of [closureRoot, nccRoot]) {
  if (!target.startsWith(`${safeOutputBase}${sep}`)) {
    throw new Error(`[closure-rat] 输入必须位于 ${safeOutputBase} 内，拒绝:${target}`);
  }
}

const frontendRoot = resolve(closureRoot, "frontend");
const replacements = [
  ["runtime.js", "runtime.js"],
  ["detached-flush.js", "detached-flush.js"],
  ["package.json", "package.json"],
];
for (const [sourceName, destinationName] of replacements) {
  const source = resolve(nccRoot, sourceName);
  if (!existsSync(source)) {
    throw new Error(`[closure-rat] ncc 输出缺失:${source}`);
  }
  mkdirSync(frontendRoot, { recursive: true });
  copyFileSync(source, resolve(frontendRoot, destinationName));
}

const nccIndexPath = resolve(nccRoot, "index.js");
let nccIndex = readFileSync(nccIndexPath, "utf8");
let nativeDynamicRequirePatches = 0;
nccIndex = nccIndex.replace(
  /function webpackEmptyContext\(([$\w]+)\)\{var ([$\w]+)=new Error\("Cannot find module '"\+\1\+"'"\);\2\.code="MODULE_NOT_FOUND";throw \2\}/g,
  (_match, requestName) => {
    nativeDynamicRequirePatches += 1;
    return `function webpackEmptyContext(${requestName}){return require(${requestName})}`;
  },
);
nccIndex = nccIndex.replace(
  /function webpackEmptyAsyncContext\(([$\w]+)\)\{return Promise\.resolve\(\)\.then\(\(\)=>\{var ([$\w]+)=new Error\("Cannot find module '"\+\1\+"'"\);\2\.code="MODULE_NOT_FOUND";throw \2\}\)\}/g,
  (_match, requestName) => {
    nativeDynamicRequirePatches += 1;
    return `function webpackEmptyAsyncContext(${requestName}){return Promise.resolve().then(()=>require(${requestName}))}`;
  },
);
if (nativeDynamicRequirePatches === 0) {
  throw new Error(
    "[closure-rat] ncc 未发现预期 dynamic require context；拒绝输出可能无法读取 Next manifest 的 bundle",
  );
}
const resolverSource = resolve(
  repoRoot,
  "tools",
  "windows-closure-rat",
  "creatoros-module-resolver.cjs",
);
copyFileSync(
  resolverSource,
  resolve(frontendRoot, "creatoros-module-resolver.cjs"),
);
writeFileSync(
  resolve(frontendRoot, "server.js"),
  `require("./creatoros-module-resolver.cjs");\n${nccIndex}`,
);

// Next server/bootstrap 已由 ncc 收成 4 个文件，删除仅供其通用 Node resolution 的开发式
// node_modules。业务 external 仍由 adapter 的显式清单留在 .next，后续按 layer consumer 分流。
rmSync(resolve(frontendRoot, "node_modules"), { recursive: true, force: true });
const externalModules = resolve(frontendRoot, ".next", "node_modules");
const vendorRoot = resolve(frontendRoot, ".next", "vendor");
rmSync(vendorRoot, { recursive: true, force: true });
renameSync(externalModules, vendorRoot);

// RAT 当前只有 6 个次版本嵌套。显式 vendor resolver 统一到闭包挑选的主版本；
// 删除 npm 风格嵌套目录，确保安装树中 node_modules 目录数严格为 0。
const vendorPending = [vendorRoot];
let removedNestedNodeModules = 0;
while (vendorPending.length > 0) {
  const current = vendorPending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules") {
      rmSync(entryPath, { recursive: true, force: true });
      removedNestedNodeModules += 1;
    } else {
      vendorPending.push(entryPath);
    }
  }
}

let files = 0;
let bytes = 0;
let nodeModulesDirectories = 0;
const pending = [closureRoot];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") nodeModulesDirectories += 1;
      pending.push(entryPath);
    }
    else if (entry.isFile()) {
      files += 1;
      bytes += statSync(entryPath).size;
    }
  }
}
if (nodeModulesDirectories > 0) {
  throw new Error(
    `[closure-rat] 产物仍包含 ${nodeModulesDirectories} 个 node_modules 目录`,
  );
}
const summary = {
  schemaVersion: 1,
  closure: basename(closureRoot),
  nccFiles: replacements.length + 1,
  nativeDynamicRequirePatches,
  removedNestedNodeModules,
  files,
  bytes,
  nodeModulesDirectories,
};
writeFileSync(
  resolve(closureRoot, "ncc-core-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
