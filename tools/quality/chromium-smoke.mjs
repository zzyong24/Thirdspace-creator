#!/usr/bin/env node
// 真实 Playwright/Chrome 环境诊断；不替代原产品测试，不豁免任何失败。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const workspace = path.resolve(path.dirname(scriptPath), "../..");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const errorRecord = error => ({ name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack });
const pngRecord = file => {
  const bytes = fs.readFileSync(file);
  const valid = bytes.length > 64 && bytes.subarray(0, 8).equals(pngSignature)
    && bytes.subarray(12, 16).toString() === "IHDR" && bytes.subarray(-8, -4).toString() === "IEND"
    && bytes.readUInt32BE(16) === 800 && bytes.readUInt32BE(20) === 600;
  return { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex"), valid };
};
async function within(operation, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("CHROMIUM_SMOKE_ABSOLUTE_DEADLINE");
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("CHROMIUM_SMOKE_ABSOLUTE_DEADLINE")), remaining);
  })]); } finally { clearTimeout(timer); }
}

async function runDriver(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const result = { platform: process.platform, phases: [], probeOk: false, cleanupConfirmed: false, ok: false };
  const phase = name => {
    const row = { name, elapsedMs: Date.now() - config.startedAtMs };
    result.phases.push(row); console.log(`[chromium-smoke-stage] ${JSON.stringify(row)}`);
  };
  const remaining = () => {
    const ms = config.deadlineAt - Date.now();
    if (ms <= 0) throw new Error("CHROMIUM_SMOKE_ABSOLUTE_DEADLINE");
    return ms;
  };
  let browser, launching;
  try {
    phase("import");
    const require = createRequire(path.join(workspace, "frontend/package.json"));
    const { chromium } = require("@playwright/test");
    phase("launch");
    launching = chromium.launch({ executablePath: config.browser, headless: true,
      chromiumSandbox: process.platform === "darwin", timeout: remaining(),
      args: ["--disable-background-networking", "--disable-sync", "--disable-extensions", "--no-first-run", "--enable-logging=stderr"],
      env: config.environment });
    browser = await within(() => launching, config.deadlineAt);
    result.browserVersion = browser.version();
    phase("context");
    const context = await within(() => browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1,
      javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false, offline: true, permissions: [], reducedMotion: "reduce" }), config.deadlineAt);
    context.setDefaultTimeout(remaining());
    context.setDefaultNavigationTimeout(remaining());
    const page = await within(() => context.newPage(), config.deadlineAt);
    const documentUrl = "https://creatoros-render.invalid/";
    await within(() => context.route("**/*", route => route.request().url() === documentUrl && route.request().isNavigationRequest()
      ? route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><html><body style='margin:0;background:rgb(223,40,40)'><h1>CreatorOS Chromium smoke</h1></body></html>" })
      : route.abort("blockedbyclient")), config.deadlineAt);
    phase("navigate");
    const response = await within(() => page.goto(documentUrl, { waitUntil: "load", timeout: remaining() }), config.deadlineAt);
    if (response?.status() !== 200) throw new Error("CHROMIUM_SMOKE_DOCUMENT_NOT_LOADED");
    phase("screenshot");
    await within(() => page.screenshot({ path: config.screenshot, type: "png", fullPage: false, animations: "disabled", timeout: remaining() }), config.deadlineAt);
    result.png = pngRecord(config.screenshot);
    if (!result.png.valid) throw new Error("CHROMIUM_SMOKE_INVALID_PNG");
    result.probeOk = true; phase("png-verified");
  } catch (error) { result.error = errorRecord(error); console.error(error?.stack ?? error); }
  finally {
    phase("close");
    const closeDeadlineAt = Math.min(Date.now() + 30_000, config.cleanupDeadlineAt);
    result.closeDeadlineAt = closeDeadlineAt;
    try {
      // 探针共享同一个120s绝对期限；清理只使用其后的30s，不重启任何步骤预算。
      if (!browser && launching) browser = await within(() => launching.catch(() => undefined), closeDeadlineAt);
      if (browser) await within(() => browser.close(), closeDeadlineAt);
      result.cleanupConfirmed = true; phase("closed");
    } catch (error) { result.cleanupError = errorRecord(error); console.error(error?.stack ?? error); }
    result.ok = result.probeOk && result.cleanupConfirmed;
    fs.writeFileSync(config.driverResult, JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  }
}

const browserProcesses = log => {
  const exits = [];
  for (const match of log.matchAll(/\[pid=(\d+)\] <process did exit: exitCode=(null|-?\d+), signal=(null|[A-Z0-9]+)>/g)) {
    exits.push({ pid: Number(match[1]), exitCode: match[2] === "null" ? null : Number(match[2]), signal: match[3] === "null" ? null : match[3] });
  }
  return exits;
};
async function runParent(output) {
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { schema: "creatoros-chromium-smoke/v2", platform: process.platform, ok: false, records: [],
    limit: "同版Playwright实际launch/离线route/PNG/close；保完整pw:browser日志中的Chrome stderr与真实exit/signal。driver退出单列；不替代原PNG/PDF/HyperFrames/完整suite，不豁免失败。" };
  try {
    if (!["linux", "darwin"].includes(process.platform)) throw new Error("此诊断仅支持Linux或macOS；CI必须实际Linux");
    if (process.env.GITHUB_ACTIONS === "true" && process.platform !== "linux") throw new Error("CI_CHROMIUM_SMOKE_REQUIRES_LINUX");
    const temporaryRoot = process.env.TMPDIR, executable = process.env.CREATOROS_RENDER_CHROMIUM_PATH;
    if (!temporaryRoot || !path.isAbsolute(temporaryRoot)) throw new Error("必须显式提供本轮私有TMPDIR");
    if (!executable || !path.isAbsolute(executable)) throw new Error("必须绑定已安装的CREATOROS_RENDER_CHROMIUM_PATH");
    fs.accessSync(executable, fs.constants.X_OK);
    if (!fs.statSync(executable).isFile()) throw new Error("CHROMIUM_SMOKE_EXECUTABLE_NOT_FILE");
    const home = fs.mkdtempSync(path.join(temporaryRoot, "creatoros-test-home-chrome-"));
    const htmlTemporary = fs.mkdtempSync(path.join(temporaryRoot, "creatoros-html-render-"));
    const casesRoot = path.join(process.env.T1324_RUNTIME_ROOT || path.join(temporaryRoot, "t1324"), "cases", "unbound");
    fs.mkdirSync(casesRoot, { recursive: true, mode: 0o700 });
    const taskTemporary = path.join(fs.mkdtempSync(path.join(casesRoot, "pure-")), "tmp");
    fs.mkdirSync(taskTemporary, { mode: 0o700 });
    // 只复制实际运行所需白名单，不透传模型/数据库/Node preload配置。
    const keys = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "TZ", "USER", "LOGNAME", "DISPLAY", "XAUTHORITY",
      "XDG_RUNTIME_DIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "FONTCONFIG_PATH", "LD_LIBRARY_PATH", "__CF_USER_TEXT_ENCODING"];
    const base = { ...Object.fromEntries(keys.filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]])), HOME: home, CODEX_HOME: path.join(home, ".codex") };
    const html = { PATH: process.env.PATH ?? "", HOME: home, CODEX_HOME: path.join(home, ".codex"), USERPROFILE: htmlTemporary,
      APPDATA: htmlTemporary, LOCALAPPDATA: htmlTemporary, SystemRoot: "", WINDIR: "", LANG: process.env.LANG ?? "en_US.UTF-8" };
    const cases = [{ name: "parent-tmp", tmp: temporaryRoot, profileRoot: temporaryRoot, environment: base },
      { name: "html-child-tmp", tmp: htmlTemporary, profileRoot: temporaryRoot, environment: html },
      { name: "t1324-task-tmp", tmp: taskTemporary, profileRoot: taskTemporary, environment: base }];
    for (const item of cases) {
      const directory = path.join(output, item.name);
      fs.mkdirSync(directory, { mode: 0o700 });
      const screenshot = path.join(directory, "screenshot.png"), stderrPath = path.join(directory, "stderr.log");
      const configFile = path.join(directory, "driver-config.json"), driverResult = path.join(directory, "driver-result.json");
      const startedAtMs = Date.now(), deadlineAt = startedAtMs + 120_000;
      const environment = { ...item.environment, TMPDIR: item.tmp, TEMP: item.tmp, TMP: item.tmp };
      fs.writeFileSync(configFile, JSON.stringify({ browser: executable, screenshot, driverResult, environment, startedAtMs, deadlineAt, cleanupDeadlineAt: deadlineAt + 30_000 }, null, 2) + "\n", { mode: 0o600 });
      const record = { name: item.name, platform: process.platform, browser: executable, tmp: item.tmp, tmpBytes: Buffer.byteLength(item.tmp), home,
        singletonPathBytes: ["com.google.Chrome", "org.chromium.Chromium"].map(prefix => Buffer.byteLength(path.join(item.tmp, `${prefix}.XXXXXX`, "SingletonSocket"))),
        startedAt: new Date(startedAtMs).toISOString(), deadlineAt, cleanupDeadlineAt: deadlineAt + 30_000,
        driver: { exitCode: null, signal: null, timedOut: false }, browserProcesses: [], ok: false };
      const stdout = fs.openSync(path.join(directory, "stdout.log"), "w", 0o600), stderr = fs.openSync(stderrPath, "w", 0o600);
      try {
        await new Promise(resolve => {
          // DEBUG在新driver导入Playwright前生效；完整启动、stderr、退出日志写文件而非截断异常摘要。
          const child = spawn(process.execPath, [scriptPath, "--run-case", configFile], { detached: true, stdio: ["ignore", stdout, stderr],
            env: { ...base, TMPDIR: item.profileRoot, TMP: item.profileRoot, TEMP: item.profileRoot, DEBUG: "pw:browser", DEBUG_COLORS: "0" } });
          const timer = setTimeout(() => {
            record.driver.timedOut = true;
            const logs = fs.readFileSync(stderrPath, "utf8"), exited = new Set(browserProcesses(logs).map(row => row.pid));
            // Playwright的Chrome是自有独立进程组，不能只杀driver进程组后留下浏览器。
            for (const match of logs.matchAll(/<launched> pid=(\d+)/g)) {
              const pid = Number(match[1]);
              if (!exited.has(pid)) { try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") record.browserKillError = String(error); } }
            }
            if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") record.driverKillError = String(error); } }
          }, Math.max(1, deadlineAt + 30_000 - Date.now()));
          child.once("error", error => { record.driver.spawnError = errorRecord(error); });
          child.once("close", (code, signal) => { clearTimeout(timer); record.driver.exitCode = code; record.driver.signal = signal; resolve(); });
        });
        record.browserProcesses = browserProcesses(fs.readFileSync(stderrPath, "utf8"));
        try { record.result = JSON.parse(fs.readFileSync(driverResult, "utf8")); } catch (error) { record.resultError = errorRecord(error); }
        try { record.png = pngRecord(screenshot); } catch (error) { record.pngError = errorRecord(error); }
        record.ok = record.driver.exitCode === 0 && record.driver.signal === null && !record.driver.timedOut && record.result?.ok === true
          && record.png?.valid === true && record.browserProcesses.length > 0 && record.browserProcesses.every(row => row.exitCode === 0 && row.signal === null);
      } finally {
        fs.closeSync(stdout); fs.closeSync(stderr); record.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(record, null, 2) + "\n");
        report.records.push(record); console.log(`[chromium-smoke] ${JSON.stringify(record)}`);
      }
    }
    report.ok = report.records.length === 3 && report.records.every(row => row.ok);
  } catch (error) { report.error = errorRecord(error); console.error(error?.stack ?? error); }
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(report, null, 2) + "\n");
  if (!report.ok) process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args.length !== 2 || !["--output-dir", "--run-case"].includes(args[0])) throw new Error("用法: node tools/quality/chromium-smoke.mjs --output-dir <本轮证据目录>");
if (args[0] === "--run-case") await runDriver(path.resolve(args[1]));
else await runParent(path.resolve(args[1]));
