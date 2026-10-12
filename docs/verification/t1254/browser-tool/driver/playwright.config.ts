import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
const run=process.env.CREATOROS_T1246_RUN_DIR,testRoot=process.env.CREATOROS_T1246_TEST_ROOT;
if(!run||!testRoot||process.env.CREATOROS_T1246_PROFILE!=='doocs'||!process.env.CREATOROS_T1254_BROWSER_EXECUTABLE)throw Error('EXACT_OWNED_DOOCS_RUN_REQUIRED');
export default defineConfig({testDir:testRoot,testMatch:'doocs-public.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:72000000,globalTimeout:0,expect:{timeout:120000},outputDir:resolve(run,'artifacts'),reporter:[['line'],['json',{outputFile:resolve(run,'results.json')}]],use:{baseURL:`http://127.0.0.1:${process.env.CREATOROS_TEST_PORT}`,browserName:'chromium',launchOptions:{executablePath:process.env.CREATOROS_T1254_BROWSER_EXECUTABLE},actionTimeout:120000,navigationTimeout:120000,trace:'on',screenshot:'on',video:'off'},projects:[{name:'doocs'}]});
