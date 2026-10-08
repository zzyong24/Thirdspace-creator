import assert from "node:assert/strict";
import test from "node:test";
import { productionClosurePlan } from "./build-production-closure.mjs";
import { frontendBuildSteps } from "../../frontend/scripts/desktop/build-frontend.mjs";

test("出包计划不运行额外冒烟和品牌验收，但保留编译、资源组装和真实公钥", () => {
  const steps = productionClosurePlan({
    preparePackage: true,
    buildOnly: true,
    packageBrandInputPath: "brand.json",
  });
  assert.equal(steps.some(step => /smoke|verify packaged/.test(step.name)), false);
  assert.equal(steps[0].env.CREATOROS_PACKAGE_BUILD_ONLY, "1");
  assert.equal(steps[0].buildMemory, false);
  assert.ok(steps.some(step => step.name === "bake verdict public key"));
  assert.ok(steps.some(step => step.name === "assemble five runtime layers"));
  assert.equal(steps.at(-1).name, "prepare Tauri packaged runtime");
});

test("单独验证入口仍保留真实冒烟，不伪报出包已经验收", () => {
  const steps = productionClosurePlan();
  assert.equal(steps.at(-1).name, "runtime consumer smoke");
  assert.notEqual(steps[0].env.CREATOROS_PACKAGE_BUILD_ONLY, "1");
});

test("Windows 路径不影响 Next build 参数，Worker 编译先于 Next", () => {
  for (const root of ["C:\\构建 中文目录\\frontend", "/tmp/构建 中文目录/frontend"]) {
    const steps = frontendBuildSteps(root);
    assert.match(steps[0].entry, /ai-worker/);
    assert.deepEqual(steps[0].args, []);
    assert.deepEqual(steps[1].args, ["build"]);
  }
});
