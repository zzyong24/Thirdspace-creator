import {defineConfig} from '../../../frontend/node_modules/@playwright/test/index.mjs';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname,delimiter} from 'node:path';
if(!process.env.T1347_FIXTURE_ROOT)throw Error('先在候选源码运行seed-native-fixture.mts并明确T1347_FIXTURE_ROOT');
const root=resolve(process.env.T1347_FIXTURE_ROOT),fixture=JSON.parse(readFileSync(join(root,'T1347_FIXTURE.json'),'utf8'));
const port=Number(process.env.T1347_UI_PORT??41349);
export default defineConfig({
 testDir:import.meta.dirname,testMatch:'ui-public-probe.spec.mts',workers:1,retries:0,timeout:7_200_000,expect:{timeout:120_000},
 outputDir:join(import.meta.dirname,'formal-ui-artifacts'),reporter:[['list'],['json',{outputFile:join(import.meta.dirname,'formal-ui-results.json')}]],
 use:{baseURL:`http://127.0.0.1:${port}`,browserName:'chromium',channel:process.env.CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL,actionTimeout:120_000,navigationTimeout:120_000,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',trace:'on',screenshot:'only-on-failure'},
 webServer:{command:`pnpm dev --hostname 127.0.0.1 --port ${port}`,cwd:resolve(import.meta.dirname,'../../../frontend'),url:`http://127.0.0.1:${port}`,timeout:300_000,reuseExistingServer:false,
 env:{...process.env,PATH:[dirname(process.execPath),process.env.PATH].filter(Boolean).join(delimiter),NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',DATABASE_URL:'',PGLITE_DATA_DIR:fixture.dataDir,CREATOROS_MEDIA_ROOT:join(root,'media'),CREATOROS_DOUYIN_AUTH_DIR:join(root,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:join(root,'auth-web'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1',NEXT_TELEMETRY_DISABLED:'1'}}
});
