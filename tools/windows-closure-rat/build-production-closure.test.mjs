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

test("packaged runtime stages CreatorOS CLI before copying the closure into Tauri", () => {
  const source = readFileSync(
    resolve(HERE, "prepare-packaged-runtime.mjs"),
    "utf8",
  );
  const stageIndex = source.indexOf("stageCreatorOsCliRuntime({");
  const copyIndex = source.indexOf("cpSync(closureRoot, sidecarRoot");

  assert.notEqual(stageIndex, -1, "Windows 精简闭包必须显式生成随包 CLI runtime");
  assert.ok(stageIndex < copyIndex, "CLI runtime 必须先进入 closure，再整体复制给 Tauri");
  assert.match(source, /runtimeRoot:\s*closureRoot/);
  assert.match(source, /nodeExecutablePath:\s*runtimeNode/);
  assert.match(source, /targetPlatform:\s*["']win32["']/);
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

test("channel closure forwards one trusted package brand input into Next and verifies final closure", () => {
  const brandInputPath = resolve(REPO_ROOT, "frontend/src-tauri/target/package-flavors/test/windows-x86_64/package-brand-build-input.json");
  const brandEnv = {
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: "测试品牌",
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL: "data:image/x-icon;base64,AAECAw==",
  };
  const plan = productionClosurePlan({
    preparePackage: true,
    packageBrandInputPath: brandInputPath,
    packageBrandBuildEnv: brandEnv,
  });
  const next = plan.find((step) => step.name === "Next adapter production build");
  assert.equal(next.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME, "测试品牌");
  assert.equal(next.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL, brandEnv.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL);
  const verify = plan.find((step) => step.name === "verify packaged WebView brand");
  assert.ok(verify);
  assert.ok(verify.args.includes(brandInputPath));
  assert.ok(verify.args.includes(resolve(HERE, "out", "closure")));
  const runtimeSmoke = plan.find((step) => step.name === "runtime consumer smoke");
  assert.equal(
    runtimeSmoke.env.CREATOROS_EXPECTED_PACKAGE_BRAND_NAME,
    "测试品牌",
    "渠道运行时自检必须消费同一受信品牌名，不能写死 CreatorOS",
  );
});

test("official runtime smoke keeps the official brand default", () => {
  const runtimeSmoke = productionClosurePlan().find(
    (step) => step.name === "runtime consumer smoke",
  );
  assert.equal(
    runtimeSmoke.env.CREATOROS_EXPECTED_PACKAGE_BRAND_NAME,
    "CreatorOS",
  );
});

test("runtime smoke uses a real short-lived verdict instead of the removed bypass", () => {
  const source = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");
  assert.match(source, /createBuildSmokeVerdictToken/);
  assert.match(source, /CREATOROS_SIDECAR_VERDICT_TOKEN/);
  assert.doesNotMatch(source, /CREATOROS_SMOKE_BYPASS_VERDICT:\s*["']1["']/);
  assert.match(source, /delete sidecarEnv\.CREATOROS_VERDICT_SIGNING_KEY_B64/);
  assert.match(source, /reportCapacity/);
  assert.match(source, /layerSummary\.nodeModulesDirectories !== 0/);
  assert.match(source, /status: "passed"/);
  assert.doesNotMatch(source, /layerSummary\.(?:runtime|core)\.files > /);
  assert.doesNotMatch(source, /layerSummary\.core\.files > 1_000/);
  assert.match(source, /HYPERFRAMES_FFMPEG_PATH:\s*ffmpegPath/);
  assert.match(source, /HYPERFRAMES_FFPROBE_PATH:\s*ffprobePath/);
  assert.match(source, /CREATOROS_EXPECTED_PACKAGE_BRAND_NAME/);
  assert.doesNotMatch(
    source,
    /mainHtml\.includes\(["']<title>CreatorOS<\/title>["']\)/,
  );
});

test("T-845 production HyperFrames spawn and Windows RAT preload the same layered resolver", () => {
  const executor = readFileSync(
    resolve(
      REPO_ROOT,
      "backend/src/modules/execution/video-render/executor.ts",
    ),
    "utf8",
  );
  const smoke = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");

  for (const source of [executor, smoke]) {
    assert.match(source, /creatoros-module-resolver\.cjs/);
    assert.match(source, /["']--require["']/);
  }
  assert.match(executor, /buildHyperframesProcessArgs/);
  assert.match(executor, /CREATOROS_RUNTIME_ROOT/);
  assert.doesNotMatch(
    executor,
    /NODE_OPTIONS\s*:/,
    "正式渲染必须用 argv 预加载解析器，不能恢复可注入任意代码的 NODE_OPTIONS",
  );
  assert.match(smoke, /\["--require", moduleResolver, hyperframesCli/);
});

test("T-886 Windows closure smoke loads Xenova from a real worker consumer", () => {
  const workerSource = readFileSync(
    resolve(
      REPO_ROOT,
      "ai-worker/src/runtime/multimodal-whisper-local.ts",
    ),
    "utf8",
  );
  const smoke = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");

  assert.match(workerSource, /workerData\.moduleResolverPath/);
  assert.match(workerSource, /CREATOROS_RUNTIME_ROOT/);
  assert.match(workerSource, /req\(workerData\.moduleResolverPath\)/);
  assert.match(smoke, /new Worker\(/);
  assert.match(
    smoke,
    /moduleResolverPath:\s*\$\{JSON\.stringify\(moduleResolver\)\}/,
  );
  assert.match(smoke, /whisper-worker-module-load/);
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
  assert.match(workflow, /runtime-diagnostics\.mjs --setup/);
  assert.match(workflow, /runtime-diagnostics\.mjs --runtime-files/);
  assert.doesNotMatch(workflow, /\$runtimeFiles\.Count -gt 3500/);
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
  assert.match(packagedRuntime, /cliBundleBytes/);
  assert.match(packagedRuntime, /cliNodeBytes/);
  assert.doesNotMatch(packagedRuntime, /writeFileSync\([\s\S]*publicKeyB64/);
});

test("materializer physically excludes traced engineering inputs without changing budgets", () => {
  const materializer = readFileSync(
    resolve(HERE, "materialize-next-closure.mjs"),
    "utf8",
  );

  assert.match(materializer, /import \{ isNonRuntimeTracedAsset \}/);
  assert.match(materializer, /isNonRuntimeTracedAsset\(destination\)/);
  assert.match(materializer, /isNonRuntimeTracedAsset\(source\)/);
  assert.match(materializer, /excludedNonRuntimeAssets/);
  assert.doesNotMatch(materializer, /runtime\.files\s*>/);
  assert.doesNotMatch(materializer, /core\.files\s*>/);
});

test("Windows 分层入口必须装配 Worker 并由公共 smoke 真握手", () => {
  const assembly=readFileSync(resolve(HERE,"assemble-runtime-layers.mjs"),"utf8");
  const smoke=readFileSync(resolve(HERE,"runtime-smoke.mjs"),"utf8");
  assert.match(assembly,/stageLayeredWorkers\(\{repoRoot, runtimeRoot: closureRoot\}\)/);
  assert.match(smoke,/assertExecutionWorkerRuntime\(runtimeRoot\)/);
  assert.match(smoke,/await smokeWorker\(/);
  assert.match(readFileSync(resolve(HERE,"worker-smoke.mjs"),"utf8"),/execArgv:\[\]/);
  assert.match(smoke,/worker-ready:/);
});
