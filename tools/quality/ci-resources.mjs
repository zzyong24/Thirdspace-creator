#!/usr/bin/env node
// 运行中持续留证：runner 被终止时也能从已上传的 stdout 读到最后样本。
// 采样不是峰值保证；cgroup 不可读时明确记 unavailable，不能据此排除 OOM。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const output = process.argv[2];
if (!output) throw new Error("用法: node tools/quality/ci-resources.mjs <samples.jsonl> [--once]");
const read = (file) => {
  try { return fs.readFileSync(file, "utf8").trim(); }
  catch (error) { return { unavailable: error.code ?? String(error) }; }
};
function sample() {
  const membership = read("/proc/self/cgroup");
  const relative = typeof membership === "string" ? membership.split("\n").find(line => line.startsWith("0::"))?.slice(3) : null;
  const cgroup = relative ? path.join("/sys/fs/cgroup", relative) : null;
  let processes;
  try {
    // 不采集 argv 或环境变量，避免把凭据写入日志。
    processes = execFileSync("ps", ["-eo", "pid,ppid,rss,comm", "--sort=-rss"], { encoding: "utf8", timeout: 5000 }).trim().split("\n").slice(0, 16);
  } catch (error) { processes = { unavailable: error.code ?? String(error) }; }
  const record = {
    at: new Date().toISOString(),
    meminfo: read("/proc/meminfo"),
    cgroup_membership: membership,
    // 根 cgroup 不提供 memory controller 统计；不把缺失记成零。
    cgroup_memory: cgroup && relative !== "/" ? Object.fromEntries(
      ["memory.current", "memory.peak", "memory.max", "memory.events", "memory.events.local", "memory.swap.current"].map(name => [name, read(path.join(cgroup, name))]),
    ) : { unavailable: "未找到非根 cgroup v2" },
    processes,
  };
  const line = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(output, line);
  process.stdout.write(`[ci-resources] ${line}`);
}
sample();
if (!process.argv.includes("--once")) setInterval(sample, 30_000);
