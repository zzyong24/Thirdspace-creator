import {spawn} from 'node:child_process';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=resolve(root,'docs/verification/t1022/logs');
await mkdir(dir,{recursive:true});
// PG门不可因缺配置而skip；只接受本任务显式隔离服务器，suite各自创建临时库。
for(const key of ['CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL']){
 const value=process.env[key];if(!value)throw Error('缺少隔离PG配置：'+key);
 const url=new URL(value);if(url.hostname!=='127.0.0.1'||url.port!=='55422')throw Error('只允许本任务55422隔离PG服务器');
}
async function files(base){const out=[];for(const item of await readdir(resolve(root,base),{withFileTypes:true})){const path=base+'/'+item.name;if(item.isDirectory())out.push(...await files(path));else if(/\.test\.tsx?$/.test(item.name))out.push(path);}return out;}
const back=(await files('backend/src')).filter(p=> /(?:account-group|account-binding|group-|startup-workspace|startup-collection|scheduled-private|execution-authority|account-membership|application\/workspace\/startup|application\/scheduling\/controls|automation-driver|scheduled-collection-scheduler|persistent-task.service|execution-lease.service|execution-call-ledger.service)/.test(p));
const pg=(await files('backend/src/integration')).filter(p=>p.includes('.postgres.integration.test.ts'));
const frontend=(await files('frontend/src')).filter(p=>/(?:account-switcher|account-group-manager|group-|report-native-comparisons|traffic-sources-panel|prediction-comparison|workspace-error-copy|account-change-events|http-transport)/.test(p));
const suites=[
 ['contract','pnpm',['-C','contract','exec','vitest','run']],
 ['backend-group','pnpm',['-C','backend','exec','vitest','run','--maxWorkers=4',...new Set([...back,...pg]).values()].map(p=>p.startsWith('backend/')?relative('backend',p):p)],
 ['frontend-group','pnpm',['-C','frontend','exec','vitest','run',...frontend.map(p=>relative('frontend',p))]],
 ['mcp-group','pnpm',['-C','mcp-server','exec','vitest','run','tests/group-context.test.ts','tests/group-mcp-context.test.ts','tests/dispatch.test.ts','tests/cli.test.ts']],
 ['backend-production-types','pnpm',['-C','backend','exec','tsc','--noEmit','-p','../docs/verification/t1022/backend-production.tsconfig.json']],
 ['frontend-types','pnpm',['-C','frontend','exec','tsc','--noEmit']],
 ['diff-check','git',['diff','--check']],
];
const selected=process.argv.find(arg=>arg.startsWith("--only="))?.slice(7).split(",");
const results=[];
for(const [key,command,args] of suites){
 if(selected&&!selected.includes(key))continue;
 console.log('验证：'+key);const started=new Date().toISOString();let output='';
 const exit_code=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve(code??1));});
 await writeFile(resolve(dir,'gate-'+key+'.log'),output);results.push({key,command:[command,...args],started,exit_code,log:'docs/verification/t1022/logs/gate-'+key+'.log'});
 console.log(key+'：exit '+exit_code);if(exit_code)console.log(output.slice(-2500));
}
await writeFile(resolve(dir,'gate-results.json'),JSON.stringify({observed_at:new Date().toISOString(),scope:'当前任务代码和隔离服务测试；真实平台、安装版和formal receipt另验，不由此替代',results},null,2)+'\n');
process.exitCode=results.some(r=>r.exit_code!==0)?1:0;
