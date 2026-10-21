import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

// 导入与 --list 只声明配置；服务、副本、隔离与清理由外部 runner 持有。
const runDir=process.env.T1382_JOURNEY_RUN_DIR;
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'t1382-unified-intake-journeys.spec.ts',workers:1,retries:0,fullyParallel:false,
 timeout:900_000,globalTimeout:21_600_000,expect:{timeout:120_000},
 projects:[{name:'t1382-normal',use:{viewport:{width:1366,height:900}}},{name:'t1382-minimum',use:{viewport:{width:1024,height:680}}}],
 outputDir:runDir?resolve(runDir,'playwright-artifacts'):resolve('../docs/verification/t1382/journey/not-run'),
 reporter:runDir?[['list'],['json',{outputFile:resolve(runDir,'playwright-results.json')}]]:[['list']],
 use:{browserName:'chromium',baseURL:process.env.T1382_JOURNEY_BASE_URL??'http://127.0.0.1:3441',
 actionTimeout:120_000,navigationTimeout:120_000,trace:'retain-on-failure',screenshot:'only-on-failure',
 locale:'zh-CN',timezoneId:'Asia/Shanghai',colorScheme:'light',contextOptions:{reducedMotion:'reduce',serviceWorkers:'block'}},
});
