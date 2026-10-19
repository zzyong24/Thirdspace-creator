import {defineConfig} from "@playwright/test";
import base from "./playwright.config";

// 沿主配置的全新私有PGlite/media/auth和网络隔离，不连接安装版数据库。
export default defineConfig({
  ...base,
  testDir:"./tests/e2e",
  testMatch:"t1346-account-group-switch.spec.ts",
  projects:[{name:"t1346",use:{browserName:"chromium"}}],
  timeout:600_000,
  expect:{timeout:120_000},
  retries:0,
  workers:1,
  reporter:[["list"],["json",{outputFile:"../docs/verification/t1346/e2e-results.json"}]],
  outputDir:"../docs/verification/t1346/e2e-artifacts",
  use:{...base.use,actionTimeout:120_000,navigationTimeout:120_000,trace:"on"},
});
