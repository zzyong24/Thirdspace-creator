import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';
const originalStateFile='/tmp/creatoros-t1110-fullpage.BmfWDn/dom-correction-server-state-20261010.json';
const old=JSON.parse(fs.readFileSync(originalStateFile,'utf8'));const proof=JSON.parse(fs.readFileSync('/tmp/creatoros-t1110-fullpage.BmfWDn/identity-research-bind-preflight-corrected-20261010.json','utf8'));
const before=JSON.parse(fs.readFileSync('/tmp/creatoros-t1110-fullpage.BmfWDn/identity-research-preflight-read-20261010.json','utf8'));
if(old.schema!=='t1110-native-product-service/v1'||old.dataRoot!=='/tmp/creatoros-t1110-fullpage.BmfWDn'||old.pid!==26211||old.origin!=='http://127.0.0.1:31410')throw Error('原宿主绑定不符');
if(proof.some(r=>r.http!==200)||proof[0].body.data.status!=='failed'||proof[1].body.data.status!=='succeeded')throw Error('原绑定预飞不符');
if(before.find(r=>r.id==='platforms.collections.get')?.body.data.status!=='failed'||before.find(r=>r.id==='platforms.reports.list')?.body.data.items.length!==0)throw Error('原collection预飞不符');
const ps=execFileSync('ps',['-p',String(old.pid),'-o','pgid=,command='],{encoding:'utf8',timeout:120000}).trim();
if(!ps.startsWith(String(old.pid))||!ps.includes(old.repo+'/frontend dev --hostname 127.0.0.1 --port 31410')||!ps.includes('pnpm'))throw Error('原PID/PGID/命令归属不符');
const startedAt=new Date().toISOString();fs.writeFileSync('/tmp/t1110-identity-exp2-start.json',JSON.stringify({startedAt,status:'preparing',experiment:'EXP-2',originalPid:old.pid,scope:'one native identity-only intent; no full collection/QR/Page'},null,2)+'\n');
process.kill(-old.pid,'SIGTERM');
const closedBy=Date.now()+120000;let members;
while(Date.now()<closedBy){members=execFileSync('ps',['-axo','pid=,pgid=,command='],{encoding:'utf8',timeout:120000}).split('\n').filter(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+/);return m&&Number(m[2])===old.pid;});if(members.length===0)break;await new Promise(r=>setTimeout(r,500));}
if(members?.length)throw Error('原宿主未确认停止，拒绝开第二PG实例');
const shadow='/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1110-shadow-caV4uV/source';
const root=old.dataRoot,origin='http://127.0.0.1:31412';
const logPath=path.join(root,'identity-exp2-next-private-20261010.log'),eventLog=path.join(root,'identity-exp2-fixed-events-20261010.ndjson');
const logFd=fs.openSync(logPath,'a',0o600);
const env={PATH:process.env.PATH??'',LANG:'zh_CN.UTF-8',TMPDIR:root,NO_PROXY:'::1,[::1],localhost,127.0.0.1',no_proxy:'::1,[::1],localhost,127.0.0.1',DATABASE_URL:'',PGLITE_DATA_DIR:path.join(root,'pglite'),CREATOROS_DOUYIN_AUTH_DIR:path.join(root,'douyin'),CREATOROS_WEB_AUTH_DIR:path.join(root,'web'),CREATOROS_RUNTIME_ROOT:path.join(root,'runtime'),CREATOROS_MASTER_KEY_FILE:path.join(root,'unused-test-master-key'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DEV_MODE:'1',T1110_IDENTITY_RESEARCH_LOG:eventLog};
const child=spawn('pnpm',['--dir',path.join(shadow,'frontend'),'dev','--hostname','127.0.0.1','--port','31412'],{cwd:shadow,env,stdio:['ignore',logFd,logFd],detached:true});let spawnError;child.once('error',e=>{spawnError=e;});
const state={schema:'t1110-identity-only-research-host/v1',repo:old.repo,shadow,dataRoot:root,origin,pid:child.pid,log:logPath,eventLog,startedAt,originalHostStopped:true,schedulerDisabled:true,backgroundDriversDisabled:true,candidateGreen:false};fs.writeFileSync('/tmp/t1110-identity-exp2-server-state.json',JSON.stringify(state,null,2)+'\n');
try{
 const end=Date.now()+480000;let ready=false;
 while(Date.now()<end){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('研究宿主退出');try{const r=await fetch(origin,{signal:AbortSignal.timeout(120000)});if(r.ok){ready=true;break;}if(r.status>=500)throw Object.assign(Error('研究宿主就绪HTTP500'),{fatalStartup:true});}catch(e){if(e.fatalStartup)throw e;}await new Promise(done=>setTimeout(done,1000));}
 if(!ready)throw Error('研究宿主未在480000启动预算内就绪');
 state.readyAt=new Date().toISOString();fs.writeFileSync('/tmp/t1110-identity-exp2-server-state.json',JSON.stringify(state,null,2)+'\n');child.unref();fs.closeSync(logFd);console.log(JSON.stringify({ready:true,pid:child.pid,origin,originalHostStopped:true,experimentStartedAt:startedAt,identityIntentNotYetSubmitted:true}));
}catch(e){try{process.kill(-child.pid,'SIGTERM');}catch{}fs.closeSync(logFd);throw e;}
