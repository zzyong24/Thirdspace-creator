#!/usr/bin/env node
// 维护辅助：读 run-tests 的证据 JSON，把「新失败」整理成候选条目打印出来，只供人工审核后粘进
// known-failures.json；本脚本从不改清单。逐条输出，test="*" 仅表示文件级错误，不能聚合具体用例。
// kind 只是按报错文字猜测，必须人工确认；env 还须人工补充稳定错误标记 message_includes。
// 用法：node tools/quality/propose-known-failures.mjs <evidence.json>... [--since YYYY-MM-DD]
import fs from "node:fs";

const argv = process.argv.slice(2);
const since = argv.includes("--since") ? argv[argv.indexOf("--since") + 1] : new Date().toISOString().slice(0, 10);
const files = argv.filter((a, i) => a.endsWith(".json") && argv[i - 1] !== "--since");
const ENV = /T1246_ENV_NOT_OWNED_PG|隔离 ?PG|独立PG|隔离 PostgreSQL|CREATOROS_TEST_POSTGRES_URL|_FILE必须指向|缺少原固定|DIAGNOSTIC_OWNED_OUTPUT_REQUIRED|Executable doesn't exist|_RUN_DIR_REQUIRED|T1332_APPROVED/;
const out = [];
for (const f of files) {
  const ev = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const x of ev.new_failures ?? []) {
    const first = (x.message || "").replace(/\x1b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";
    const task = (x.test.match(/T-?(\d{3,4})/) || x.file.match(/t-?(\d{3,4})/i) || [])[1];
    out.push({ id: "KF-???", package: ev.package, file: x.file, test: x.test, kind: ENV.test(first) ? "env" : "fail",
      reason: first.slice(0, 160), owner_task: task ? `T-${task}` : "待立项", since });
  }
}
console.log(JSON.stringify(out, null, 2));
