import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, statSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd(), dir = resolve(root, "docs/verification/t1159");
const manifest = JSON.parse(readFileSync(join(dir, "SOURCE_MANIFEST.json"), "utf8"));
const paths = [...manifest.entries.map(entry => entry.path), "contract/tests/current-wechat-integration.test.ts", "frontend/tests/e2e/t1159-wechat-native-report.spec.ts", "docs/verification/t1159/run-report-journey.mjs", "contract/src/envelope.ts", "frontend/src/app/api/v1/dispatch/route.test.ts"];
const sha = () => Object.fromEntries(paths.map(p => [p, createHash("sha256").update(readFileSync(resolve(root, p))).digest("hex")]));
const before = sha(), startedAt = new Date().toISOString(), tick = performance.now();
mkdirSync(dir, { recursive: true });
const dataRoot = mkdtempSync(join(tmpdir(), "creatoros-t1159-"));
const args = ["--dir", "frontend", "exec", "playwright", "test", "tests/e2e/t1159-wechat-native-report.spec.ts", "--project=e2e", "--retries=0"];
// T1166：25200秒串行旅程 + 300秒冷启动 + 600秒退出清理 + 300秒余量；内层120秒不变。
const result = spawnSync("pnpm", args, { cwd: root, encoding: "utf8", timeout: 26_400_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, CI: "", CREATOROS_TEST_PORT: "31459", CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL: "chrome", CREATOROS_PLAYWRIGHT_DATA_ROOT: dataRoot } });
const raw = (result.stdout ?? "") + (result.stderr ?? "");
const rawLogPath = join(dataRoot, "native-report-journey-raw.log"); writeFileSync(rawLogPath, raw, { mode: 0o600 });
// SEMANTIC_BOUNDARY_ALLOW: 仅遮蔽日志中的blob签名查询，私有原字节/退出码保留，不做内容取舍。
const log = raw.replace(/(\/api\/v1\/blob\/[^\s?]+)\?[^\s]+/g, "$1?[SIGNED_QUERY_REDACTED]");
writeFileSync(join(dir, "current-journey.log"), log);
const record = { schema: "creatoros-browser-journey/v1", task_id: "T-1159", head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), surface: "browser", mode: "non-fixture", input: "fresh public manual WeChat accounts without verified identity; no successful or error domain responses replaced", startedAt, finishedAt: new Date().toISOString(), elapsedSeconds: (performance.now() - tick) / 1000, argv: ["pnpm", ...args], exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, logSha256: createHash("sha256").update(log).digest("hex"), rawLogSha256: createHash("sha256").update(raw).digest("hex"), rawLogPath, dataRoot, sourceSha256: before, sourceAfter: sha(), retries: 0, nativeApp: false, modelCalled: false, realPlatformCalled: false, humanViewed: false };
writeFileSync(join(dir, "current-journey.json"), JSON.stringify(record, null, 2) + "\n");
if (result.status !== 0) { process.stderr.write(log.slice(-7000)); process.exit(result.status ?? 1); }
if (JSON.stringify(before) !== JSON.stringify(record.sourceAfter)) throw Error("受测源码在本轮Chrome期间变化");
const observationPath = join(dir, "public-read-observation.json");
if (statSync(observationPath).mtimeMs < Date.parse(startedAt)) throw Error("缺少本轮实际公共回读");
const observation = JSON.parse(readFileSync(observationPath, "utf8"));
// Chrome自有Next已由原Playwright停止后才打开同一隔离目录，避免PGlite第二写者。
const listener = spawnSync("lsof", ["-nP", "-iTCP:31459", "-sTCP:LISTEN"], { encoding: "utf8" });
if (listener.status !== 1 || listener.stdout.trim()) throw Error("测试服务尚未停止，不能打开其PGlite");
const require = createRequire(resolve(root, "backend/package.json"));
const { PGlite } = await import(pathToFileURL(require.resolve("@electric-sql/pglite")).href);
const db = new PGlite(join(dataRoot, "pglite"));
try {
  await db.waitReady;
  const ids = observation.witnesses.accountIds;
  const counts = {};
  for (const table of ["platform_collection_runs", "platform_native_reports", "platform_bind_attempts"]) {
    const result = await db.query(`SELECT count(*)::int AS count FROM ${table} WHERE account_id=ANY($1::text[])`, [ids]);
    counts[table] = result.rows[0].count;
    if (counts[table] !== 0) throw Error("未验证身份意外产生持久平台副作用：" + table);
  }
  const files = directory => !existsSync(directory) ? [] : readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
  const profileFiles = files(join(dataRoot, "auth-web")).filter(p => p.includes("wechatOfficial") || p.includes("wechatVideo"));
  if (profileFiles.length) throw Error("未验证身份意外创建微信profile文件");
  writeFileSync(join(dir, "post-stop-side-effect-observation.json"), JSON.stringify({ source: "same fresh PGlite after original test server stopped", accountIds: ids, counts, wechatProfileFiles: profileFiles.length, domainWrites: false, realUserDataTouched: false }, null, 2) + "\n");
} finally { await db.close(); }
writeFileSync(join(dir, "visible-copy.json"), JSON.stringify({ schema: "frontend-visible-copy/v1", task_id: "T-1159", commit_sha: record.head, captures: observation.captures.map(c => ({ checkpoint: c.name, check_ids: c.check_ids, viewport: c.viewport, text: c.text })) }, null, 2) + "\n");
console.log(JSON.stringify({ ...record, postStopObservationPassed: true }));
