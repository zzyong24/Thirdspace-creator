import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// 不允许缺PG配置时由skip产生伪绿；仅运行随机临时数据库，不读取用户库。
for(const key of ['CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL']){
 const value=process.env[key];if(!value)throw Error('归档执行门需要显式隔离PG配置：'+key);
 const url=new URL(value);if(url.hostname!=='127.0.0.1'||url.port!=='55422')throw Error('归档执行门只允许本任务55422隔离服务器');
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const run=spawnSync('pnpm',['-C','backend','exec','vitest','run','src/integration/startup-group-collectors.postgres.integration.test.ts','src/modules/execution/execution-lease.service.test.ts','src/modules/execution/execution-call-ledger.service.test.ts','--maxWorkers=2'],{cwd:root,env:process.env,stdio:'inherit'});
if(run.error)throw run.error;process.exitCode=run.status??1;
