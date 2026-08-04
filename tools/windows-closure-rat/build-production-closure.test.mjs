import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { productionClosurePlan } from "./build-production-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

test("official and RAT closure use one deterministic build plan", () => {
  const rat = productionClosurePlan();
  const official = productionClosurePlan({ preparePackage: true });

  assert.deepEqual(official.slice(0, rat.length), rat);
  assert.equal(rat.at(-1).name, "runtime consumer smoke");
  assert.equal(official.at(-1).name, "prepare Tauri packaged runtime");
  const bakeIndex = rat.findIndex(
    (step) => step.name === "bake verdict public key",
  );
  assert.notEqual(bakeIndex, -1);
  assert.ok(
    bakeIndex < rat.findIndex((step) => step.name === "runtime consumer smoke"),
    "真实 verdict 冒烟前必须先把验签公钥烘焙进闭包",
  );
  assert.equal(
    rat.filter((step) => step.name === "Next adapter production build").length,
    1,
  );
  assert.equal(
    rat.some((step) => step.args.includes("build-sidecar.mjs")),
    false,
  );
});

test("production closure pins target and adapter evidence", () => {
  const plan = productionClosurePlan({ preparePackage: true });
  const next = plan.find(
    (step) => step.name === "Next adapter production build",
  );
  const materialize = plan.find(
    (step) => step.name === "materialize traced closure",
  );

  assert.equal(next.env.CREATOROS_DESKTOP, "1");
  assert.match(next.env.NEXT_ADAPTER_PATH, /next-output-adapter\.mjs$/);
  assert.match(next.env.CREATOROS_NEXT_OUTPUT_REPORT, /next-adapter-outputs\.json$/);
  assert.deepEqual(materialize.env, {
    CREATOROS_TARGET_PLATFORM: "win32",
    CREATOROS_TARGET_ARCH: "x64",
  });
});

test("runtime smoke uses a real short-lived verdict instead of the removed bypass", () => {
  const source = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");
  assert.match(source, /createBuildSmokeVerdictToken/);
  assert.match(source, /CREATOROS_SIDECAR_VERDICT_TOKEN/);
  assert.doesNotMatch(source, /CREATOROS_SMOKE_BYPASS_VERDICT:\s*["']1["']/);
  assert.match(source, /delete sidecarEnv\.CREATOROS_VERDICT_SIGNING_KEY_B64/);
  assert.match(source, /layerSummary\.runtime\.files > 3_500/);
  assert.match(source, /layerSummary\.core\.files > 1_500/);
  assert.doesNotMatch(source, /layerSummary\.core\.files > 1_000/);
});

test("official Windows release and RAT are wired to the same guarded closure", () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/desktop-release.yml"),
    "utf8",
  );
  const packageSource = readFileSync(
    resolve(REPO_ROOT, "frontend/scripts/desktop/package.mjs"),
    "utf8",
  );

  assert.match(
    workflow,
    /build-production-closure\.mjs --prepare-package/,
  );
  assert.ok(
    workflow.match(/build-production-closure\.mjs/g)?.length >= 2,
    "正式发布与候选 RAT 都必须调用公共入口",
  );
  assert.match(workflow, /setupBytes[\s\S]*600000000/);
  assert.match(workflow, /runtimeFiles[\s\S]*3500/);
  assert.match(workflow, /firstLaunchMilliseconds/);
  assert.match(workflow, /Windows 首次启动超过 45 秒/);
  assert.ok(
    workflow.indexOf("Windows 主动卸载清理冒烟") <
      workflow.indexOf("上传已通过 T-675 真安装与首启验证的 Windows 安装包"),
    "Windows 正式安装包必须在卸载 Gate 通过后上传",
  );
  assert.match(packageSource, /CREATOROS_PRODUCTION_CLOSURE/);
  assert.match(packageSource, /跳过依赖旧 node_modules 布局的 V8 字节码步骤/);
});

test("closure and packaged runtime share one verdict-key baker", () => {
  const baker = readFileSync(resolve(HERE, "bake-verdict-public-key.mjs"), "utf8");
  const packagedRuntime = readFileSync(
    resolve(HERE, "prepare-packaged-runtime.mjs"),
    "utf8",
  );

  assert.match(baker, /assertVerdictPublicKey/);
  assert.match(baker, /verdict-verify-key\.json/);
  assert.match(packagedRuntime, /bakeVerdictPublicKey/);
  assert.doesNotMatch(packagedRuntime, /writeFileSync\([\s\S]*publicKeyB64/);
});
