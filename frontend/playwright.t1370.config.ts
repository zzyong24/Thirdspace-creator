import {defineConfig} from '@playwright/test';
import base from './playwright.t1355.config';

// 复用现有私有PG/合成宿主及真实Next入口；不复制harness、不接触用户库。
export default defineConfig({...base,
 testMatch:'t1370-platform-capability-inline-binding.spec.ts',
 projects:[{name:'t1370-normal',use:{viewport:{width:1366,height:900}}},{name:'t1370-minimum',use:{viewport:{width:1024,height:680}}}],
 outputDir:'../docs/verification/t1370/private/e2e-artifacts',
 reporter:[['list'],['json',{outputFile:'../docs/verification/t1370/private/e2e-results.json'}]],
 webServer:(Array.isArray(base.webServer)?base.webServer:[base.webServer!]).map(server=>({...server,timeout:600_000})),
});
