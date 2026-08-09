#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  CREATOROS_LICENSE_PROJECT_KEY: "creatoros",
  CREATOROS_CLIENT_CONFIG_PULL_ENABLED: "1",
  // 本地包也必须在 DMG 封盘前具备完整的 ad-hoc bundle 签名，否则 macOS 会把
  // Tauri 链接器留下的半签名判定为“应用已损坏”。它不代表 Developer ID 签名。
  CREATOROS_LOCAL_ADHOC_SIGN: "1",
  CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://growth.aitongban.cloud",
  CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64:
    "cG3l6VkbAEENtr3ulPKufX9ajN57TWKZMM5gYDuE+WU=",
  CREATOROS_GROWTH_CONFIG_KEY_ID: "growth-client-config-20260805-01",
});

const LOCAL_KEY_FILES = Object.freeze({
  CREATOROS_VERDICT_SIGNING_KEY_B64: "verdict-signing.key",
  CREATOROS_VERDICT_PUBKEY_B64: "verdict-public.key",
});

function readRequiredLocalKey({ envName, fileName, homeDir, readFile }) {
  const keyPath = join(homeDir, ".creatoros", fileName);
  let value = "";
  try {
    value = String(readFile(keyPath, "utf8")).trim();
  } catch {
    throw new Error(
      `[desktop:package-local] 缺少本机安全密钥 ${keyPath}（${envName}）。` +
        "请先恢复 ~/.creatoros 下的 CreatorOS 构建密钥；不会回退到临时密钥。",
    );
  }
  if (!value) {
    throw new Error(
      `[desktop:package-local] 本机安全密钥为空：${keyPath}（${envName}）。`,
    );
  }
  return value;
}

export function buildLocalPackageEnv({
  baseEnv = process.env,
  homeDir = homedir(),
  readFile = readFileSync,
} = {}) {
  const env = { ...baseEnv };
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (!env[name]?.trim()) env[name] = value;
  }
  for (const [envName, fileName] of Object.entries(LOCAL_KEY_FILES)) {
    if (!env[envName]?.trim()) {
      env[envName] = readRequiredLocalKey({ envName, fileName, homeDir, readFile });
    }
  }
  return env;
}

export function canonicalLocalArtifactName({ displayName, version, extension }) {
  const safeDisplayName = String(displayName ?? "").trim();
  const safeVersion = String(version ?? "").trim();
  const safeExtension = String(extension ?? "").replace(/^\./, "").trim();
  if (!safeDisplayName || !safeVersion || !safeExtension) {
    throw new Error("本地验收包缺少名称、版本号或扩展名，无法生成统一交付名。");
  }
  return `${safeDisplayName}-${safeVersion}.${safeExtension}`;
}

export function publishCanonicalLocalArtifact({
  frontendDir,
  displayName = "CreatorOS",
  homeDir = homedir(),
  profile = process.env.CREATOROS_RELEASE === "1" ? "release" : "release-fast",
  platformName = process.platform,
  readFile = readFileSync,
  copyFile = copyFileSync,
  readDir = readdirSync,
  stat = statSync,
  exists = existsSync,
  ensureDir = mkdirSync,
} = {}) {
  if (!frontendDir) throw new Error("缺少 frontendDir，无法整理本地验收包。");
  const packageJson = JSON.parse(readFile(join(frontendDir, "package.json"), "utf8"));
  const extension = platformName === "win32" ? "exe" : "dmg";
  const bundleDir = join(
    frontendDir,
    "src-tauri",
    "target",
    profile,
    "bundle",
    platformName === "win32" ? "nsis" : "dmg",
  );
  const candidates = readDir(bundleDir)
    .filter((name) => extname(name).toLowerCase() === `.${extension}`)
    .map((name) => ({ name, path: join(bundleDir, name) }))
    .sort((a, b) => stat(b.path).mtimeMs - stat(a.path).mtimeMs);
  if (!candidates[0] || !exists(candidates[0].path)) {
    throw new Error(`本地验收包构建完成，但没有在 ${bundleDir} 找到 .${extension} 产物。`);
  }
  const downloadsDir = join(homeDir, "Downloads");
  ensureDir(downloadsDir, { recursive: true });
  const targetPath = join(
    downloadsDir,
    canonicalLocalArtifactName({
      displayName,
      version: packageJson.version,
      extension,
    }),
  );
  copyFile(candidates[0].path, targetPath);
  return targetPath;
}

export function installAndLaunchLocalMacApp({
  frontendDir,
  displayName = "CreatorOS",
  binaryName = "CreatorOS",
  profile = process.env.CREATOROS_RELEASE === "1" ? "release" : "release-fast",
  platformName = process.platform,
  processId = process.pid,
  exists = existsSync,
  remove = rmSync,
  rename = renameSync,
  spawn = spawnSync,
} = {}) {
  if (platformName !== "darwin") {
    return { skipped: true, reason: "unsupported-platform" };
  }
  if (!frontendDir) throw new Error("缺少 frontendDir，无法安装本地验收 App。");

  const sourceApp = join(
    frontendDir,
    "src-tauri",
    "target",
    profile,
    "bundle",
    "macos",
    `${displayName}.app`,
  );
  const targetApp = `/Applications/${displayName}.app`;
  const stagingApp = `/Applications/.${displayName}.app.installing-${processId}`;
  if (!exists(sourceApp)) {
    throw new Error(
      `没有找到本轮构建的 ${displayName}.app：${sourceApp}；为保护现有安装，未修改 /Applications。`,
    );
  }

  // 已运行时先温和退出，再收掉仍残留的同名进程；两者失败都可能只是应用原本未运行。
  spawn("osascript", ["-e", `tell application "${displayName}" to quit`], {
    stdio: "ignore",
  });
  spawn("pkill", ["-x", binaryName], { stdio: "ignore" });

  // 先把完整新 App 复制到同卷隐藏暂存位，再替换唯一正式路径。这样复制失败时不会碰旧安装，
  // 同时不会制造 Launchpad 可见的 pre-/before-/backup- 副本。
  remove(stagingApp, { recursive: true, force: true });
  const copied = spawn("ditto", [sourceApp, stagingApp], { stdio: "inherit" });
  if (copied.error || copied.status !== 0 || !exists(stagingApp)) {
    remove(stagingApp, { recursive: true, force: true });
    throw new Error(
      `${displayName}.app 暂存复制失败，现有安装未替换（exit ${copied.status ?? "unknown"}）。`,
    );
  }

  remove(targetApp, { recursive: true, force: true });
  rename(stagingApp, targetApp);

  const opened = spawn("open", [targetApp], { stdio: "inherit" });
  if (opened.error || opened.status !== 0) {
    throw new Error(`${displayName}.app 已安装，但启动失败（exit ${opened.status ?? "unknown"}）。`);
  }

  const executablePath = `${targetApp}/Contents/MacOS/${binaryName}`;
  let launchedPid = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const probe = spawn("pgrep", ["-f", executablePath], { encoding: "utf8" });
    launchedPid = String(probe.stdout ?? "").trim().split("\n")[0] ?? "";
    if (probe.status === 0 && launchedPid) break;
    spawn("/bin/sleep", ["0.5"], { stdio: "ignore" });
  }
  if (!launchedPid) {
    throw new Error(`${displayName}.app 已安装并发起启动，但 5 秒内未检测到真实应用进程。`);
  }

  return { skipped: false, appPath: targetApp, processId: launchedPid };
}

function run() {
  let env;
  try {
    env = buildLocalPackageEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const packageScript = join(scriptDir, "package.mjs");
  console.log(
    "[desktop:package-local] ✓ 已加载 CreatorOS 本机安全密钥与 Growth 公共验签配置。",
  );
  const result = spawnSync(
    process.execPath,
    [packageScript, ...process.argv.slice(2)],
    { stdio: "inherit", env },
  );
  if (result.error) {
    console.error(`[desktop:package-local] 无法启动打包：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  try {
    const frontendDir = join(scriptDir, "..", "..");
    const artifactPath = publishCanonicalLocalArtifact({ frontendDir });
    console.log(`[desktop:package-local] ✓ 唯一验收包：${artifactPath}`);
    if (process.env.CREATOROS_LOCAL_SKIP_INSTALL === "1") {
      console.log(
        "[desktop:package-local] 已显式跳过本机安装（CREATOROS_LOCAL_SKIP_INSTALL=1）。",
      );
    } else {
      const installed = installAndLaunchLocalMacApp({ frontendDir });
      if (installed.skipped) {
        console.log("[desktop:package-local] 当前平台不执行自动安装；安装包已生成。 ");
      } else {
        console.log(
          `[desktop:package-local] ✓ 已替换并启动 ${installed.appPath}（pid ${installed.processId}）。`,
        );
      }
    }
  } catch (error) {
    console.error(
      `[desktop:package-local] 构建已完成，但本机交付收尾失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
