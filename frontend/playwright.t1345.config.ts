import {defineConfig} from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
 ...base,testDir:"./tests/e2e",testMatch:"t1345-account-binding-guidance.spec.ts",
 projects:[{name:"t1345",use:{browserName:"chromium"}}],workers:1,retries:0,
 timeout:7_200_000,expect:{timeout:120_000},
 outputDir:"../docs/verification/t1345/e2e-artifacts",
 reporter:[["list"],["json",{outputFile:"../docs/verification/t1345/e2e-results.json"}]],
 use:{...base.use,actionTimeout:120_000,navigationTimeout:120_000,trace:"on"},
});
