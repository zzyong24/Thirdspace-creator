import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertOwnedPostgresUrl,readOwnedPostgresMarker} from '../../../backend/src/test-fixtures/owned-postgres.ts';
// 不允许缺PG配置时由skip产生伪绿；仅运行随机临时数据库，不读取用户库。
export function validateArchiveGuardContext(){
 const urls=['CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL'].map(key=>{
  const value=process.env[key];if(!value)throw Error('归档执行门需要显式隔离PG配置：'+key);
  return assertOwnedPostgresUrl(value);
 });
 const marker=readOwnedPostgresMarker();
 if(urls[0].href!==urls[1].href||urls.some(url=>url.pathname!==`/${marker.managementDatabase}`))throw Error('归档执行门两URL必须是同一本轮管理库');
 return {port:marker.port,nonce:marker.nonce};
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const archiveGuardArgs=Object.freeze(['-C','backend','exec','vitest','run','src/integration/startup-group-collectors.postgres.integration.test.ts','src/modules/execution/execution-lease.service.test.ts','src/modules/execution/execution-call-ledger.service.test.ts','--maxWorkers=2']);
export function runArchiveGuard(){
 validateArchiveGuardContext();
 const run=spawnSync('pnpm',archiveGuardArgs,{cwd:root,env:process.env,stdio:'inherit'});
 if(run.error)throw run.error;return run.status??1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runArchiveGuard();
