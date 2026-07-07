#!/usr/bin/env node
// T-147 P5 桌面激活授权 —— 本地测试 / 排障 CLI(接 activation-manager 一机一码)。
//
// 用途(手动联网测试,非单测 —— 单测绝不真联网):
//   node scripts/desktop/activation.mjs machine-id
//       打印本机机器指纹(node 侧落盘回退版;桌面壳里以 Rust 注入的 CREATOROS_MACHINE_ID 为准)。
//   node scripts/desktop/activation.mjs status --code <CODE>
//       调 activation-manager /api/license/status 查该码在本机的授权状态(不改库)。
//   node scripts/desktop/activation.mjs activate --code <CODE>
//       调 /api/license/activate 激活(TIME 绑本机 + 起算 expiresAt)。**真会绑定设备**。
//
// 配置(env,均有默认;见 docs/desktop-activation-guide.md):
//   CREATOROS_LICENSE_BASE_URL     默认 https://license.aitongban.cloud
//   CREATOROS_LICENSE_PROJECT_KEY  默认 test(须先在后台建过该项目并启用)
//   CREATOROS_MACHINE_ID           覆盖机器指纹(桌面壳注入;本 CLI 未设则用落盘回退)
//
// ⚠️ 激活码从 --code 参数 / CREATOROS_TEST_CODE env 读,**绝不写死进脚本 / 提交进 git**。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const BASE_URL =
  process.env.CREATOROS_LICENSE_BASE_URL?.trim() ||
  "https://license.aitongban.cloud";
const PROJECT_KEY =
  process.env.CREATOROS_LICENSE_PROJECT_KEY?.trim() || "test";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--code") flags.code = argv[++i];
  }
  return flags;
}

function machineIdPath() {
  const dbDir = process.env.CREATOROS_DB_DIR?.trim();
  if (dbDir) return join(dirname(dbDir), "machine-id");
  return join(homedir(), ".creatoros", "machine-id");
}

async function resolveMachineId() {
  const injected = process.env.CREATOROS_MACHINE_ID?.trim();
  if (injected) return injected;
  const p = machineIdPath();
  try {
    const existing = (await readFile(p, "utf8")).trim();
    if (existing) return existing;
  } catch {
    // no file yet
  }
  const fresh = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, fresh, "utf8");
  return fresh;
}

async function callLicense(path, code, machineId) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, machineId, projectKey: PROJECT_KEY }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = { parseError: true };
  }
  return { httpStatus: res.status, body };
}

const cmd = process.argv[2];
const flags = parseFlags(process.argv.slice(3));
const code = flags.code || process.env.CREATOROS_TEST_CODE;

function requireCode() {
  if (!code) {
    console.error("缺激活码:传 --code <CODE> 或设 CREATOROS_TEST_CODE(绝不写死进脚本)。");
    process.exit(1);
  }
}

if (cmd === "machine-id") {
  const m = await resolveMachineId();
  console.log(m);
} else if (cmd === "status" || cmd === "activate") {
  requireCode();
  const machineId = await resolveMachineId();
  const path = cmd === "activate" ? "/api/license/activate" : "/api/license/status";
  console.log(`[activation] ${cmd} → ${BASE_URL}${path}`);
  console.log(`[activation] projectKey=${PROJECT_KEY} machineId=${machineId}`);
  const { httpStatus, body } = await callLicense(path, code, machineId);
  console.log(`[activation] HTTP ${httpStatus}`);
  // 打印归一关键字段(不打印激活码本身)。
  console.log(
    JSON.stringify(
      {
        success: body.success ?? null,
        valid: body.valid ?? null,
        message: body.message ?? null,
        licenseMode: body.licenseMode ?? body.license_mode ?? null,
        expiresAt: body.expiresAt ?? body.expires_at ?? null,
        isActivated: body.isActivated ?? body.is_activated ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(body.success === true ? 0 : 1);
} else {
  console.log(
    [
      "T-147 P5 激活授权测试 CLI",
      "",
      "  node scripts/desktop/activation.mjs machine-id",
      "  node scripts/desktop/activation.mjs status --code <CODE>",
      "  node scripts/desktop/activation.mjs activate --code <CODE>",
      "",
      `  服务地址: ${BASE_URL}`,
      `  projectKey: ${PROJECT_KEY}`,
      "",
      "  激活码从 --code / CREATOROS_TEST_CODE 读,绝不写死。",
    ].join("\n"),
  );
}
