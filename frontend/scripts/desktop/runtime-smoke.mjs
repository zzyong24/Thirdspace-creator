#!/usr/bin/env node
// T-1273 独立运行时冒烟；不加载任何混淆/字节码工具。
import { executionTimeoutMs, configureProbePage, withinExecution } from "./timeout-policy.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuildSmokeVerdictToken } from "./verdict-key-material.mjs";
const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// 保留旧测试调用者覆盖参数；新入口名称优先。
const SIDECAR = resolve(process.env.CREATOROS_RUNTIME_SMOKE_SIDECAR ??
  process.env.CREATOROS_OBFUSCATE_SIDECAR ?? join(FRONTEND, "src-tauri", "sidecar"));
export function buildSmokeSidecarEnv(
  baseEnv,
  { port, token, smokeDataRoot, libDir },
) {
  const childEnv = {
    ...baseEnv,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    CREATOROS_DESKTOP: "1",
    CREATOROS_SIDECAR_VERDICT_TOKEN: token,
    DATABASE_URL: "",
    PGLITE_DATA_DIR: join(smokeDataRoot, "db"),
    CREATOROS_DB_DIR: join(smokeDataRoot, "db"),
    CREATOROS_MEDIA_ROOT: join(smokeDataRoot, "media"),
    CREATOROS_WORKSPACES_ROOT: join(smokeDataRoot, "workspaces"),
    DYLD_LIBRARY_PATH: libDir,
    LD_LIBRARY_PATH: libDir,
  };
  delete childEnv.CREATOROS_VERDICT_SIGNING_KEY_B64;
  delete childEnv.CREATOROS_ALLOW_VERDICT_SIGNING_KEY;
  delete childEnv.CREATOROS_SMOKE_BYPASS_VERDICT;
  return childEnv;
}

/**
 * 混淆后真起 sidecar 冒烟。spawn node server.js → TCP ready-probe → GET / 200 →
 * Playwright 真浏览器完成 hydration 且无 pageerror →
 * POST /api/v1/dispatch(经 backend/modules/ai-runtime 的 composite transport;不崩即证
 * 混淆没让运行时动态 require 崩。返回 401/400/200 都算「没崩」——我们只验运行时不因混淆炸,
 * 不验业务鉴权)。任一硬失败(server 起不来 / GET / 非 200 / 路由 500 且 body 含 require 崩)→ throw。
 *
 * @param {{timeoutMs?:number}} opts
 * @returns {Promise<{ready:boolean, rootStatus:number, dispatchStatus:number,browserHydrated:boolean}>}
 */
export async function smokeBootRuntime(opts = {}) {
  const { spawn } = await import("node:child_process");
  const net = await import("node:net");
  const timeoutMs = executionTimeoutMs(opts.timeoutMs); // readiness独立步骤预算；后续HTTP/浏览器另有执行预算。

  const serverJs = join(SIDECAR, "frontend", "server.js");
  const libDir = join(SIDECAR, "lib");
  // 空闲端口。
  const port = await new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
    srv.on("error", rej);
  });

  // [T-332 S1 配套] 冒烟必须用**全新临时数据目录**:不设 PGLITE_DATA_DIR 会落到持久默认
  // 目录——上次冒烟(旧 schema)遗留的 NULL account_id 行会触发 0042 迁移 guard 正确中止,
  // 冒烟误报为「混淆破坏运行时」。mkdtemp 每次干净,顺带隔离 .auth(不碰真实登录态)。
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const smokeDataRoot = mkdtempSync(join(tmpdir(), "creatoros-smoke-"));
  const verdictToken = createBuildSmokeVerdictToken({ sidecarPort: port });

  const child = spawn(process.execPath, [serverJs], {
    env: buildSmokeSidecarEnv(process.env, {
      port,
      token: verdictToken,
      smokeDataRoot,
      libDir,
    }),
    // stdin 必须是**保持打开的管道**,不能 "ignore":lifecycle 的 Win 孤儿自检以「stdin 管道
    // 断开」判父进程已死,"ignore" 下 sidecar 启动即判孤儿 → 自觉优雅退出 → 首个请求
    // ECONNRESET(第 11 轮 CI 实证)。真实 Tauri spawn 的 stdin 本就是管道(H-key 传 key 用),
    // pipe 让冒烟更贴真实调用路径;mac 用 ppid 判定不受影响。
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  // stdout 必须消费:①Next standalone 部分报错走 stdout;②pipe 不读会背压堵死 server。
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));

  const cleanup = () => {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  };

  try {
    // TCP ready-probe。
    const deadline = Date.now() + timeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      const ok = await new Promise((res) => {
        const s = net.connect(port, "127.0.0.1");
        // 共享readiness绝对deadline；不得为最后一次尝试重新启动两分钟。
        s.setTimeout(Math.max(1, deadline - Date.now()), () => { s.destroy(); res(false); });
        s.on("connect", () => {
          s.destroy();
          res(true);
        });
        s.on("error", () => res(false));
      });
      if (ok) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break; // 进程已退(崩了)。
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!ready) {
      throw new Error(
        `[runtime:smoke] sidecar 未就绪(混淆可能破坏了运行时 require)。stderr:\n${stderr.slice(-2000)}`,
      );
    }

    // GET / —— 2xx 或 3xx 都算「运行时没崩」。桌面下 CREATOROS_DESKTOP=1 + 未激活 → P5 激活门
    //   307 → /activate(正常业务重定向,非混淆 bug)。若重定向,跟随一跳验证目标真能 200 渲染
    //   (证混淆后的 first-party route SSR 没崩)。只有 5xx / 连接失败才算混淆破坏运行时。
    const { status: rootStatus, location } = await httpProbe(`http://127.0.0.1:${port}/`, "GET");
    if (rootStatus >= 500) {
      throw new Error(`[runtime:smoke] GET / 返回 ${rootStatus}(5xx=运行时崩)。stderr:\n${stderr.slice(-2000)}`);
    }
    let renderedStatus = rootStatus;
    if (rootStatus >= 300 && rootStatus < 400 && location) {
      const target = location.startsWith("http") ? location : `http://127.0.0.1:${port}${location}`;
      const { status } = await httpProbe(target, "GET");
      renderedStatus = status;
      if (status !== 200) {
        throw new Error(
          `[runtime:smoke] GET / → ${rootStatus} ${location},但目标渲染 ${status}(期望 200)。stderr:\n${stderr.slice(-2000)}`,
        );
      }
    }

    // POST /api/v1/dispatch —— 经 backend/modules/ai-runtime 的 composite transport(chunk 里
    //   first-party 逻辑)。404/401/400/200 都算「运行时没被混淆炸」(route 逻辑正常执行到 endpoint
    //   查找);500 且 stderr 含 module/require/chunk 崩 → fail。
    const { status: dispatchStatus } = await httpProbe(
      `http://127.0.0.1:${port}/api/v1/dispatch`,
      "POST",
      JSON.stringify({ id: "smoke.noop", input: {} }),
    );
    if (
      dispatchStatus >= 500 &&
      /Cannot find module|ERR_MODULE|ChunkLoadError|is not a function/i.test(stderr)
    ) {
      throw new Error(
        `[runtime:smoke] dispatch 路由 ${dispatchStatus} 且 stderr 含 require/module/chunk 崩:\n${stderr.slice(-2000)}`,
      );
    }

    // [T-705] HTTP 200 只证明 SSR/sidecar 活着，不能证明客户端能运行。真实故障就是
    // GET / = 200，但 Zod `.datetime()` 在 Turbopack 客户端 chunk 中触发循环依赖 TDZ，
    // hydration 时抛 `Cannot access '<binding>' before initialization`，Next 随后显示全页错误。
    // 因此可分发包必须用真实 Chromium 跑一遍客户端，任何 pageerror 都 fail-fast。
    const browserProbe = await browserHydrationProbe({
      url: `http://127.0.0.1:${port}/`,
      timeoutMs,
    });

    return {
      ready: true,
      rootStatus,
      renderedStatus,
      dispatchStatus,
      browserHydrated: browserProbe.hydrated,
    };
  } catch (e) {
    // httpProbe 的网络错(如 ECONNRESET=进程处理请求中途崩)会不带 sidecar 输出直接冒泡,
    // 只见「read ECONNRESET」无从诊断(win 首跑实测)——统一附上 stderr/stdout 尾部。
    if (/stderr:/.test(`${e?.message}`)) throw e; // 三处显式 throw 已带诊断,原样
    const tail = (label, s) => (s.trim() ? `\n${label}(尾部):\n${s.slice(-2000)}` : "");
    throw new Error(`${e?.message ?? e}${tail("stderr", stderr)}${tail("stdout", stdout)}`);
  } finally {
    cleanup();
  }
}

/**
 * 用真实浏览器验证 Next 客户端完成 hydration。只检查运行时正确性，不依赖具体业务页面文案。
 * @param {{url:string,timeoutMs:number}} opts
 */
export async function browserHydrationProbe({ url, timeoutMs }) {
  timeoutMs = executionTimeoutMs(timeoutMs);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    configureProbePage(page, timeoutMs);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error?.stack ?? error?.message ?? String(error)));
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    // 给 React effect / 动态 chunk 一次事件循环窗口，避免只验到首屏 HTML。
    await page.waitForTimeout(750);
    const bodyText = await page.locator("body").innerText({ timeout: timeoutMs });
    const genericErrorVisible = /This page couldn['’]t load|Reload to try again,? or go back/i.test(bodyText);
    if (pageErrors.length > 0 || genericErrorVisible) {
      throw new Error(
        `[runtime:smoke] 浏览器 hydration 失败` +
          (genericErrorVisible ? "：页面落入 Next 全页错误边界" : "") +
          (pageErrors.length > 0 ? `\npageerror:\n${pageErrors.join("\n---\n").slice(-5000)}` : ""),
      );
    }
    return { hydrated: true };
  } finally {
    await withinExecution(browser.close());
  }
}

/** 最小 HTTP 探针(不引第三方 http client)。返回 { status, location }。 */
async function httpProbe(url, method, body) {
  const http = await import("node:http");
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        signal: AbortSignal.timeout(120_000),
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {},
      },
      (r) => {
        r.resume();
        res({ status: r.statusCode ?? 0, location: r.headers.location });
      },
    );
    req.on("error", rej);
    if (body) req.write(body);
    req.end();
  });
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  smokeBootRuntime().then(result => console.log("[runtime:smoke] " + JSON.stringify(result))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
