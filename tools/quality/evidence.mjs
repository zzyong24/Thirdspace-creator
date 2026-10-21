// 证据汇总：verify:task / verify:release 共用
import fs from "node:fs";
import path from "node:path";
import { ROOT, sha256 } from "./lib.mjs";

export function summarize(kind, meta, steps, tests, notRun = []) {
  const blocking = steps.filter((s) => !s.allow_failure && s.exit_code !== 0);
  const testFail = tests.filter((t) => !t.ok);
  const verdict = blocking.length || testFail.length ? "fail" : "pass";
  return {
    schema: `creatoros-${kind}/v1`, verdict, ...meta,
    summary: {
      blocking_failed_steps: blocking.map((s) => s.name),
      non_blocking_failed_steps: steps.filter((s) => s.allow_failure && s.exit_code !== 0).map((s) => s.name),
      oom_steps: steps.filter((s) => s.oom).map((s) => s.name),
      new_failures: tests.flatMap((t) => t.new_failures.map((f) => ({ package: t.package, file: f.file, test: f.test }))),
      known_failures: tests.flatMap((t) => t.known_failures.map((f) => ({ package: t.package, id: f.known_id, test: f.test }))),
      resolved_known_failures: tests.flatMap((t) => t.resolved_known_failures),
      not_run: notRun,
    },
    steps,
    tests: tests.map(({ step, ...t }) => ({ ...t, step })),
  };
}

export function writeEvidence(evidence, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const text = JSON.stringify(evidence, null, 2) + "\n";
  fs.writeFileSync(outPath, text);
  const rel = path.relative(ROOT, outPath);
  console.log(`\n结论 ${evidence.verdict.toUpperCase()}；证据 ${rel}（sha256 ${sha256(text).slice(0, 12)}）`);
  const s = evidence.summary;
  if (s.blocking_failed_steps.length) console.log(`阻断失败步骤：${s.blocking_failed_steps.join("、")}`);
  if (s.non_blocking_failed_steps.length) console.log(`非阻断失败（只记录）：${s.non_blocking_failed_steps.join("、")}`);
  if (s.new_failures.length) console.log(`新失败 ${s.new_failures.length} 条：\n` + s.new_failures.map((f) => `  ✗ [${f.package}] ${f.file} :: ${f.test}`).join("\n"));
  if (s.known_failures.length) console.log(`已知失败 ${s.known_failures.length} 条（${[...new Set(s.known_failures.map((f) => f.id))].join("、")}）`);
  if (s.resolved_known_failures.length) console.log(`已转绿、应删出清单：${s.resolved_known_failures.join("、")}`);
  if (s.not_run.length) console.log(`未运行：${s.not_run.map((n) => `${n.name}（${n.reason}）`).join("；")}`);
}
