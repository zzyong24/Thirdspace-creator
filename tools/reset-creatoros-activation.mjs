#!/usr/bin/env node

/**
 * 仅重置本机 CreatorOS 激活态；项目、定位、知识库、素材、账号与日志一律保留。
 *
 * 默认 dry-run。执行时只处理下面的精确白名单：
 * - appDataDir/.license（Rust 激活放行权威）
 * - appDataDir/.license-seen（激活防回拨冗余点）
 * - appDataDir/.channel-model-config（当前渠道签名配置缓存，存在时）
 * - macOS license Preferences 域 / Windows 用户目录防回拨冗余点
 * - 未完成的权益领取 Keychain / Credential Manager 日志
 *
 * 特意不处理：db/、.auth/、machine-id、.master-key、logs/、~/CreatorOS、
 * 主应用 Preferences 和授权服务端的消费/绑定记录。
 */

import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const CONFIRM_TEXT = "RESET ACTIVATION";
const TEST_MODE = process.env.CREATOROS_ACTIVATION_RESET_TEST_MODE === "1";
const OFFICIAL_APP_ID = "cloud.aitongban.creatoros";

const ACTIVATION_FILE_NAMES = [
  ["当前激活快照", ".license"],
  ["激活防回拨时间戳", ".license-seen"],
  ["当前渠道模型配置缓存", ".channel-model-config"],
];

const OFFICIAL_PENDING_ENTITLEMENT_KEYCHAIN = {
  label: "未完成的渠道权益领取记录",
  service: "com.creatoros.desktop.entitlement-consume",
  account: "pending-consume-v1",
};

const IDENTITY_FIELDS = [
  "packageRef",
  "appIdentifier",
  "keychainService",
  "windowsUpgradeCode",
];

function usage() {
  console.log(`CreatorOS 仅重置激活码工具（macOS / Windows）

用法：
  node tools/reset-creatoros-activation.mjs
      只预览精确白名单，不修改任何数据。

  node tools/reset-creatoros-activation.mjs --execute
      显示清单并要求输入“${CONFIRM_TEXT}”后执行。

  node tools/reset-creatoros-activation.mjs --execute --yes
      跳过交互确认，只供已明确授权的内部重复验收。

  node tools/reset-creatoros-activation.mjs --package-manifest frontend/branding/packages/<packageRef>/package.json
      仅在 macOS 预览仓库内已锁定渠道包的精确激活白名单。

说明：
  - 激活文件会移入废纸篓或回收站，可恢复；不会删除数据库或内容目录。
  - 必须先完全退出目标应用，脚本不会杀进程。
  - 只退出本机当前激活码，不会撤销服务端的消费、绑定或吊销记录。`);
}

function resolvePlatform() {
  const platform =
    TEST_MODE && process.env.CREATOROS_ACTIVATION_RESET_PLATFORM_OVERRIDE
      ? process.env.CREATOROS_ACTIVATION_RESET_PLATFORM_OVERRIDE
      : process.platform;
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error("此工具目前只支持 macOS 和 Windows");
  }
  return platform;
}

function parseArgs(argv) {
  let packageManifest;
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--package-manifest") {
      if (packageManifest || !argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--package-manifest 必须且只能提供一个路径");
      }
      packageManifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (!["--execute", "--yes", "--help", "-h"].includes(arg)) {
      throw new Error(`未知参数：${arg}`);
    }
    flags.add(arg);
  }
  return {
    execute: flags.has("--execute"),
    yes: flags.has("--yes"),
    help: flags.has("--help") || flags.has("-h"),
    packageManifest,
  };
}

function resolveHome() {
  const candidate =
    TEST_MODE && process.env.CREATOROS_ACTIVATION_RESET_HOME_OVERRIDE
      ? process.env.CREATOROS_ACTIVATION_RESET_HOME_OVERRIDE
      : homedir();
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error("拒绝使用不安全的 HOME：必须是绝对路径");
  }
  const normalized = resolve(candidate);
  const parent = resolve(normalized, "..");
  if (
    normalized === "/" ||
    normalized === parent ||
    normalized.split(/[\\/]/).filter(Boolean).length < 2
  ) {
    throw new Error(`拒绝使用不安全的 HOME：${normalized}`);
  }
  return normalized;
}

function resolveWindowsAppData() {
  const candidate =
    TEST_MODE && process.env.CREATOROS_ACTIVATION_RESET_APPDATA_OVERRIDE
      ? process.env.CREATOROS_ACTIVATION_RESET_APPDATA_OVERRIDE
      : process.env.APPDATA;
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error("Windows APPDATA 不可用或不是绝对路径");
  }
  const normalized = resolve(candidate);
  const parent = resolve(normalized, "..");
  if (
    normalized === parent ||
    normalized.split(/[\\/]/).filter(Boolean).length < 2
  ) {
    throw new Error(`拒绝使用不安全的 Windows APPDATA：${normalized}`);
  }
  return normalized;
}

function resolveRepoRoot() {
  const candidate =
    TEST_MODE && process.env.CREATOROS_ACTIVATION_RESET_REPO_OVERRIDE
      ? process.env.CREATOROS_ACTIVATION_RESET_REPO_OVERRIDE
      : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error("仓库根目录必须是绝对路径");
  }
  return resolve(candidate);
}

function assertSafeIdentifier(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value)) {
    throw new Error(`渠道包 ${field} 非法`);
  }
}

function assertSafeDisplayName(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 80 ||
    /[\u0000-\u001f/\\]/.test(value)
  ) {
    throw new Error("渠道包 displayName 非法");
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`无法读取${label}：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function resolveTarget(packageManifestArg) {
  if (!packageManifestArg) {
    return {
      packageRef: "official",
      displayName: "CreatorOS",
      binaryName: "CreatorOS",
      appIdentifier: OFFICIAL_APP_ID,
      pendingEntitlement: OFFICIAL_PENDING_ENTITLEMENT_KEYCHAIN,
      runningPatterns: [
        "CreatorOS.app/Contents/MacOS/CreatorOS",
        "creatoros-server",
        "creatoros-desktop",
        `${OFFICIAL_APP_ID}/runtime/`,
      ],
      runningImages: ["CreatorOS.exe", "creatoros-server.exe", "creatoros-desktop.exe"],
    };
  }
  if (isAbsolute(packageManifestArg)) {
    throw new Error("拒绝使用仓库渠道包目录外的 package manifest");
  }
  const repoRoot = resolveRepoRoot();
  const packagesRoot = resolve(repoRoot, "frontend", "branding", "packages");
  const manifestPath = resolve(repoRoot, packageManifestArg);
  try {
    assertInside(packagesRoot, manifestPath);
  } catch {
    throw new Error("拒绝使用仓库渠道包目录外的 package manifest");
  }
  const segments = relative(packagesRoot, manifestPath).split(/[\\/]/);
  if (segments.length !== 2 || segments[1] !== "package.json") {
    throw new Error("拒绝使用仓库渠道包目录外的 package manifest");
  }
  const manifest = await readJson(manifestPath, "渠道 package manifest");
  const lock = await readJson(join(dirname(manifestPath), "identity.lock.json"), "渠道身份锁");
  if (manifest.schema !== "creatoros-desktop-package/v1") {
    throw new Error("渠道 package manifest schema 非法");
  }
  if (lock.schema !== "creatoros-package-identity-lock/v1") {
    throw new Error("渠道身份锁 schema 非法");
  }
  assertSafeIdentifier(manifest.packageRef, "packageRef");
  assertSafeIdentifier(manifest.binaryName, "binaryName");
  assertSafeIdentifier(manifest.appIdentifier, "appIdentifier");
  assertSafeIdentifier(manifest.keychainService, "keychainService");
  assertSafeDisplayName(manifest.displayName);
  if (manifest.packageRef !== segments[0]) {
    throw new Error("渠道 packageRef 与目录不一致");
  }
  for (const field of IDENTITY_FIELDS) {
    if (manifest[field] !== lock[field]) {
      throw new Error(`渠道身份锁不一致：${field}`);
    }
  }
  return {
    packageRef: manifest.packageRef,
    displayName: manifest.displayName,
    binaryName: manifest.binaryName,
    appIdentifier: manifest.appIdentifier,
    pendingEntitlement: null,
    runningPatterns: [
      `${manifest.displayName}.app/Contents/MacOS/${manifest.binaryName}`,
      `${manifest.appIdentifier}/runtime/`,
    ],
    runningImages: [
      `${manifest.binaryName}.exe`,
      "creatoros-server.exe",
      "creatoros-desktop.exe",
    ],
  };
}

function commandPath(name, fallback) {
  if (!TEST_MODE) return fallback;
  return (
    process.env[`CREATOROS_ACTIVATION_RESET_${name.toUpperCase()}_BIN`] ||
    fallback
  );
}

function runCommand(bin, args, extraEnv) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
  });
  if (result.error) throw new Error(`无法执行 ${bin}：${result.error.message}`);
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertInside(parent, target) {
  const rel = relative(parent, target);
  if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`拒绝处理白名单外路径：${target}`);
  }
}

function materializePlan(home, target, platform) {
  const appDataDir = platform === "darwin"
    ? join(home, "Library", "Application Support", target.appIdentifier)
    : join(resolveWindowsAppData(), target.appIdentifier);
  const files = ACTIVATION_FILE_NAMES.map(([label, name]) => {
    const path = join(appDataDir, name);
    assertInside(appDataDir, path);
    return { label, path };
  });
  if (platform === "win32") {
    const homeSeen = join(home, ".creatoros-seen");
    assertInside(home, homeSeen);
    files.push({ label: "激活防回拨用户目录冗余点", path: homeSeen });
  }
  return {
    platform,
    home,
    appDataDir,
    files,
    target,
    licensePreferenceDomain:
      platform === "darwin" ? `${target.appIdentifier}.license` : null,
    pendingCredentialTarget:
      platform === "win32" && target.pendingEntitlement
        ? `${target.pendingEntitlement.account}.${target.pendingEntitlement.service}`
        : null,
  };
}

function findRunningTarget(target, platform) {
  if (platform === "win32") {
    const tasklist = commandPath("tasklist", "tasklist.exe");
    const result = runCommand(tasklist, ["/FO", "CSV", "/NH"]);
    if (result.status !== 0) {
      throw new Error(`检查 ${target.displayName} 进程失败：${result.stderr.trim()}`);
    }
    const names = new Set(target.runningImages.map((name) => name.toLowerCase()));
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        const match = /^"([^"]+)"/.exec(line);
        return Boolean(match && names.has(match[1].toLowerCase()));
      });
  }
  const pgrep = commandPath("pgrep", "/usr/bin/pgrep");
  const rows = new Set();
  for (const pattern of target.runningPatterns) {
    const result = runCommand(pgrep, ["-fl", pattern]);
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`检查 ${target.displayName} 进程失败：${result.stderr.trim()}`);
    }
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) rows.add(trimmed);
    }
  }
  return [...rows];
}

function isMissingSystemItem(result) {
  const text = `${result.stdout}\n${result.stderr}`;
  return (
    result.status === 44 ||
    /could not be found|not found|does not exist|不存在|未找到/i.test(text)
  );
}

function deletePreferenceDomain(domain) {
  const defaults = commandPath("defaults", "/usr/bin/defaults");
  const result = runCommand(defaults, ["delete", domain]);
  if (result.status !== 0 && !isMissingSystemItem(result)) {
    throw new Error(
      `删除激活 Preferences 失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function preferenceDomainIsAbsent(domain) {
  const defaults = commandPath("defaults", "/usr/bin/defaults");
  const result = runCommand(defaults, ["read", domain]);
  return result.status !== 0 && isMissingSystemItem(result);
}

function deletePendingEntitlement(target) {
  const security = commandPath("security", "/usr/bin/security");
  const result = runCommand(security, [
    "delete-generic-password",
    "-s",
    target.service,
    "-a",
    target.account,
  ]);
  if (result.status !== 0 && !isMissingSystemItem(result)) {
    throw new Error(
      `删除 ${target.label} 失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function pendingEntitlementIsAbsent(target) {
  const security = commandPath("security", "/usr/bin/security");
  const result = runCommand(security, [
    "find-generic-password",
    "-s",
    target.service,
    "-a",
    target.account,
  ]);
  return result.status !== 0 && isMissingSystemItem(result);
}

const WINDOWS_CREDENTIAL_SCRIPT = String.raw`
$source = @'
using System;
using System.Runtime.InteropServices;
public static class LocalCredential {
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, int type, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = false)]
  public static extern void CredFree(IntPtr credential);
}
'@
Add-Type -TypeDefinition $source
$action = $env:CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_ACTION
$target = $env:CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_TARGET
if ($action -eq "delete") {
  if ([LocalCredential]::CredDelete($target, 1, 0)) { exit 0 }
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($code -eq 1168) { exit 44 }
  exit 1
}
$credential = [IntPtr]::Zero
if ([LocalCredential]::CredRead($target, 1, 0, [ref]$credential)) {
  [LocalCredential]::CredFree($credential)
  exit 0
}
$code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
if ($code -eq 1168) { exit 44 }
exit 1
`;

function encodedPowerShell(source) {
  return Buffer.from(source, "utf16le").toString("base64");
}

function runWindowsCredential(action, target) {
  const powershell = commandPath("powershell", "powershell.exe");
  return runCommand(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodedPowerShell(WINDOWS_CREDENTIAL_SCRIPT),
  ], {
    CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_ACTION: action,
    CREATOROS_ACTIVATION_RESET_WIN_CREDENTIAL_TARGET: target,
  });
}

function deleteWindowsCredential(target) {
  const result = runWindowsCredential("delete", target);
  if (result.status !== 0 && result.status !== 44) {
    throw new Error(
      `删除 Windows 待恢复领取记录失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function windowsCredentialIsAbsent(target) {
  const result = runWindowsCredential("exists", target);
  if (result.status === 44) return true;
  if (result.status === 0) return false;
  throw new Error(
    `验证 Windows 待恢复领取记录失败：${result.stderr.trim() || result.stdout.trim()}`,
  );
}

function recycleFiles(platform, paths) {
  if (paths.length === 0) return;
  if (platform === "darwin") {
    const trash = commandPath("trash", "/usr/bin/trash");
    const result = runCommand(trash, paths);
    if (result.status !== 0) {
      throw new Error(
        `激活文件移入废纸篓失败：${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    return;
  }
  const powershell = commandPath("powershell", "powershell.exe");
  const recycleScript = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.VisualBasic
$count = [int]$env:CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_COUNT
for ($index = 0; $index -lt $count; $index += 1) {
  $path = [Environment]::GetEnvironmentVariable("CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_PATH_$index")
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
    $path,
    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
  )
}
`;
  const recycleEnv = {
    CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_COUNT: String(paths.length),
  };
  paths.forEach((path, index) => {
    recycleEnv[`CREATOROS_ACTIVATION_RESET_WIN_RECYCLE_PATH_${index}`] = path;
  });
  const result = runCommand(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodedPowerShell(recycleScript),
  ], recycleEnv);
  if (result.status !== 0) {
    throw new Error(
      `激活文件移入回收站失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

async function printPlan(plan, running) {
  const platformLabel = plan.platform === "darwin" ? "macOS" : "Windows";
  console.log(`\n${plan.target.displayName} 仅重置激活码（${platformLabel} · DRY-RUN）`);
  console.log(`已锁定应用身份：${plan.target.appIdentifier}`);
  console.log("会退出当前本机激活码：");
  for (const target of plan.files) {
    const exists = await pathExists(target.path);
    console.log(`  ${exists ? "●" : "○"} ${target.label}`);
    console.log(`    ${target.path}${exists ? "" : "（不存在，跳过）"}`);
  }
  if (plan.licensePreferenceDomain) {
    console.log(`  • Preferences：${plan.licensePreferenceDomain}`);
  }
  if (plan.platform === "darwin" && plan.target.pendingEntitlement) {
    console.log(
      `  • Keychain：${plan.target.pendingEntitlement.service}/${plan.target.pendingEntitlement.account}`,
    );
  } else if (plan.pendingCredentialTarget) {
    console.log(`  • Windows Credential Manager：${plan.pendingCredentialTarget}`);
  } else {
    console.log("  • Keychain：渠道模型凭据及官方共享领取日志均保留");
  }
  console.log("\n明确保留（脚本不会访问或修改）：");
  console.log(`  • ${join(plan.appDataDir, "db")}（全部业务数据）`);
  console.log(`  • ${join(plan.appDataDir, ".auth")}（账号登录态）`);
  console.log(`  • ${join(plan.appDataDir, "machine-id")}（机器身份）`);
  console.log(`  • ${join(plan.appDataDir, ".master-key")}（本地数据解密密钥）`);
  console.log(`  • ${join(plan.appDataDir, "logs")}（排障日志）`);
  console.log(`  • ${join(plan.home, "CreatorOS")}（素材与工作区）`);
  console.log("  • 授权服务端的激活码消费、绑定与吊销记录");
  if (running.length > 0) {
    console.log(`\n⚠ 检测到 ${plan.target.displayName} 仍在运行；执行前必须先完全退出：`);
    for (const line of running) console.log(`  ${line}`);
  }
}

async function confirmExecution(skip) {
  if (skip) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("非交互终端必须显式传 --yes");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n此操作只退出当前激活码，内容不会重置。\n请输入 ${CONFIRM_TEXT} 继续：`,
    );
    return answer.trim() === CONFIRM_TEXT;
  } finally {
    rl.close();
  }
}

async function executeReset(plan) {
  const existing = [];
  for (const target of plan.files) {
    if (await pathExists(target.path)) existing.push(target.path);
  }
  recycleFiles(plan.platform, existing);
  if (plan.licensePreferenceDomain) {
    deletePreferenceDomain(plan.licensePreferenceDomain);
  }
  if (plan.platform === "darwin" && plan.target.pendingEntitlement) {
    deletePendingEntitlement(plan.target.pendingEntitlement);
  } else if (plan.pendingCredentialTarget) {
    deleteWindowsCredential(plan.pendingCredentialTarget);
  }

  const residualFiles = [];
  for (const target of plan.files) {
    if (await pathExists(target.path)) residualFiles.push(target.path);
  }
  const preferenceAbsent = plan.licensePreferenceDomain
    ? preferenceDomainIsAbsent(plan.licensePreferenceDomain)
    : true;
  const pendingEntitlementAbsent =
    plan.platform === "darwin" && plan.target.pendingEntitlement
      ? pendingEntitlementIsAbsent(plan.target.pendingEntitlement)
      : plan.pendingCredentialTarget
        ? windowsCredentialIsAbsent(plan.pendingCredentialTarget)
        : true;
  if (residualFiles.length > 0 || !preferenceAbsent || !pendingEntitlementAbsent) {
    throw new Error(
      [
        "重置后验真失败：",
        ...residualFiles.map((path) => `激活文件仍存在 ${path}`),
        ...(!preferenceAbsent && plan.licensePreferenceDomain
          ? [`Preferences 仍存在 ${plan.licensePreferenceDomain}`]
          : []),
        ...(!pendingEntitlementAbsent
          ? [
              plan.platform === "darwin"
                ? `Keychain 仍存在 ${plan.target.pendingEntitlement.service}`
                : `Windows Credential Manager 仍存在 ${plan.pendingCredentialTarget}`,
            ]
          : []),
      ].join("\n"),
    );
  }
}

async function main() {
  const platform = resolvePlatform();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (platform === "win32" && args.packageManifest) {
    throw new Error("Windows 激活重置目前只支持官方 CreatorOS");
  }
  const home = resolveHome();
  const target = await resolveTarget(args.packageManifest);
  const plan = materializePlan(home, target, platform);
  const running = findRunningTarget(target, platform);
  await printPlan(plan, running);
  if (!args.execute) return;
  if (running.length > 0) {
    throw new Error(
      `${target.displayName} 仍在运行；请退出应用后重试，脚本未修改任何内容。`,
    );
  }
  if (!(await confirmExecution(args.yes))) {
    console.log("\n已取消，未修改任何内容。");
    return;
  }
  await executeReset(plan);
  console.log(`\n✓ ${target.displayName} 当前本机激活码已退出。项目、定位、知识库、素材、账号与日志均已保留。`);
  console.log(`  下次启动 ${target.displayName} 会进入激活页，可输入新的激活码。`);
}

main().catch((error) => {
  console.error(`\n重置失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
