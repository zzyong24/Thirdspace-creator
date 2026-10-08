#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? resolve(packageRoot, "dist", "creatoros.cjs"));
await mkdir(dirname(output), { recursive: true });
await build({
  entryPoints: [resolve(packageRoot, "src", "sea-entry.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node25",
  sourcemap: false,
  minify: true,
  legalComments: "none",
});

const smoke = spawnSync(process.execPath, [output, "operations", "describe", "accounts.list", "--json"], {
  encoding: "utf8",
  timeout: 120_000,
});
if (smoke.status !== 0) {
  throw new Error(`CLI runtime 冒烟失败(exit ${smoke.status ?? "null"})\n${smoke.stderr || smoke.stdout}`);
}
const parsed = JSON.parse(smoke.stdout);
if (parsed.ok !== true || parsed.operation !== "accounts.list") {
  throw new Error(`CLI runtime 返回不符合协议:${smoke.stdout}`);
}
process.stdout.write(`${output}\n`);
