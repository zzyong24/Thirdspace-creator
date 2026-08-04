#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const OUT_ROOT = resolve(SCRIPT_DIR, "out");
const CLOSURE_ROOT = resolve(OUT_ROOT, "closure");
const NEXT_REPORT = resolve(OUT_ROOT, "next-adapter-outputs.json");

export function productionClosurePlan({ preparePackage = false } = {}) {
  const steps = [
    {
      name: "Next adapter production build",
      command: "pnpm",
      args: ["-C", "frontend", "build"],
      env: {
        CREATOROS_DESKTOP: "1",
        NEXT_ADAPTER_PATH: resolve(SCRIPT_DIR, "next-output-adapter.mjs"),
        CREATOROS_NEXT_OUTPUT_REPORT: NEXT_REPORT,
      },
    },
    {
      name: "prepare Next bootstrap",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "prepare-next-bootstrap.mjs"),
        "frontend/.next/standalone",
      ],
    },
    {
      name: "NCC Next bootstrap",
      command: "pnpm",
      args: [
        "dlx",
        "@vercel/ncc@0.38.4",
        "build",
        "frontend/.next/standalone/frontend/server.js",
        "-m",
        "-o",
        "tools/windows-closure-rat/out/ncc-core",
      ],
    },
    {
      name: "bundle Pi engine",
      command: process.execPath,
      args: [resolve(SCRIPT_DIR, "build-pi-bundle.mjs")],
    },
    {
      name: "materialize traced closure",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "materialize-next-closure.mjs"),
        "tools/windows-closure-rat/out/next-adapter-outputs.json",
        "tools/windows-closure-rat/out/closure",
      ],
      env: {
        CREATOROS_TARGET_PLATFORM: "win32",
        CREATOROS_TARGET_ARCH: "x64",
      },
    },
    {
      name: "finalize NCC core",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "finalize-ncc-core.mjs"),
        "tools/windows-closure-rat/out/closure",
        "tools/windows-closure-rat/out/ncc-core",
      ],
    },
    {
      name: "assemble five runtime layers",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "assemble-runtime-layers.mjs"),
        "tools/windows-closure-rat/out/closure",
        "tools/windows-closure-rat/out/pi-bundle.mjs",
      ],
      env: {
        CREATOROS_TARGET_PLATFORM: "win32",
        CREATOROS_TARGET_ARCH: "x64",
      },
    },
    {
      name: "runtime consumer smoke",
      command: resolve(
        CLOSURE_ROOT,
        "layers/core/bin/creatoros-server.exe",
      ),
      args: [
        "--require",
        resolve(CLOSURE_ROOT, "frontend/creatoros-module-resolver.cjs"),
        resolve(SCRIPT_DIR, "runtime-smoke.mjs"),
        "tools/windows-closure-rat/out/closure",
      ],
      env: { CREATOROS_RUNTIME_ROOT: CLOSURE_ROOT },
    },
  ];

  if (preparePackage) {
    steps.push({
      name: "prepare Tauri packaged runtime",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "prepare-packaged-runtime.mjs"),
        "tools/windows-closure-rat/out/closure",
      ],
    });
  }
  return steps;
}

function runStep(step) {
  console.log(`\n[production-closure] ▶ ${step.name}`);
  console.log(
    `[production-closure]   $ ${step.command} ${step.args.join(" ")}`,
  );
  const result = spawnSync(step.command, step.args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...(step.env ?? {}) },
    stdio: "inherit",
    shell: process.platform === "win32" && step.command === "pnpm",
  });
  if (result.status !== 0) {
    throw new Error(
      `[T-675] production closure 失败:${step.name}(exit=${result.status})`,
    );
  }
}

export function buildProductionClosure({ preparePackage = false } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      `[T-675] Windows production closure 只能在 win32-x64 构建，当前=${process.platform}-${process.arch}`,
    );
  }
  rmSync(OUT_ROOT, { recursive: true, force: true });
  for (const step of productionClosurePlan({ preparePackage })) runStep(step);
  if (!existsSync(resolve(CLOSURE_ROOT, "runtime-smoke-results.json"))) {
    throw new Error("[T-675] production closure 缺 runtime smoke 证据");
  }
  if (
    preparePackage &&
    !existsSync(resolve(OUT_ROOT, "packaged-runtime-summary.json"))
  ) {
    throw new Error("[T-675] production closure 缺 packaged runtime summary");
  }
  console.log("\n[production-closure] ✅ Windows production closure 已完成");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes("--print-plan")) {
    console.log(
      JSON.stringify(
        productionClosurePlan({
          preparePackage: process.argv.includes("--prepare-package"),
        }),
        null,
        2,
      ),
    );
  } else {
    buildProductionClosure({
      preparePackage: process.argv.includes("--prepare-package"),
    });
  }
}
