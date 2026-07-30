#!/usr/bin/env node

/**
 * 把本机 CreatorOS 恢复到“未激活、无工作区数据”的首次启动状态。
 *
 * 默认只预览；只有 `--execute` 并通过确认后才执行。文件先移入 macOS 废纸篓，
 * Keychain 和 defaults 项按 CreatorOS 的固定 service/domain 精确删除。
 *
 * 不处理：
 * - /Applications/CreatorOS.app 或其它安装包；
 * - 当前代码仓库；
 * - 全局 Playwright/Chromium 缓存；
 * - 配置在 ~/CreatorOS 之外的自定义素材根目录；
 * - 授权服务端已经消费、绑定或吊销的激活码。
 */

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const APP_ID = "cloud.aitongban.creatoros";
const CONFIRM_TEXT = "RESET CREATOROS";
const TEST_MODE = process.env.CREATOROS_RESET_TEST_MODE === "1";

const FILE_TARGETS = [
  ["桌面应用数据（数据库、运行时、日志、登录态、激活快照）", [
    "Library",
    "Application Support",
    APP_ID,
  ]],
  ["默认素材、工作区与本地模型", ["CreatorOS"]],
  ["应用缓存", ["Library", "Caches", APP_ID]],
  ["WebKit 本地状态", ["Library", "WebKit", APP_ID]],
  ["HTTP 存储", ["Library", "HTTPStorages", APP_ID]],
  ["窗口恢复状态", [
    "Library",
    "Saved Application State",
    `${APP_ID}.savedState`,
  ]],
  ["Cookie", ["Library", "Cookies", `${APP_ID}.binarycookies`]],
  ["沙箱容器（存在时）", ["Library", "Containers", APP_ID]],
];

const PREFERENCE_DOMAINS = [
  APP_ID,
  `${APP_ID}.license`,
];

const KEYCHAIN_TARGETS = [
  {
    label: "CreatorOS 数据加密 master key",
    service: "com.creatoros.desktop",
    account: "master-key",
  },
  {
    label: "渠道权益领取待恢复记录",
    service: "com.creatoros.desktop.entitlement-consume",
    account: "pending-consume-v1",
  },
];

const RUNNING_PATTERNS = [
  "CreatorOS.app/Contents/MacOS/CreatorOS",
  "creatoros-server",
  "creatoros-desktop",
  `${APP_ID}/runtime/`,
];

function usage() {
  console.log(`CreatorOS 本机首次启动清理工具（仅 macOS）

用法：
  node tools/reset-creatoros-local.mjs
      只预览将清理的白名单，不修改任何数据。

  node tools/reset-creatoros-local.mjs --execute
      显示清单并要求输入 “${CONFIRM_TEXT}” 后执行。

  node tools/reset-creatoros-local.mjs --execute --yes
      跳过交互确认；适合你自己明确验收时重复使用。

说明：
  - 文件会移入废纸篓，不直接永久删除。
  - Keychain 激活/加密凭据和 macOS Preferences 会被删除。
  - 必须先完全退出 CreatorOS；脚本不会自动杀进程。
  - 只重置本机状态，不会重置授权服务端的激活码消费记录。`);
}

function parseArgs(argv) {
  const allowed = new Set(["--execute", "--yes", "--help", "-h"]);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`未知参数：${unknown.join(" ")}`);
  }
  return {
    execute: argv.includes("--execute"),
    yes: argv.includes("--yes"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function resolveHome() {
  const candidate =
    TEST_MODE && process.env.CREATOROS_RESET_HOME_OVERRIDE
      ? process.env.CREATOROS_RESET_HOME_OVERRIDE
      : homedir();
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error("拒绝使用不安全的 HOME：必须是绝对路径");
  }
  const normalized = resolve(candidate);
  const parent = resolve(normalized, "..");
  if (
    normalized === "/" ||
    normalized === parent ||
    normalized.split("/").filter(Boolean).length < 2
  ) {
    throw new Error(`拒绝使用不安全的 HOME：${normalized}`);
  }
  return normalized;
}

function commandPath(name, fallback) {
  if (!TEST_MODE) return fallback;
  return process.env[`CREATOROS_RESET_${name.toUpperCase()}_BIN`] || fallback;
}

function runCommand(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`无法执行 ${bin}：${result.error.message}`);
  }
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

function assertSafeTarget(home, target) {
  const rel = relative(home, target);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  ) {
    throw new Error(`拒绝清理白名单外路径：${target}`);
  }
}

function materializeTargets(home) {
  return FILE_TARGETS.map(([label, segments]) => {
    const path = join(home, ...segments);
    assertSafeTarget(home, path);
    return { label, path };
  });
}

function findRunningCreatorOs() {
  const pgrep = commandPath("pgrep", "/usr/bin/pgrep");
  const rows = new Set();
  for (const pattern of RUNNING_PATTERNS) {
    const result = runCommand(pgrep, ["-fl", pattern]);
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`检查 CreatorOS 进程失败：${result.stderr.trim()}`);
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
      `删除 Preferences 域 ${domain} 失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function preferenceDomainIsAbsent(domain) {
  const defaults = commandPath("defaults", "/usr/bin/defaults");
  const result = runCommand(defaults, ["read", domain]);
  return result.status !== 0 && isMissingSystemItem(result);
}

function deleteKeychainTarget(target) {
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
      `删除 Keychain 项 ${target.label} 失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function keychainTargetIsAbsent(target) {
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

async function printPlan(targets, running) {
  console.log("\nCreatorOS 本机首次启动清理（DRY-RUN）");
  console.log("文件目标（执行时移入废纸篓）：");
  for (const target of targets) {
    const exists = await pathExists(target.path);
    console.log(`  ${exists ? "●" : "○"} ${target.label}`);
    console.log(`    ${target.path}${exists ? "" : "（不存在，跳过）"}`);
  }
  console.log("\nmacOS Preferences：");
  for (const domain of PREFERENCE_DOMAINS) {
    console.log(`  • ${domain}`);
  }
  console.log("\nKeychain：");
  for (const target of KEYCHAIN_TARGETS) {
    console.log(
      `  • ${target.label}（service=${target.service}, account=${target.account}）`,
    );
  }
  console.log("\n明确保留：");
  console.log("  • /Applications/CreatorOS.app 与安装包");
  console.log("  • 当前代码仓库");
  console.log("  • ~/Library/Caches/ms-playwright（可能被其它项目共用）");
  console.log("  • ~/CreatorOS 之外的自定义素材根目录");
  console.log("  • 授权服务端的激活码消费、绑定与吊销记录");
  if (running.length > 0) {
    console.log("\n⚠ 检测到 CreatorOS 相关进程；真正执行前必须先完全退出：");
    for (const line of running) console.log(`  ${line}`);
  }
  console.log(
    "\n确认清单无误后运行：node tools/reset-creatoros-local.mjs --execute",
  );
}

async function confirmExecution(skip) {
  if (skip) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("非交互终端必须显式传 --yes");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n此操作会清除本机激活态和全部 CreatorOS 工作数据。\n请输入 ${CONFIRM_TEXT} 继续：`,
    );
    return answer.trim() === CONFIRM_TEXT;
  } finally {
    rl.close();
  }
}

async function executeReset(targets) {
  const existingPaths = [];
  for (const target of targets) {
    if (await pathExists(target.path)) existingPaths.push(target.path);
  }
  if (existingPaths.length > 0) {
    const trash = commandPath("trash", "/usr/bin/trash");
    const result = runCommand(trash, existingPaths);
    if (result.status !== 0) {
      throw new Error(
        `文件移入废纸篓失败：${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
  }

  for (const domain of PREFERENCE_DOMAINS) deletePreferenceDomain(domain);
  for (const target of KEYCHAIN_TARGETS) deleteKeychainTarget(target);

  const residualFiles = [];
  for (const target of targets) {
    if (await pathExists(target.path)) residualFiles.push(target.path);
  }
  const residualPreferences = PREFERENCE_DOMAINS.filter(
    (domain) => !preferenceDomainIsAbsent(domain),
  );
  const residualKeychain = KEYCHAIN_TARGETS.filter(
    (target) => !keychainTargetIsAbsent(target),
  );
  if (
    residualFiles.length > 0 ||
    residualPreferences.length > 0 ||
    residualKeychain.length > 0
  ) {
    throw new Error(
      [
        "清理后验真失败：",
        ...residualFiles.map((path) => `文件仍存在 ${path}`),
        ...residualPreferences.map((domain) => `Preferences 仍存在 ${domain}`),
        ...residualKeychain.map(
          (target) =>
            `Keychain 仍存在 service=${target.service}, account=${target.account}`,
        ),
      ].join("\n"),
    );
  }
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("此脚本目前只支持 macOS");
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const home = resolveHome();
  const targets = materializeTargets(home);
  const running = findRunningCreatorOs();
  await printPlan(targets, running);
  if (!args.execute) return;
  if (running.length > 0) {
    throw new Error(
      "CreatorOS 仍在运行；请退出应用并关闭相关开发 sidecar 后重试，脚本未清理任何内容。",
    );
  }
  if (!(await confirmExecution(args.yes))) {
    console.log("\n已取消，未清理任何内容。");
    return;
  }
  await executeReset(targets);
  console.log(
    "\n✓ 本机 CreatorOS 已恢复为未激活的首次启动状态。重新打开应用即可测试渠道与 0→1 流程。",
  );
  console.log(
    "  文件已移入废纸篓；若要再次使用同一个激活码，仍以授权服务端的真实绑定/消费状态为准。",
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
