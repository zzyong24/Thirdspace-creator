import {defineConfig} from '@playwright/test';
import {mkdtempSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter,dirname,join} from 'node:path';

process.env.NO_PROXY='127.0.0.1,localhost';process.env.no_proxy='127.0.0.1,localhost';
const privateRoot=realpathSync(process.env.T1362_FIXTURE_ROOT??mkdtempSync(join(tmpdir(),'creatoros-t1362-')));process.env.T1362_FIXTURE_ROOT=privateRoot;
function port(name:string,fallback:number){const value=Number(process.env[name]??fallback);if(!Number.isInteger(value)||value<1024||value>65535)throw Error(`${name}端口无效`);return value;}
const pgPort=port('T1362_PG_PORT',41368),hostPort=port('T1362_HOST_PORT',41369),appPort=port('T1362_APP_PORT',41367);
if(new Set([pgPort,hostPort,appPort]).size!==3)throw Error('隔离应用/宿主/数据库端口必须不同');
process.env.T1362_PG_PORT=String(pgPort);process.env.T1362_HOST_PORT=String(hostPort);process.env.T1362_APP_PORT=String(appPort);
const privateEnv={
 PATH:[dirname(process.execPath),process.env.PATH].filter(Boolean).join(delimiter),NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',
 T1355_FIXTURE_ROOT:privateRoot,T1355_PG_PORT:String(pgPort),T1355_HOST_PORT:String(hostPort),
 DATABASE_URL:`postgresql://t1355_fixture@127.0.0.1:${pgPort}/creatoros_t1355`,
 PGLITE_DATA_DIR:join(privateRoot,'fallback-pglite'),CREATOROS_MEDIA_ROOT:join(privateRoot,'media'),CREATOROS_DATABASE_BACKUP_DIR:join(privateRoot,'database-backups'),
 CREATOROS_DOUYIN_AUTH_DIR:join(privateRoot,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:join(privateRoot,'auth-web'),
 CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1',
};
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'t1362-collected-work-entry.spec.ts',workers:1,retries:0,timeout:7_200_000,expect:{timeout:120_000},
 projects:[{name:'t1362-normal',use:{viewport:{width:1366,height:900}}},{name:'t1362-minimum',use:{viewport:{width:1024,height:680}}}],
 outputDir:'../docs/verification/t1362/e2e-artifacts',reporter:[['list'],['json',{outputFile:'../docs/verification/t1362/e2e-results.json'}]],
 use:{browserName:'chromium',baseURL:`http://127.0.0.1:${appPort}`,actionTimeout:120_000,navigationTimeout:120_000,trace:'on',screenshot:'only-on-failure',locale:'zh-CN',timezoneId:'Asia/Shanghai',colorScheme:'light',contextOptions:{reducedMotion:'reduce',serviceWorkers:'block'}},
 webServer:[
  {command:'pnpm --dir ../backend exec tsx ../docs/verification/t1355/harness/binding-fixture-server.mts',url:`http://127.0.0.1:${hostPort}/health`,env:privateEnv,timeout:300_000,reuseExistingServer:false,stdout:'pipe',stderr:'pipe',gracefulShutdown:{signal:'SIGTERM',timeout:120_000}},
  {command:`pnpm --dir ../backend exec tsx ../docs/verification/t1356/harness/seed-collected-dashboard.mts && pnpm --dir ../backend exec tsx ../docs/verification/t1362/harness/seed-work-entry.mts && pnpm dev --hostname 127.0.0.1 --port ${appPort}`,url:`http://127.0.0.1:${appPort}/api/v1/auth/me`,env:privateEnv,timeout:600_000,reuseExistingServer:false,stdout:'pipe',stderr:'pipe',gracefulShutdown:{signal:'SIGTERM',timeout:120_000}},
 ],
});
