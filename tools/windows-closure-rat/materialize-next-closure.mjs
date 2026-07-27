import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const [reportArg, outputArg] = process.argv.slice(2);
if (!reportArg || !outputArg) {
  throw new Error(
    "usage: node materialize-next-closure.mjs <next-adapter-report.json> <output-dir>",
  );
}

const repoRoot = process.cwd();
const reportPath = resolve(repoRoot, reportArg);
const outputRoot = resolve(repoRoot, outputArg);
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
if (outputRoot !== safeOutputBase && !outputRoot.startsWith(`${safeOutputBase}${sep}`)) {
  throw new Error(`[closure-rat] output 必须位于 ${safeOutputBase} 内，拒绝:${outputRoot}`);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const assetSources = new Map();

function assertRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`[closure-rat] 非法 ${label}:${JSON.stringify(value)}`);
  }
}

function registerAsset(destination, source) {
  assertRelativePath(destination, "destination");
  assertRelativePath(source, "source");
  const prior = assetSources.get(destination);
  if (prior && prior !== source) {
    throw new Error(
      `[closure-rat] 同一 destination 指向两个 source:${destination} <- ${prior} / ${source}`,
    );
  }
  assetSources.set(destination, source);
}

for (const rawOutputs of Object.values(report.outputs)) {
  const outputs = Array.isArray(rawOutputs) ? rawOutputs : rawOutputs ? [rawOutputs] : [];
  for (const output of outputs) {
    if (output.filePath) registerAsset(output.filePath, output.filePath);
    for (const [destination, source] of Object.entries(output.assets ?? {})) {
      registerAsset(destination, source);
    }
  }
}

registerAsset(
  "frontend/server.js",
  "frontend/.next/standalone/frontend/server.js",
);

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const [destination, source] of [...assetSources].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const tracedSourcePath = resolve(
    repoRoot,
    "frontend",
    ".next",
    "standalone",
    source,
  );
  // Adapter 对 external package 会登记一个目录 symlink。直接从开发 node_modules
  // dereference 会把整个包/依赖树复制进来；standalone 中的对应路径才是 NFT 已追踪子集。
  const sourcePath = existsSync(tracedSourcePath)
    ? tracedSourcePath
    : resolve(repoRoot, source);
  const destinationPath = resolve(outputRoot, destination);
  if (!destinationPath.startsWith(`${outputRoot}${sep}`)) {
    throw new Error(`[closure-rat] destination 越界:${destination}`);
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`[closure-rat] source 不存在:${source}`);
  }
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, {
    recursive: true,
    dereference: true,
    force: false,
    errorOnExist: true,
  });
}

const standalonePnpm = resolve(
  repoRoot,
  "frontend",
  ".next",
  "standalone",
  "node_modules",
  ".pnpm",
);
const nextEntry = readdirSync(standalonePnpm).find((entry) =>
  entry.startsWith(`next@${report.nextVersion}_`),
);
if (!nextEntry) {
  throw new Error(`[closure-rat] standalone 未找到 next@${report.nextVersion} entry`);
}
const nextEntryModules = resolve(standalonePnpm, nextEntry, "node_modules");
for (const packageName of [
  "@next/env",
  "@opentelemetry/api",
  "@swc/helpers",
  "react",
  "react-dom",
  "sharp",
  "styled-jsx",
]) {
  const sourcePath = resolve(nextEntryModules, packageName);
  const destinationPath = resolve(
    outputRoot,
    "frontend",
    "node_modules",
    packageName,
  );
  if (!existsSync(sourcePath)) {
    throw new Error(`[closure-rat] Next peer 缺失:${packageName}`);
  }
  if (!existsSync(destinationPath)) {
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath, {
      recursive: true,
      dereference: true,
      force: false,
      errorOnExist: true,
    });
  }
}

const standaloneExternals = resolve(
  repoRoot,
  "frontend",
  ".next",
  "standalone",
  "frontend",
  ".next",
  "node_modules",
);
const externalRootEntries = new Set();
const externalAliasByEntry = new Map();
const externalPending = [standaloneExternals];
while (externalPending.length > 0) {
  const current = externalPending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      externalPending.push(entryPath);
      continue;
    }
    if (!entry.isSymbolicLink()) continue;
    const target = resolve(dirname(entryPath), readlinkSync(entryPath)).replaceAll("\\", "/");
    const marker = "/node_modules/.pnpm/";
    const index = target.indexOf(marker);
    if (index < 0) {
      throw new Error(
        `[closure-rat] external 未指向 standalone .pnpm:${entryPath} -> ${target}`,
      );
    }
    const rootEntry = target.slice(index + marker.length).split("/node_modules/")[0];
    externalRootEntries.add(rootEntry);
    externalAliasByEntry.set(rootEntry, relative(standaloneExternals, entryPath));
  }
}
// ncc 收掉的是 Next server/bootstrap；Turbopack 产出的 route chunks 仍显式 require
// 少量 next/dist/* external。把 Next 自身也作为一个“已追踪文件子集”参与 hoist，
// 不再保留 frontend/node_modules/next 的 930 文件通用包。
externalRootEntries.add(nextEntry);

const sourcePnpm = resolve(repoRoot, "node_modules", ".pnpm");
const entryNames = new Map();
function packageNameForEntry(entryName) {
  if (entryNames.has(entryName)) return entryNames.get(entryName);
  const modulesPath = resolve(sourcePnpm, entryName, "node_modules");
  const candidates = [];
  const inspect = (candidatePath, expectedName) => {
    let stat;
    try {
      stat = lstatSync(candidatePath);
    } catch {
      return;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    const manifestPath = resolve(candidatePath, "package.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name === expectedName) candidates.push(expectedName);
  };
  for (const entry of readdirSync(modulesPath, { withFileTypes: true })) {
    const entryPath = resolve(modulesPath, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const child of readdirSync(entryPath, { withFileTypes: true })) {
        inspect(resolve(entryPath, child.name), `${entry.name}/${child.name}`);
      }
    } else {
      inspect(entryPath, entry.name);
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `[closure-rat] 无法识别 .pnpm entry 真身:${entryName} candidates=${candidates.join(",")}`,
    );
  }
  entryNames.set(entryName, candidates[0]);
  return candidates[0];
}

function dependencyEntriesOf(entryName) {
  const modulesPath = resolve(standalonePnpm, entryName, "node_modules");
  const dependencies = new Set();
  if (!existsSync(modulesPath)) return dependencies;
  const pendingModules = [modulesPath];
  while (pendingModules.length > 0) {
    const current = pendingModules.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory() && entry.name.startsWith("@")) {
        pendingModules.push(entryPath);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      const target = resolve(dirname(entryPath), readlinkSync(entryPath)).replaceAll("\\", "/");
      const marker = "/node_modules/.pnpm/";
      const index = target.indexOf(marker);
      if (index >= 0) {
        dependencies.add(
          target.slice(index + marker.length).split("/node_modules/")[0],
        );
      }
    }
  }
  dependencies.delete(entryName);
  return dependencies;
}

const externalClosureEntries = new Set(externalRootEntries);
const externalQueue = [...externalRootEntries];
while (externalQueue.length > 0) {
  const current = externalQueue.shift();
  for (const dependency of dependencyEntriesOf(current)) {
    const packageName = packageNameForEntry(dependency);
    const tracedBody = resolve(
      outputRoot,
      "node_modules",
      ".pnpm",
      dependency,
      "node_modules",
      packageName,
    );
    if (!existsSync(tracedBody) || externalClosureEntries.has(dependency)) continue;
    externalClosureEntries.add(dependency);
    externalQueue.push(dependency);
  }
}

const dependedBy = new Map();
const entriesByName = new Map();
for (const entryName of externalClosureEntries) {
  const packageName = packageNameForEntry(entryName);
  const versions = entriesByName.get(packageName) ?? [];
  versions.push(entryName);
  entriesByName.set(packageName, versions);
  for (const dependency of dependencyEntriesOf(entryName)) {
    if (!externalClosureEntries.has(dependency)) continue;
    const dependents = dependedBy.get(dependency) ?? new Set();
    dependents.add(entryName);
    dependedBy.set(dependency, dependents);
  }
}

const externalModulesRoot = resolve(outputRoot, "frontend", ".next", "node_modules");
const mainEntryByName = new Map();
function copyTracedEntry(entryName, destinationPath) {
  const packageName = packageNameForEntry(entryName);
  const tracedBody = resolve(
    outputRoot,
    "node_modules",
    ".pnpm",
    entryName,
    "node_modules",
    packageName,
  );
  if (!existsSync(tracedBody)) {
    throw new Error(`[closure-rat] external traced body 缺失:${entryName}/${packageName}`);
  }
  rmSync(destinationPath, { recursive: true, force: true });
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(tracedBody, destinationPath, {
    recursive: true,
    dereference: true,
  });
}

for (const [packageName, versions] of entriesByName) {
  const mainEntry = versions
    .slice()
    .sort(
      (left, right) =>
        (dependedBy.get(left)?.size ?? 0) - (dependedBy.get(right)?.size ?? 0) ||
        left.localeCompare(right),
    )
    .at(-1);
  mainEntryByName.set(packageName, mainEntry);
  copyTracedEntry(mainEntry, resolve(externalModulesRoot, packageName));
}
let nestedExternalVersions = 0;
for (const [packageName, versions] of entriesByName) {
  for (const entryName of versions) {
    if (entryName === mainEntryByName.get(packageName)) continue;
    for (const dependent of dependedBy.get(entryName) ?? []) {
      const dependentName = packageNameForEntry(dependent);
      copyTracedEntry(
        entryName,
        resolve(
          externalModulesRoot,
          dependentName,
          "node_modules",
          packageName,
        ),
      );
      nestedExternalVersions += 1;
    }
  }
}

// 这些包在运行时通过字符串拼接/命令注册表加载自身文件，NFT 无法可靠枚举。
// 只补齐已证明存在动态加载的生产包本体，不递归复制其 node_modules。
let explicitConsumerPackages = 0;
for (const packageName of [
  "@playwright/test",
  "onnxruntime-node",
  "playwright",
  "playwright-core",
]) {
  const entryName = mainEntryByName.get(packageName);
  if (!entryName) {
    throw new Error(`[closure-rat] dynamic consumer package 缺失:${packageName}`);
  }
  const source = resolve(
    sourcePnpm,
    entryName,
    "node_modules",
    packageName,
  );
  const destination = resolve(externalModulesRoot, packageName);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
  });
  explicitConsumerPackages += 1;
}

const targetPlatform = process.env.CREATOROS_TARGET_PLATFORM || process.platform;
const targetArch = process.env.CREATOROS_TARGET_ARCH || process.arch;
const onnxBinRoot = resolve(externalModulesRoot, "onnxruntime-node", "bin");
let removedForeignNativeDirectories = 0;
if (existsSync(onnxBinRoot)) {
  for (const napiEntry of readdirSync(onnxBinRoot, { withFileTypes: true })) {
    if (!napiEntry.isDirectory()) continue;
    const napiRoot = resolve(onnxBinRoot, napiEntry.name);
    for (const platformEntry of readdirSync(napiRoot, { withFileTypes: true })) {
      if (!platformEntry.isDirectory()) continue;
      const platformRoot = resolve(napiRoot, platformEntry.name);
      if (platformEntry.name !== targetPlatform) {
        rmSync(platformRoot, { recursive: true, force: true });
        removedForeignNativeDirectories += 1;
        continue;
      }
      for (const archEntry of readdirSync(platformRoot, { withFileTypes: true })) {
        if (!archEntry.isDirectory() || archEntry.name === targetArch) continue;
        rmSync(resolve(platformRoot, archEntry.name), {
          recursive: true,
          force: true,
        });
        removedForeignNativeDirectories += 1;
      }
    }
  }
}

const serverOutputRoot = resolve(outputRoot, "frontend", ".next", "server");
const serverJavaScriptFiles = [];
const serverPending = [serverOutputRoot];
while (serverPending.length > 0) {
  const current = serverPending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) serverPending.push(entryPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      serverJavaScriptFiles.push(entryPath);
    }
  }
}
let rewrittenExternalReferences = 0;
let removedHashedAliases = 0;
for (const [entryName, aliasPath] of externalAliasByEntry) {
  const packageName = packageNameForEntry(entryName);
  const aliasSpecifier = aliasPath.replaceAll("\\", "/");
  let aliasReferences = 0;
  for (const javaScriptFile of serverJavaScriptFiles) {
    const source = readFileSync(javaScriptFile, "utf8");
    if (!source.includes(aliasSpecifier)) continue;
    const rewritten = source.replaceAll(aliasSpecifier, packageName);
    aliasReferences += source.split(aliasSpecifier).length - 1;
    writeFileSync(javaScriptFile, rewritten);
  }
  if (aliasReferences === 0) {
    throw new Error(
      `[closure-rat] hashed external alias 未在 server chunks 中出现:${aliasSpecifier}`,
    );
  }
  rewrittenExternalReferences += aliasReferences;
  const aliasDirectory = resolve(externalModulesRoot, aliasPath);
  if (existsSync(aliasDirectory)) {
    rmSync(aliasDirectory, { recursive: true, force: true });
    removedHashedAliases += 1;
  }
}

let explicitConsumerFiles = 0;
for (const [packageName, relativeFile] of [
  ["@playwright/test", "index.js"],
  ["playwright-core", "browsers.json"],
]) {
  const entryName = mainEntryByName.get(packageName);
  if (!entryName) {
    throw new Error(`[closure-rat] consumer allowlist package 缺失:${packageName}`);
  }
  const source = resolve(
    sourcePnpm,
    entryName,
    "node_modules",
    packageName,
    relativeFile,
  );
  const destination = resolve(externalModulesRoot, packageName, relativeFile);
  if (!existsSync(source)) {
    throw new Error(`[closure-rat] consumer allowlist source 缺失:${source}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  explicitConsumerFiles += 1;
}

// `.pnpm` 这里只是组装期 source pool。所有 Next external 已经按 Windows 可搬运的
// hoist 布局物化到 frontend/.next/node_modules；继续保留会把同一批文件再交付一份。
rmSync(resolve(outputRoot, "node_modules"), { recursive: true, force: true });

const legalFilePattern =
  /^(?:licen[cs]e|notice|copying|copyright|authors)(?:[._-].*)?$/i;
const developmentDirPattern =
  /^(?:__tests__|tests?|testing|fixtures?|examples?|docs?|coverage)$/i;
let prunedFiles = 0;
let prunedBytes = 0;
const prunePending = [outputRoot];
const pruneDirectories = [];
while (prunePending.length > 0) {
  const current = prunePending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      const normalizedRelativePath = relative(outputRoot, entryPath).replaceAll("\\", "/");
      const isPackageRoot =
        /(?:^|\/)(?:node_modules|vendor)\/(?:@[^/]+\/)?[^/]+$/.test(
          normalizedRelativePath,
        );
      const isDirectPackageDevelopmentDir =
        developmentDirPattern.test(entry.name) &&
        /(?:^|\/)(?:node_modules|vendor)\/(?:@[^/]+\/)?[^/]+\/[^/]+$/.test(
          normalizedRelativePath,
        );
      if (isDirectPackageDevelopmentDir && !isPackageRoot) {
        const nested = [entryPath];
        while (nested.length > 0) {
          const nestedPath = nested.pop();
          pruneDirectories.push(nestedPath);
          for (const child of readdirSync(nestedPath, { withFileTypes: true })) {
            const childPath = resolve(nestedPath, child.name);
            if (child.isDirectory()) nested.push(childPath);
            else if (child.isFile() && !legalFilePattern.test(child.name)) {
              prunedFiles += 1;
              prunedBytes += statSync(childPath).size;
              rmSync(childPath, { force: true });
            }
          }
        }
        continue;
      }
      pruneDirectories.push(entryPath);
      prunePending.push(entryPath);
      continue;
    }
    if (!entry.isFile() || legalFilePattern.test(entry.name)) continue;
    const lower = entry.name.toLowerCase();
    if (
      lower.endsWith(".map") ||
      lower.endsWith(".d.ts") ||
      lower.endsWith(".d.mts") ||
      lower.endsWith(".d.cts") ||
      /^readme(?:[._-].*)?$/i.test(entry.name)
    ) {
      prunedFiles += 1;
      prunedBytes += statSync(entryPath).size;
      rmSync(entryPath, { force: true });
    }
  }
}
for (const directory of pruneDirectories.reverse()) {
  if (existsSync(directory) && readdirSync(directory).length === 0) {
    rmSync(directory, { recursive: true, force: true });
  }
}

let files = 0;
let bytes = 0;
let links = 0;

// Use an iterative walk so Windows paths with deep pnpm package names do not consume stack.
const pending = [outputRoot];
while (pending.length > 0) {
  const current = pending.pop();
  const children = readdirSync(current, { withFileTypes: true });
  for (const child of children) {
    const childPath = resolve(current, child.name);
    if (child.isSymbolicLink()) {
      links += 1;
    } else if (child.isDirectory()) {
      pending.push(childPath);
    } else if (child.isFile()) {
      files += 1;
      bytes += statSync(childPath).size;
    }
  }
}

const summary = {
  schemaVersion: 1,
  report: relative(repoRoot, reportPath).replaceAll("\\", "/"),
  output: relative(repoRoot, outputRoot).replaceAll("\\", "/"),
  registeredAssets: assetSources.size,
  externalRootEntries: externalRootEntries.size,
  externalClosureEntries: externalClosureEntries.size,
  externalHoistedPackages: entriesByName.size,
  nestedExternalVersions,
  explicitConsumerPackages,
  targetPlatform,
  targetArch,
  removedForeignNativeDirectories,
  rewrittenExternalReferences,
  removedHashedAliases,
  explicitConsumerFiles,
  prunedFiles,
  prunedBytes,
  files,
  bytes,
  symlinks: links,
};
writeFileSync(
  resolve(outputRoot, "closure-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
