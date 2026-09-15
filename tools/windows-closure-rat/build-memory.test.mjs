import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { buildMemoryEnvironment } from "./build-memory.mjs";
import { productionClosurePlan } from "./build-production-closure.mjs";
const MiB = 1024 ** 2;

test("heap budget reserves host memory and stays bounded", () => {
  assert.equal(buildMemoryEnvironment({ totalBytes: 7 * 1024 * MiB, constrainedBytes: 0 }).heapMiB, 4096);
  assert.equal(buildMemoryEnvironment({ totalBytes: 16 * 1024 * MiB, constrainedBytes: 0 }).heapMiB, 6144);
  assert.equal(buildMemoryEnvironment({ totalBytes: 16 * 1024 * MiB, constrainedBytes: 7 * 1024 * MiB }).heapMiB, 4096);
  assert.throws(() => buildMemoryEnvironment({ totalBytes: 3 * 1024 * MiB, constrainedBytes: 0 }), /内存/);
});

test("only Next build requests memory configuration; installed runtime stays unchanged", () => {
  const plan = productionClosurePlan();
  assert.equal(plan[0].buildMemory, true);
  assert.equal(plan.slice(1).some(step => step.buildMemory || step.env?.NODE_OPTIONS), false);
});

test("real Next typecheck Worker inherits heap budget and retains other Node options", async () => {
  const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
  const workerPath = require.resolve("next/dist/lib/worker.js");
  const dir = mkdtempSync(join(tmpdir(), "creatoros-build-memory-"));
  const fixture = join(dir, "probe.cjs");
  writeFileSync(fixture, 'exports.probe = () => ({heap: require("node:v8").getHeapStatistics().heap_size_limit, options: process.env.NODE_OPTIONS});');
  try {
    for (const previous of ["--trace-warnings --max-old-space-size=2048", "--trace-warnings --max_old_space_size=2048"]) {
      const original = { NODE_OPTIONS: previous, SENTINEL: "kept" };
      const config = buildMemoryEnvironment({ totalBytes: 7 * 1024 * MiB, constrainedBytes: 0, env: original });
      const script = `const {Worker}=require(${JSON.stringify(workerPath)}); const w=new Worker(${JSON.stringify(fixture)}, {exposedMethods:["probe"],numWorkers:1,isolatedMemory:false,maxRetries:0}); w.probe().then(async result=>{console.log(JSON.stringify(result));await w.end();}).catch(e=>{console.error(e);process.exit(1)});`;
      const entry = join(dir, "entry.cjs");
      writeFileSync(entry, script);
      const result = spawnSync(process.execPath, [entry], { env: {...process.env, ...config.env}, encoding: "utf8", timeout: 20000 });
      assert.equal(result.status, 0, result.stderr);
      const probe = JSON.parse(result.stdout.trim());
      assert.ok(probe.heap >= 4096 * MiB && probe.heap < 4300 * MiB, JSON.stringify(probe));
      assert.match(probe.options, /--trace-warnings/);
      assert.equal(original.NODE_OPTIONS, previous);
      assert.equal(config.env.SENTINEL, "kept");
    }
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
