#!/usr/bin/env node
// [T-586] macOS 安装声明必须覆盖随包 Node runtime 的真实最低系统版本。
//
// CreatorOS 的 sidecar 不是独立编译产物，而是 build-sidecar.mjs 对 process.execPath 的
// 原样复制。Node 25 的 macOS Mach-O load command 声明 minos=13.5；如果 Tauri 仍宣称
// 10.15，旧系统会允许用户拿到应用，随后 sidecar 才在业务启动前被 dyld SIGABRT。
//
// 本门同时钉住三件事：
//   1. 仓库与实际构建进程都使用已登记的 Node 25；
//   2. Tauri 的 minimumSystemVersion 明确声明 13.5；
//   3. otool 实测将被复制的 process.execPath，其 minos 不高于安装声明。

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(DESKTOP_DIR, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");

export const MACOS_NODE_RUNTIME_POLICY = Object.freeze({
  nodeMajor: 25,
  minimumSystemVersion: "13.5",
});

function parseVersion(value, label) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)*$/.test(value.trim())) {
    throw new Error(`[T-586] ${label} 不是合法版本号：${String(value)}`);
  }
  return value.trim().split(".").map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left, "左侧版本");
  const b = parseVersion(right, "右侧版本");
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export function parseMacosMinimumFromOtool(output) {
  const minimums = [];
  let command = null;

  for (const line of String(output).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "cmd LC_BUILD_VERSION") {
      command = "build-version";
      continue;
    }
    if (trimmed === "cmd LC_VERSION_MIN_MACOSX") {
      command = "legacy-min-version";
      continue;
    }
    if (trimmed.startsWith("cmd ")) {
      command = null;
      continue;
    }

    const match =
      command === "build-version"
        ? trimmed.match(/^minos\s+(\d+(?:\.\d+)*)$/)
        : command === "legacy-min-version"
          ? trimmed.match(/^version\s+(\d+(?:\.\d+)*)$/)
          : null;
    if (match) minimums.push(match[1]);
  }

  if (minimums.length === 0) {
    throw new Error(
      "[T-586] 无法从 otool -l 输出读取 macOS minos；拒绝在未知兼容范围下出包。",
    );
  }

  return minimums.reduce((highest, current) =>
    compareVersions(current, highest) > 0 ? current : highest,
  );
}

function parseNodeMajor(nodeVersion) {
  const match = String(nodeVersion).trim().match(/^v?(\d+)(?:\.|$)/);
  if (!match) {
    throw new Error(`[T-586] 无法解析随包 Node 版本：${String(nodeVersion)}`);
  }
  return Number(match[1]);
}

function assertNodeEnginePolicy(nodeEngine, expectedMajor) {
  const normalized = String(nodeEngine).trim().replace(/\s+/g, " ");
  const expected = `>=${expectedMajor} <${expectedMajor + 1}`;
  if (normalized !== expected) {
    throw new Error(
      `[T-586] 根 package.json engines.node=${JSON.stringify(nodeEngine)}，` +
        `但 macOS runtime 门只登记了 ${expected}；请先验证新 Node runtime 再更新兼容策略。`,
    );
  }
}

export function validateMacosRuntimeContract({
  platform,
  nodeVersion,
  nodeEngine,
  declaredMinimumSystemVersion,
  runtimeMinimumSystemVersion,
}) {
  if (platform !== "darwin") {
    return { applicable: false, reason: "非 macOS 构建" };
  }

  const expected = MACOS_NODE_RUNTIME_POLICY;
  const actualNodeMajor = parseNodeMajor(nodeVersion);
  assertNodeEnginePolicy(nodeEngine, expected.nodeMajor);
  if (actualNodeMajor !== expected.nodeMajor) {
    throw new Error(
      `[T-586] 拒绝 macOS 出包：当前会复制 Node ${String(nodeVersion)}，` +
        `仓库发布链要求 Node ${expected.nodeMajor}.x。请使用 package.json 锁定的运行时构建。`,
    );
  }

  if (declaredMinimumSystemVersion !== expected.minimumSystemVersion) {
    throw new Error(
      `[T-586] 拒绝 macOS 出包：tauri.conf.json 声明最低 macOS ` +
        `${String(declaredMinimumSystemVersion)}，但随包 Node ${expected.nodeMajor} runtime ` +
        `要求至少 ${expected.minimumSystemVersion}。旧系统必须由 macOS 在启动应用前明确拦截。`,
    );
  }

  if (
    compareVersions(
      declaredMinimumSystemVersion,
      runtimeMinimumSystemVersion,
    ) < 0
  ) {
    throw new Error(
      `[T-586] 拒绝 macOS 出包：随包 Node Mach-O minos=${runtimeMinimumSystemVersion}，` +
        `高于安装包声明的 ${declaredMinimumSystemVersion}。请先提高 minimumSystemVersion。`,
    );
  }

  return {
    applicable: true,
    nodeMajor: actualNodeMajor,
    declaredMinimumSystemVersion,
    runtimeMinimumSystemVersion,
  };
}

export function inspectMacosRuntimeMinimum(
  runtimePath,
  spawnSyncImpl = spawnSync,
) {
  const result = spawnSyncImpl("otool", ["-l", runtimePath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || `exit ${result.status}`;
    throw new Error(
      `[T-586] otool 无法检查随包 Node runtime（${runtimePath}）：${String(detail).trim()}`,
    );
  }
  return parseMacosMinimumFromOtool(result.stdout);
}

export function assertMacosRuntimeCompatibility({
  platform = process.platform,
  nodeVersion = process.version,
  runtimePath = process.execPath,
  spawnSyncImpl = spawnSync,
  repoRoot = REPO_ROOT,
  frontendRoot = FRONTEND_ROOT,
} = {}) {
  if (platform !== "darwin") {
    return { applicable: false, reason: "非 macOS 构建" };
  }

  const rootPackage = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  const tauriConfig = JSON.parse(
    readFileSync(
      join(frontendRoot, "src-tauri", "tauri.conf.json"),
      "utf8",
    ),
  );
  const runtimeMinimumSystemVersion = inspectMacosRuntimeMinimum(
    runtimePath,
    spawnSyncImpl,
  );
  const result = validateMacosRuntimeContract({
    platform,
    nodeVersion,
    nodeEngine: rootPackage.engines?.node,
    declaredMinimumSystemVersion:
      tauriConfig.bundle?.macOS?.minimumSystemVersion,
    runtimeMinimumSystemVersion,
  });

  console.log(
    `[macos-runtime-compat] ✓ Node ${nodeVersion} Mach-O minos=` +
      `${runtimeMinimumSystemVersion}；安装包最低 macOS ` +
      `${result.declaredMinimumSystemVersion}。`,
  );
  return result;
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) assertMacosRuntimeCompatibility();
