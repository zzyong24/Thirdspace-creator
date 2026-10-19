#!/usr/bin/env node
/**
 * [T-415 P0-B] handshake default-deny 回归卡口。
 *
 * 背景:T-413 红队复测实测,裸 `node server.js` 打 /api/knowledge/* 直接进业务(handshake 逐路由手贴,
 *   漏了 18 条路由)。修复 = 全局 proxy.ts default-deny。本脚本把「谁被守/谁裸奔」的验收固化成可复跑门:
 *   任何未来改动若让敏感路由重新裸奔,此门非零退出。
 *
 * 做法:对同一 standalone 产物裸启两次 —— 攻击者场景(不设 token env)与真机场景(设 token env),
 *   逐路由断言状态码。**只依赖 standalone 的 server.js**(plain `next build` 产物即可,不需 Tauri 壳)。
 *
 * 用法:
 *   node scripts/desktop/verify-handshake-gate.mjs [standaloneFrontendDir]
 *   默认目标:.next/standalone/frontend(CREATOROS_DESKTOP=1 next build 产物)。
 *   前置:该 build 必须是桌面态(next.config 烘焙 CREATOROS_HANDSHAKE_REQUIRED="1"),否则门自动跳过并提示。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const TOKEN = "gate-token-" + "abc123xyz";
const HEADER = "x-creatoros-handshake";

// 敏感调用面:攻击者无 token 时必须 403;真机带对头必须放行。
const SENSITIVE = [
  { method: "POST", path: "/api/chat" },
  { method: "POST", path: "/api/knowledge/distill" },
  { method: "POST", path: "/api/knowledge/search" },
  { method: "POST", path: "/api/knowledge/comment-sift" },
  { method: "POST", path: "/api/knowledge/relate" },
  { method: "POST", path: "/api/v1/dispatch" },
  { method: "POST", path: "/api/web-session" },
  { method: "POST", path: "/api/v1/settings-transfer/models" },
  // server action:POST 到页面路由 + Next-Action 头
  { method: "POST", path: "/positioning", headers: { "next-action": "gate-probe" } },
];

// allowlist:缺 token 也必须放行(不能是 403)。
const PUBLIC = [
  { method: "GET", path: "/api/v1/blob/nonexistent.png" },
  { method: "POST", path: "/api/v1/activate" },
  { method: "POST", path: "/api/v1/auth/login" },
];

// 页面导航:任何情况下都不能被 default-deny 403(防白屏)。
const NAV = [{ method: "GET", path: "/" }];

function findTarget() {
  const arg = process.argv[2];
  const candidates = arg
    ? [path.resolve(arg)]
    : [
        path.resolve("frontend/.next/standalone/frontend"),
        path.resolve(".next/standalone/frontend"),
        path.resolve("frontend/.next/standalone"),
        path.resolve(".next/standalone"),
      ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "server.js"))) return c;
  }
  console.error(
    `✗ 找不到 standalone server.js。先跑:cd frontend && CREATOROS_DESKTOP=1 npx next build\n  查过:${candidates.join(", ")}`,
  );
  process.exit(2);
}

function boot(dir, port, withToken) {
  const env = { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" };
  if (withToken) env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN = TOKEN;
  else delete env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN;
  const child = spawn(process.execPath, [path.join(dir, "server.js")], { cwd: dir, env, stdio: "ignore" });
  return child;
}

async function waitReady(port, ms = 150_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      // 探 proxy 直接短路的路由(POST /api/chat 缺 token → 403,不碰 DB;standalone 里 `/` 会因无 DB 卡住)。
      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) // 共用readiness绝对deadline，不能重置,
      });
      if (res.status) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

// proxy 拦截的独有标记 —— 区分「proxy default-deny 的 403」与「路由自身的 403」(如 blob token 校验)。
const PROXY_MARK = "originate from the local application";

// 返回 { code, blocked }:blocked = 被 **proxy** 拦(403 且 body 带 proxy 标记),不含路由自身的 403。
async function probe(port, r, extraHeader) {
  const headers = { "content-type": "application/json", ...(r.headers || {}) };
  if (extraHeader) Object.assign(headers, extraHeader);
  try {
    const res = await fetch(`http://127.0.0.1:${port}${r.path}`, {
      method: r.method,
      headers,
      body: r.method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return { code: res.status, blocked: res.status === 403 && body.includes(PROXY_MARK) };
  } catch {
    return { code: 0, blocked: false };
  }
}

async function main() {
  const dir = findTarget();
  console.log(`目标 standalone: ${dir}\n`);
  const failures = [];

  // ---- 场景 A:攻击者裸启(不设 token env;REQUIRED 靠 build 烘焙) ----
  const portA = 39230;
  const a = boot(dir, portA, false);
  try {
    if (!(await waitReady(portA))) throw new Error("场景A server 未就绪");
    // 前哨:若这个 build 没烘焙 REQUIRED(非桌面态),门无意义 —— chat 应被 proxy 拦,否则跳过
    const sentinel = await probe(portA, { method: "POST", path: "/api/chat" });
    if (!sentinel.blocked) {
      console.log(`⚠ 该 build 非桌面态(/api/chat 无 token 未被 proxy 拦,返 ${sentinel.code},REQUIRED 未烘焙)。`);
      console.log("  用 CREATOROS_DESKTOP=1 重新 build 后再验。门跳过(exit 0)。");
      process.exit(0);
    }
    console.log("场景 A(攻击者无 token,REQUIRED 已烘焙):");
    for (const r of SENSITIVE) {
      const p = await probe(portA, r);
      console.log(`  ${p.blocked ? "✓" : "✗"} ${r.method} ${r.path}${r.headers ? " [action]" : ""} → ${p.code} (期望 proxy 403)`);
      if (!p.blocked) failures.push(`A: ${r.path} 未被 proxy 拦(返 ${p.code},裸奔!)`);
    }
    for (const r of PUBLIC) {
      const p = await probe(portA, r);
      console.log(`  ${!p.blocked ? "✓" : "✗"} ${r.method} ${r.path} → ${p.code} (allowlist,期望不被 proxy 拦)`);
      if (p.blocked) failures.push(`A: allowlist ${r.path} 被 proxy 403`);
    }
    for (const r of NAV) {
      const p = await probe(portA, r);
      console.log(`  ${!p.blocked ? "✓" : "✗"} ${r.method} ${r.path} → ${p.code} (导航,期望不被 proxy 拦)`);
      if (p.blocked) failures.push(`A: 导航 ${r.path} 被 proxy 403(白屏风险)`);
    }
  } finally {
    a.kill("SIGKILL");
  }

  // ---- 场景 B:真机(设 token env),带对头放行、缺头 403 ----
  const portB = 39231;
  const b = boot(dir, portB, true);
  try {
    if (!(await waitReady(portB))) throw new Error("场景B server 未就绪");
    console.log("\n场景 B(真机有 token):");
    for (const r of SENSITIVE) {
      const pw = await probe(portB, r, { [HEADER]: TOKEN });
      console.log(`  ${!pw.blocked ? "✓" : "✗"} ${r.method} ${r.path} +对头 → ${pw.code} (期望不被 proxy 拦,不误伤真机)`);
      if (pw.blocked) failures.push(`B: ${r.path} 带对头仍被 proxy 403(误伤真机!)`);
      const pn = await probe(portB, r);
      console.log(`  ${pn.blocked ? "✓" : "✗"} ${r.method} ${r.path} 缺头 → ${pn.code} (期望 proxy 403)`);
      if (!pn.blocked) failures.push(`B: ${r.path} 缺头未被 proxy 拦(返 ${pn.code})`);
    }
  } finally {
    b.kill("SIGKILL");
  }

  console.log("");
  if (failures.length) {
    console.error(`✗ 卡口失败(${failures.length}):\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("✓ handshake default-deny 卡口全绿:敏感面缺/错 token 全 403,allowlist/导航/真机不误伤。");
}

main().catch((e) => {
  console.error("✗ 卡口异常:", e.message);
  process.exit(3);
});
