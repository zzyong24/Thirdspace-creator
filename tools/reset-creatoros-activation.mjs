#!/usr/bin/env node

/**
 * 仅重置本机 CreatorOS 激活态；项目、定位、知识库、素材、账号与日志一律保留。
 *
 * 默认 dry-run。执行时只处理下面的精确白名单：
 * - appDataDir/.license（Rust 激活放行权威）
 * - appDataDir/.license-seen（激活防回拨冗余点）
 * - appDataDir/.channel-model-config（当前渠道签名配置缓存，存在时）
 * - macOS license Preferences 域
 * - 未完成的渠道权益领取 Keychain 日志
 *
 * 特意不处理：db/、.auth/、machine-id、.master-key、logs/、~/CreatorOS、
 * 主应用 Preferences 和授权服务端的消费/绑定记录。
 */

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const APP_ID = "cloud.aitongban.creatoros";
const CONFIRM_TEXT = "RESET ACTIVATION";
const TEST_MODE = process.env.CREATOROS_ACTIVATION_RESET_TEST_MODE === "1";

const ACTIVATION_FILE_NAMES = [
  ["当前激活快照", ".license"],
  ["激活防回拨时间戳", ".license-seen"],
  ["当前渠道模型配置缓存", ".channel-model-config"],
];

const LICENSE_PREFERENCE_DOMAIN = `${APP_ID}.license`;
const PENDING_ENTITLEMENT_KEYCHAIN = {
  label: "未完成的渠道权益领取记录",
  service: "com.creatoros.desktop.entitlement-consume",
  account: "pending-consume-v1",
};

const RUNNING_PATTERNS = [
  "CreatorOS.app/Contents/MacOS/CreatorOS",
  "creatoros-server",
  "creatoros-desktop",
  `${APP_ID}/runtime/`,
];

function usage() {
  console.log(`CreatorOS 仅重置激活码工具（macOS）

用法：
  node tools/reset-creatoros-activation.mjs
      只预览精确白名单，不修改任何数据。

  node tools/reset-creatoros-activation.mjs --execute
      显示清单并要求输入“${CONFIRM_TEXT}”后执行。

  node tools/reset-creatoros-activation.mjs --execute --yes
      跳过交互确认，供本机重复测试渠道激活码。

说明：
  - 激活文件会移入废纸篓，可恢复；不会删除数据库或内容目录。
  - 必须先完全退出 CreatorOS，脚本不会杀进程。
  - 只退出本机当前激活码，不会撤销服务端的消费、绑定或吊销记录。`);
}

function parseArgs(argv) {
  const allowed = new Set(["--execute", "--yes", "--help", "-h"]);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) throw new Error(`未知参数：${unknown.join(" ")}`);
  return {
    execute: argv.includes("--execute"),
    yes: argv.includes("--yes"),
    help: argv.includes("--help") || argv.includes("-h"),
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
    normalized.split("/").filter(Boolean).length < 2
  ) {
    throw new Error(`拒绝使用不安全的 HOME：${normalized}`);
  }
  return normalized;
}

function commandPath(name, fallback) {
  if (!TEST_MODE) return fallback;
  return (
    process.env[`CREATOROS_ACTIVATION_RESET_${name.toUpperCase()}_BIN`] ||
    fallback
  );
}

function runCommand(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

function materializePlan(home) {
  const appDataDir = join(home, "Library", "Application Support", APP_ID);
  const files = ACTIVATION_FILE_NAMES.map(([label, name]) => {
    const path = join(appDataDir, name);
    assertInside(appDataDir, path);
    return { label, path };
  });
  return { home, appDataDir, files };
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

function deletePreferenceDomain() {
  const defaults = commandPath("defaults", "/usr/bin/defaults");
  const result = runCommand(defaults, ["delete", LICENSE_PREFERENCE_DOMAIN]);
  if (result.status !== 0 && !isMissingSystemItem(result)) {
    throw new Error(
      `删除激活 Preferences 失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

function preferenceDomainIsAbsent() {
  const defaults = commandPath("defaults", "/usr/bin/defaults");
  const result = runCommand(defaults, ["read", LICENSE_PREFERENCE_DOMAIN]);
  return result.status !== 0 && isMissingSystemItem(result);
}

function deletePendingEntitlement() {
  const security = commandPath("security", "/usr/bin/security");
  const target = PENDING_ENTITLEMENT_KEYCHAIN;
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

function pendingEntitlementIsAbsent() {
  const security = commandPath("security", "/usr/bin/security");
  const target = PENDING_ENTITLEMENT_KEYCHAIN;
  const result = runCommand(security, [
    "find-generic-password",
    "-s",
    target.service,
    "-a",
    target.account,
  ]);
  return result.status !== 0 && isMissingSystemItem(result);
}

async function printPlan(plan, running) {
  console.log("\nCreatorOS 仅重置激活码（DRY-RUN）");
  console.log("会退出当前本机激活码：");
  for (const target of plan.files) {
    const exists = await pathExists(target.path);
    console.log(`  ${exists ? "●" : "○"} ${target.label}`);
    console.log(`    ${target.path}${exists ? "" : "（不存在，跳过）"}`);
  }
  console.log(`  • Preferences：${LICENSE_PREFERENCE_DOMAIN}`);
  console.log(
    `  • Keychain：${PENDING_ENTITLEMENT_KEYCHAIN.service}/${PENDING_ENTITLEMENT_KEYCHAIN.account}`,
  );
  console.log("\n明确保留（脚本不会访问或修改）：");
  console.log(`  • ${join(plan.appDataDir, "db")}（全部业务数据）`);
  console.log(`  • ${join(plan.appDataDir, ".auth")}（账号登录态）`);
  console.log(`  • ${join(plan.appDataDir, "machine-id")}（机器身份）`);
  console.log(`  • ${join(plan.appDataDir, ".master-key")}（本地数据解密密钥）`);
  console.log(`  • ${join(plan.appDataDir, "logs")}（排障日志）`);
  console.log(`  • ${join(plan.home, "CreatorOS")}（素材与工作区）`);
  console.log("  • 授权服务端的激活码消费、绑定与吊销记录");
  if (running.length > 0) {
    console.log("\n⚠ 检测到 CreatorOS 仍在运行；执行前必须先完全退出：");
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
  if (existing.length > 0) {
    const trash = commandPath("trash", "/usr/bin/trash");
    const result = runCommand(trash, existing);
    if (result.status !== 0) {
      throw new Error(
        `激活文件移入废纸篓失败：${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
  }
  deletePreferenceDomain();
  deletePendingEntitlement();

  const residualFiles = [];
  for (const target of plan.files) {
    if (await pathExists(target.path)) residualFiles.push(target.path);
  }
  const preferenceAbsent = preferenceDomainIsAbsent();
  const pendingEntitlementAbsent = pendingEntitlementIsAbsent();
  if (residualFiles.length > 0 || !preferenceAbsent || !pendingEntitlementAbsent) {
    throw new Error(
      [
        "重置后验真失败：",
        ...residualFiles.map((path) => `激活文件仍存在 ${path}`),
        ...(!preferenceAbsent
          ? [`Preferences 仍存在 ${LICENSE_PREFERENCE_DOMAIN}`]
          : []),
        ...(!pendingEntitlementAbsent
          ? [`Keychain 仍存在 ${PENDING_ENTITLEMENT_KEYCHAIN.service}`]
          : []),
      ].join("\n"),
    );
  }
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("此脚本目前只支持 macOS");
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const home = resolveHome();
  const plan = materializePlan(home);
  const running = findRunningCreatorOs();
  await printPlan(plan, running);
  if (!args.execute) return;
  if (running.length > 0) {
    throw new Error(
      "CreatorOS 仍在运行；请退出应用后重试，脚本未修改任何内容。",
    );
  }
  if (!(await confirmExecution(args.yes))) {
    console.log("\n已取消，未修改任何内容。");
    return;
  }
  await executeReset(plan);
  console.log("\n✓ 当前本机激活码已退出。项目、定位、知识库、素材、账号与日志均已保留。");
  console.log("  下次启动 CreatorOS 会进入激活页，可输入新的渠道激活码。");
}

main().catch((error) => {
  console.error(`\n重置失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
