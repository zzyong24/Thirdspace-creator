import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";

const [standaloneArg] = process.argv.slice(2);
if (!standaloneArg) {
  throw new Error(
    "usage: node prepare-next-bootstrap.mjs <next-standalone-dir>",
  );
}

const repoRoot = process.cwd();
const expectedRoot = resolve(repoRoot, "frontend", ".next", "standalone");
const standaloneRoot = resolve(repoRoot, standaloneArg);
if (
  standaloneRoot !== expectedRoot &&
  !standaloneRoot.startsWith(`${expectedRoot}${sep}`)
) {
  throw new Error(
    `[closure-rat] 只允许整理 Next standalone 产物，拒绝:${standaloneRoot}`,
  );
}
if (!existsSync(standaloneRoot) || !lstatSync(standaloneRoot).isDirectory()) {
  throw new Error(`[closure-rat] Next standalone 目录不存在:${standaloneRoot}`);
}

// ncc 0.38 会把 Next 自带的 `*.js.map` 当作嵌套 JavaScript asset 再编译，
// 第一字符即 JSON 的 source map 因而报 Unexpected token。source map 不参与
// 生产运行，先在临时 standalone 产物中删除，既让 bootstrap 跨平台稳定收束，
// 也避免把数百个调试文件交给 Windows Defender。
//
// NFT standalone 只复制 Next 的运行时子集；ncc 的 webpack resolver 会从工作区
// node_modules 补齐它静态分析到的可选运行时。因此两个位置都必须清理。这里只
// 删除 pnpm 安装目录里的 `.map` 目录项，不修改 pnpm store 内容或任何源码。
const frontendRequire = createRequire(
  resolve(repoRoot, "frontend", "package.json"),
);
const workspaceNextRoot = dirname(frontendRequire.resolve("next/package.json"));
const workspaceNodeModules = resolve(repoRoot, "node_modules");
if (
  workspaceNextRoot !== workspaceNodeModules &&
  !workspaceNextRoot.startsWith(`${workspaceNodeModules}${sep}`)
) {
  throw new Error(
    `[closure-rat] Next 未解析到工作区 node_modules，拒绝:${workspaceNextRoot}`,
  );
}

let removedSourceMaps = 0;
let removedBytes = 0;
const removedSamples = [];
const cleanupRoots = [standaloneRoot, workspaceNextRoot];
const pending = [...cleanupRoots];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      pending.push(entryPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".map")) {
      continue;
    }
    const stat = lstatSync(entryPath);
    removedBytes += stat.size;
    removedSourceMaps += 1;
    if (removedSamples.length < 10) {
      const cleanupRoot =
        cleanupRoots.find(
          (candidate) =>
            entryPath === candidate || entryPath.startsWith(`${candidate}${sep}`),
        ) ?? standaloneRoot;
      removedSamples.push(
        `${cleanupRoot === standaloneRoot ? "standalone" : "workspace-next"}/${
          relative(cleanupRoot, entryPath).replaceAll("\\", "/")
        }`,
      );
    }
    rmSync(entryPath);
  }
}

if (removedSourceMaps === 0) {
  throw new Error(
    "[closure-rat] 未发现 Next source map；拒绝静默跳过预期的 bootstrap 清理",
  );
}

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      removedSourceMaps,
      removedBytes,
      removedSamples,
    },
    null,
    2,
  ),
);
