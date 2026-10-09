// 供root执行：仅/tmp影子Next服务；不连接Ego，不执行浏览器或真实扫码。
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,closeSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeWitness} from './normalize-witness.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(process.env.T1110_REPO_ROOT??process.cwd());
const witnessPath=process.env.T1110_REPORT_WITNESS;
if(!witnessPath||!existsSync(witnessPath))throw Error('须显式提供root已脱敏实报表投影，不读取原私人文件');
const witness=normalizeWitness(witnessPath,{observedAt:process.env.T1110_REPORT_OBSERVED_AT});
const shadowFile=execFileSync(process.execPath,[join(here,'prepare-next.mjs')],{cwd:repo,env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,T1110_REPO_ROOT:repo},encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024}).trim();
const shadow=JSON.parse(readFileSync(shadowFile,'utf8'));
const port=Number(process.env.T1110_TEST_PORT??31411);if(!Number.isInteger(port)||port<1024||port>65535||port===31410)throw Error('必须使用与root 31410真人隔离产品服务不同的测试端口');
// 原有loopback guard接受IPv6；使用::1隔开root 127.0.0.1的选择cookie与测试localStorage，不改安全守卫。
const origin=`http://[::1]:${port}`,output=resolve(process.env.T1110_JOURNEY_OUTPUT??join(shadow.root,'evidence'));
mkdirSync(join(output,'screenshots'),{recursive:true});
const normalizedPath=join(shadow.root,'representative-report-pack.json');writeFileSync(normalizedPath,JSON.stringify(witness,null,2)+'\n');
const logPath=join(shadow.root,'next.log'),logFd=openSync(logPath,'a');
const env={PATH:process.env.PATH??'',LANG:'zh_CN.UTF-8',TMPDIR:shadow.root,NO_PROXY:'::1,[::1],localhost,127.0.0.1',no_proxy:'::1,[::1],localhost,127.0.0.1',DATABASE_URL:'',PGLITE_DATA_DIR:join(shadow.root,'pglite'),CREATOROS_DOUYIN_AUTH_DIR:join(shadow.root,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:join(shadow.root,'auth-web'),CREATOROS_RUNTIME_ROOT:join(shadow.root,'runtime'),CREATOROS_MASTER_KEY_FILE:join(shadow.root,'unused-test-master-key'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1',CREATOROS_T1110_PAGE_FIXTURE:'isolated-shadow-v1',CREATOROS_T1110_REPORT_WITNESS:normalizedPath,CREATOROS_T1110_FIXTURE_CONTROL:shadow.control,CREATOROS_T1110_FIXTURE_LOG:shadow.fixtureLog};
const child=spawn('pnpm',['--dir',join(shadow.shadow,'frontend'),'dev','--webpack','--hostname','::1','--port',String(port)],{cwd:shadow.shadow,env,stdio:['ignore',logFd,logFd],detached:true});
let spawnError;child.once('error',e=>{spawnError=e;});
try {
  const end=Date.now()+480000;let ready=false;
  while(Date.now()<end){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error(`隔离Next启动退出${child.exitCode}，见${logPath}`);try{const response=await fetch(origin,{signal:AbortSignal.timeout(120000)});if(response.ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,1000));}
  if(!ready)throw Error('隔离Next未在完整启动预算内就绪');
  const state={schema:'t1110-ego-server/v1',...shadow,shadowManifest:shadowFile,origin,output,normalizedWitness:normalizedPath,serverPid:child.pid,serverLog:logPath,startedAt:new Date().toISOString(),dataRoot:env.PGLITE_DATA_DIR,identityProof:false,execution:'fixture-only-no-platform-proof'};
  const file=join(shadow.root,'ego-server-state.json');writeFileSync(file,JSON.stringify(state,null,2)+'\n');closeSync(logFd);child.unref();process.stdout.write(`${file}\n`);
} catch(error) {try{process.kill(-child.pid,'SIGTERM');}catch{}closeSync(logFd);throw error;}
