#!/usr/bin/env node
// Linux CI 的真实 Chrome 环境诊断；不替代产品渲染/完整测试，不豁免任何失败。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output-dir") {
  throw new Error("用法: node tools/quality/chromium-smoke.mjs --output-dir <本轮证据目录>");
}
if (process.platform !== "linux") throw new Error("此诊断需要实际 Linux Chrome，不能以其他平台代签");
const output = path.resolve(args[1]);
const temporaryRoot = process.env.TMPDIR;
const browser = process.env.CREATOROS_RENDER_CHROMIUM_PATH;
if (!temporaryRoot || !path.isAbsolute(temporaryRoot)) throw new Error("必须显式提供本轮私有 TMPDIR");
if (!browser || !path.isAbsolute(browser)) throw new Error("必须绑定已安装的 CREATOROS_RENDER_CHROMIUM_PATH");
fs.accessSync(browser, fs.constants.X_OK);
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const home = fs.mkdtempSync(path.join(temporaryRoot, "creatoros-test-home-chrome-"));
const htmlTemporary = fs.mkdtempSync(path.join(temporaryRoot, "creatoros-html-render-"));
const t1324Root = process.env.T1324_RUNTIME_ROOT || path.join(temporaryRoot, "t1324");
const casesRoot = path.join(t1324Root, "cases", "unbound");
fs.mkdirSync(casesRoot, { recursive: true, mode: 0o700 });
const taskRoot = fs.mkdtempSync(path.join(casesRoot, "pure-"));
const taskTemporary = path.join(taskRoot, "tmp");
fs.mkdirSync(taskTemporary, { mode: 0o700 });

// 与执行层相同的基础运行变量；不记录或继承模型、数据库及 Node preload 配置。
const inheritedKeys = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "TZ", "USER", "LOGNAME",
  "DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "FONTCONFIG_PATH", "LD_LIBRARY_PATH"];
const baseEnvironment = Object.fromEntries(inheritedKeys.filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
Object.assign(baseEnvironment, { HOME: home, CODEX_HOME: path.join(home, ".codex") });
const htmlEnvironment = {
  PATH: process.env.PATH ?? "", HOME: home, CODEX_HOME: path.join(home, ".codex"),
  USERPROFILE: htmlTemporary, APPDATA: htmlTemporary, LOCALAPPDATA: htmlTemporary,
  SystemRoot: "", WINDIR: "", LANG: process.env.LANG ?? "en_US.UTF-8",
};
const cases = [
  { name: "parent-tmp", tmp: temporaryRoot, profileRoot: temporaryRoot, environment: baseEnvironment },
  // Playwright 在父进程 TMPDIR 创建 profile，Chrome 自身收到 HTML 调用私有 TMPDIR。
  { name: "html-child-tmp", tmp: htmlTemporary, profileRoot: temporaryRoot, environment: htmlEnvironment },
  // T1324 测试重设进程 TMPDIR，HyperFrames/Puppeteer 及 Chrome 均继承任务级临时目录。
  { name: "t1324-task-tmp", tmp: taskTemporary, profileRoot: taskTemporary, environment: baseEnvironment },
];
const records = [];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const document = "data:text/html;charset=utf-8," + encodeURIComponent("<!doctype html><html><body style='margin:0;background:rgb(223,40,40)'><h1>CreatorOS Chromium smoke</h1></body></html>");

for (const item of cases) {
  const directory = path.join(output, item.name);
  fs.mkdirSync(directory, { mode: 0o700 });
  const profile = fs.mkdtempSync(path.join(item.profileRoot, "chrome-smoke-profile-"));
  const screenshot = path.join(directory, "screenshot.png");
  const stdout = fs.openSync(path.join(directory, "stdout.log"), "w", 0o600);
  const stderr = fs.openSync(path.join(directory, "stderr.log"), "w", 0o600);
  const commandArgs = ["--headless", "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-sync", "--disable-extensions", "--disable-breakpad", "--no-first-run",
    "--enable-logging=stderr", "--window-size=800,600", "--force-device-scale-factor=1", "--hide-scrollbars",
    `--user-data-dir=${profile}`, `--screenshot=${screenshot}`, document];
  const environment = { ...item.environment, TMPDIR: item.tmp, TEMP: item.tmp, TMP: item.tmp };
  const record = { name: item.name, browser, argv: commandArgs, tmp: item.tmp, tmpBytes: Buffer.byteLength(item.tmp),
    // Chrome 148 源码支持 branded/unbranded 两种目录前缀；Linux sun_path 需小于108字节。
    singletonPathBytes: ["com.google.Chrome", "org.chromium.Chromium"].map(prefix => Buffer.byteLength(path.join(item.tmp, `${prefix}.XXXXXX`, "SingletonSocket"))),
    home, profile, startedAt: new Date().toISOString(), exitCode: null, signal: null, timedOut: false, png: null, ok: false };
  try {
    await new Promise(resolve => {
      const child = spawn(browser, commandArgs, { env: environment, detached: true, stdio: ["ignore", stdout, stderr] });
      const timer = setTimeout(() => {
        record.timedOut = true;
        if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (error) { record.killError = String(error); } }
      }, 120_000);
      child.once("error", error => { record.spawnError = String(error); });
      child.once("close", (code, signal) => {
        clearTimeout(timer); record.exitCode = code; record.signal = signal; resolve();
      });
    });
    try {
      const bytes = fs.readFileSync(screenshot);
      const valid = bytes.length > 64 && bytes.subarray(0, 8).equals(pngSignature)
        && bytes.subarray(12, 16).toString() === "IHDR" && bytes.subarray(-8, -4).toString() === "IEND"
        && bytes.readUInt32BE(16) === 800 && bytes.readUInt32BE(20) === 600;
      record.png = { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
        sha256: createHash("sha256").update(bytes).digest("hex"), valid };
      record.ok = record.exitCode === 0 && record.signal === null && !record.timedOut && valid;
    } catch (error) { record.pngError = String(error); }
  } finally {
    fs.closeSync(stdout); fs.closeSync(stderr);
    record.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(record, null, 2) + "\n");
    records.push(record);
    console.log(`[chromium-smoke] ${JSON.stringify(record)}`);
  }
}
const report = { schema: "creatoros-chromium-smoke/v1", ok: records.every(record => record.ok), records,
  limit: "仅实际Chrome启动/PNG与环境诊断；完整产品安全、PNG/PDF、HyperFrames渲染仍由原完整测试验收。全stderr未截断，保留真实exit/signal；不把SIGTRAP等异常登记known。" };
fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(report, null, 2) + "\n");
if (!report.ok) process.exitCode = 1;
