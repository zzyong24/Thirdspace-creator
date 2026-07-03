#!/usr/bin/env node
// 冒烟脚本 —— 模拟一个最小 MCP client:以子进程 stdio 拉起 creatoros MCP server,
// 走 JSON-RPC(initialize → tools/list → tools/call ×2),对着运行中的 dev server
// (默认 http://localhost:3000)验证三件事:
//   ① tools/list 返回全部工具
//   ② tools/call projects_list 返回真项目
//   ③ tools/call pages_dashboard_get 返回真数据
// 用法:node mcp-server/scripts/smoke.mjs(需 dev server 已在 :3000 运行)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  "node",
  ["--import", "tsx", path.join(pkgRoot, "src/index.ts")],
  {
    cwd: pkgRoot,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env },
  },
);

let nextId = 0;
const pending = new Map();
let buffer = "";

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  // stdio transport 按行分帧:一行一个 JSON-RPC message。
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

function request(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 30_000);
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function parseToolResult(result) {
  if (result.isError) {
    throw new Error(`tool 返回 isError:${result.content?.[0]?.text}`);
  }
  return JSON.parse(result.content[0].text);
}

let failed = false;
try {
  // ── handshake ──────────────────────────────────────────────
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-client", version: "0.0.1" },
  });
  notify("notifications/initialized");
  console.log(`✅ initialize:server=${init.serverInfo.name}@${init.serverInfo.version}`);

  // ── ① tools/list ──────────────────────────────────────────
  const { tools } = await request("tools/list");
  const readCount = tools.filter((t) => t.annotations?.readOnlyHint).length;
  console.log(
    `✅ tools/list:共 ${tools.length} 个工具(只读 ${readCount},写 ${tools.length - readCount})`,
  );
  for (const name of ["projects_list", "pages_dashboard_get", "knowledge_create", "creatoros_overview"]) {
    if (!tools.some((t) => t.name === name)) throw new Error(`缺少工具 ${name}`);
  }

  // ── ② projects_list ───────────────────────────────────────
  const projects = parseToolResult(
    await request("tools/call", { name: "projects_list", arguments: { query: {} } }),
  );
  const items = projects.data ?? [];
  console.log(
    `✅ projects_list:${items.length} 个项目${items[0] ? `,首个「${items[0].title ?? items[0].name ?? items[0].id}」` : ""}`,
  );

  // ── ③ pages_dashboard_get ─────────────────────────────────
  const dashboard = parseToolResult(
    await request("tools/call", { name: "pages_dashboard_get", arguments: {} }),
  );
  console.log(
    `✅ pages_dashboard_get:data keys = ${Object.keys(dashboard.data ?? {}).join(", ")}`,
  );

  console.log("\n冒烟通过:tools/list + projects_list + pages_dashboard_get 全部真实返回。");
} catch (err) {
  failed = true;
  console.error("\n❌ 冒烟失败:", err.message);
} finally {
  child.kill();
  process.exit(failed ? 1 : 0);
}
