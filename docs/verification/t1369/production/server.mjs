import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import net from 'node:net';
import {createBuildSmokeVerdictToken} from '../../../../frontend/scripts/desktop/verdict-key-material.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..'),out=resolve(process.env.T1369_PRODUCTION_OUTPUT),root=realpathSync(process.env.T1356_FIXTURE_ROOT),port=Number(process.env.T1356_APP_PORT),hostPort=Number(process.env.T1356_HOST_PORT),pgPort=Number(process.env.T1356_PG_PORT),policy=process.env.T1369_POLICY_FILE;
const globalDeadline=performance.now()+Math.max(0,Number(process.env.T1369_GLOBAL_DEADLINE_UNIX_MS)-Date.now());
const events=[],cleanup=[],children=new Map();let originalError,baseline,ready,owner,cleaning,finalStateAttempted=false;
const save=()=>writeFileSync(join(out,'SERVER_PHASE_SAFE.json'),JSON.stringify({events,cleanup,originalError:originalError?String(originalError):null,children:[...children].map(([label,row])=>({label,pid:row.process.pid,sandboxed:row.sandboxed,exitCode:row.process.exitCode,signalCode:row.process.signalCode})),fixtureOutsideOsSandbox:true,productBuildNextBrowserInsideOriginalSandbox:true},null,2)+'\n',{mode:0o600});
function event(phase,details={}){events.push({phase,at:Date.now(),...details});save();console.log('T1369_PHASE '+phase);}
async function bounded(run,ms,label){if(ms<=0)throw Error(label+'_BEFORE_START');let timer;try{return await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}}
function launch(label,args,sandboxed,env=process.env){
 const command=sandboxed?'/usr/bin/sandbox-exec':'pnpm',argv=sandboxed?['-f',policy,'pnpm',...args]:args;
 const child=spawn(command,argv,{cwd:repo,env,stdio:['ignore','pipe','pipe'],detached:true});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 const exited=new Promise(resolve=>{child.once('error',error=>resolve({error:String(error)}));child.once('exit',(code,signal)=>resolve({code,signal}));});children.set(label,{process:child,exited,sandboxed});save();return children.get(label);
}
async function finish(label,args,sandboxed,deadline){const row=launch(label,args,sandboxed);const result=await bounded(()=>row.exited,deadline-performance.now(),label.toUpperCase()+'_DEADLINE');if(result.code!==0)throw Error(label.toUpperCase()+'_EXIT_'+JSON.stringify(result));return result;}
async function tcp(target,deadline){await bounded(async()=>{for(;;){try{await new Promise((resolve,reject)=>{const s=net.connect(target,'127.0.0.1');s.setTimeout(Math.max(1,deadline-performance.now()),()=>s.destroy(Error('TCP_DEADLINE')));s.once('connect',()=>{s.destroy();resolve();});s.once('error',reject);});return;}catch(error){if(performance.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}},deadline-performance.now(),'TCP_READY_DEADLINE');}
async function jsonGet(path,deadline,target=hostPort){return bounded(async()=>{const r=await fetch(`http://127.0.0.1:${target}${path}`,{signal:AbortSignal.timeout(Math.max(1,Math.floor(deadline-performance.now())))});const body=await r.json();if(r.status!==200)throw Error('FIXTURE_HTTP_STATUS_'+r.status);return body;},deadline-performance.now(),'FULL_JSON_READ_DEADLINE');}
const runFile=promisify(execFile);
async function command(program,args,deadline){const {stdout}=await runFile(program,args,{timeout:Math.max(1,Math.floor(Math.min(180000,deadline-performance.now()))),maxBuffer:1024*1024});return stdout;}
async function verifyFixture(deadline){
 for(const name of ['owner.json','ready.json']){const s=lstatSync(join(root,name));if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('FIXTURE_METADATA_OWNERSHIP');}
 owner=JSON.parse(readFileSync(join(root,'owner.json')));ready=JSON.parse(readFileSync(join(root,'ready.json')));
 if(!owner.nonce||owner.nonce!==ready.nonce||owner.root!==root||ready.root!==root||owner.dataDir!==join(root,'pgdata')||ready.dataDir!==owner.dataDir||owner.helperPid!==ready.helperPid||owner.pgPort!==pgPort||ready.pgPort!==pgPort)throw Error('FIXTURE_NONCE_ROOT_PID_TUPLE');
 const dbUrl=new URL(ready.databaseURL);if(!['postgres:','postgresql:'].includes(dbUrl.protocol)||dbUrl.hostname!=='127.0.0.1'||Number(dbUrl.port)!==pgPort||dbUrl.username!=='t1355_fixture'||dbUrl.password||dbUrl.pathname!=='/creatoros_t1355'||dbUrl.search||dbUrl.hash)throw Error('FIXTURE_DATABASE_URL_MISMATCH');
 const lines=readFileSync(join(root,'pgdata/postmaster.pid'),'utf8').split('\n');if(Number(lines[0])!==ready.pgPid||lines[1]!==ready.dataDir||Number(lines[3])!==pgPort||lines[5]!=='127.0.0.1')throw Error('FIXTURE_POSTMASTER_TUPLE');
 for(const [pid,needle] of [[ready.pgPid,ready.dataDir],[ready.helperPid,'binding-fixture-server.mts']]){const text=await command('/bin/ps',['-p',String(pid),'-o','uid=,command='],deadline);if(!text.trim().startsWith(String(process.getuid()))||!text.includes(needle))throw Error('FIXTURE_REAL_PROCESS_IDENTITY');}
 for(const [p,pid] of [[hostPort,ready.helperPid],[pgPort,ready.pgPid]]){const text=await command('/usr/sbin/lsof',['-nP','-t',`-iTCP:${p}`,'-sTCP:LISTEN'],deadline);if(text.trim()!==String(pid))throw Error('FIXTURE_LISTENER_PID_MISMATCH');}
 const spawned=children.get('fixture-host').process.pid;let current=ready.helperPid,found=false;
 for(let i=0;i<16&&current>1;i++){if(current===spawned){found=true;break;}current=Number((await command('/bin/ps',['-p',String(current),'-o','ppid='],deadline)).trim());}
 if(!found)throw Error('FIXTURE_HELPER_NOT_THIS_SPAWN_DESCENDANT');
 event('fixture-identity-verified',{helperPid:ready.helperPid,pgPid:ready.pgPid,nonceSha256:createHash('sha256').update(owner.nonce).digest('hex'),rootVerified:true,listenerPidsVerified:true,spawnDescendantVerified:true});
}
async function stateProof(label,deadline){const s=await jsonGet('/state',deadline);if(s.userId!==ready.userId||s.runIds.length||s.stageDetails.length||s.aiTaskCount||s.scheduledJobCount||s.configuration.externalHostAdaptersInstalled||s.configuration.collectionAdapterInstalled||s.configuration.onBoundInstalled)throw Error('FIXTURE_UNEXPECTED_BIND_MODEL_SCHEDULE_OR_ADAPTER');const result={collectionSubmissions:s.collectionSubmissions,aiTaskCount:s.aiTaskCount,scheduledJobCount:s.scheduledJobCount,bindingRuns:s.runIds.length,stageDetails:s.stageDetails.length,configuration:s.configuration};event(label,result);return result;}
async function stop(label,budget){
 const row=children.get(label);if(!row)return;
 if(label!=='fixture-host'&&(row.process.exitCode!==null||row.process.signalCode!==null))return;
 const at=Date.now(),deadline=performance.now()+budget;
 try{
  if(row.process.exitCode===null&&row.process.signalCode===null)process.kill(-row.process.pid,'SIGTERM');
  const result=await bounded(()=>row.exited,deadline-performance.now(),label.toUpperCase()+'_STOP_UNKNOWN');let stopped;
  if(label==='fixture-host'){
   stopped=await bounded(async()=>{for(;;){if(existsSync(join(root,'STOPPED.json')))return JSON.parse(readFileSync(join(root,'STOPPED.json')));await new Promise(resolve=>setTimeout(resolve,100));}},deadline-performance.now(),'FIXTURE_STOPPED_EVIDENCE_UNKNOWN');
   const own=owner??JSON.parse(readFileSync(join(root,'owner.json')));if(stopped.helperPid!==own.helperPid||!Array.isArray(stopped.failures))throw Error('FIXTURE_STOPPED_IDENTITY_MISMATCH');
  }
  const expectedTermination=result.code===0||result.code===143||result.signal==='SIGTERM';
  cleanup.push({label,state:'processClosed',processClosed:true,exitCode:result.code,signal:result.signal,error:result.error,cleanupVerified:!result.error&&(label==='fixture-host'?stopped.failures.length===0:expectedTermination),expectedTermination,hostStopped:stopped?{helperPid:stopped.helperPid,pgPid:stopped.pgPid,reason:stopped.reason,failures:stopped.failures}:undefined,at,endedAt:Date.now()});
 }catch(error){cleanup.push({label,state:'UNKNOWN',processClosed:row.process.exitCode!==null||row.process.signalCode!==null,cleanupVerified:false,at,endedAt:Date.now(),error:String(error)});}save();
}
async function clean(){if(cleaning)return cleaning;cleaning=(async()=>{await stop('playwright',120000);await stop('next',120000);await stop('seed',120000);await stop('build',120000);await stop('fixture-host',480000);save();})();return cleaning;}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{originalError??=Error('OUTER_'+signal);event('outer-stop');clean().then(()=>process.exit(1));});
try{
 if(lstatSync(root).uid!==process.getuid()||lstatSync(root).isSymbolicLink()||(lstatSync(root).mode&0o077))throw Error('OWNED_NEW_ROOT_REQUIRED');
 event('fixture-host-start',{budgetMs:300000,osSandbox:false});const hostDeadline=performance.now()+300000;launch('fixture-host',['--dir','backend','exec','node','--import','tsx','../docs/verification/t1355/harness/binding-fixture-server.mts'],false);await tcp(hostPort,hostDeadline);const health=await jsonGet('/health',hostDeadline);if(health.ready!==true)throw Error('FIXTURE_HEALTH_NOT_READY');await verifyFixture(hostDeadline);event('fixture-host-ready');
 event('build-start',{budgetMs:7200000,osSandbox:true});let start=performance.now();await finish('build',['--dir','frontend','build'],true,performance.now()+7200000);event('build-complete',{elapsedMs:performance.now()-start});
 const deadline=performance.now()+600000;event('seed-start',{sharedReadinessBudgetMs:600000,osSandbox:false});await finish('seed',['--dir','backend','exec','node','--import','tsx','../docs/verification/t1356/harness/seed-collected-dashboard.mts'],false,deadline);await verifyFixture(deadline);baseline=await stateProof('fixture-seed-baseline',deadline);event('seed-complete');
 if(performance.now()>=deadline)throw Error('READINESS_EXHAUSTED_BEFORE_TOKEN');const keyDir=join(repo,'frontend/.next/server');if(lstatSync(keyDir).isSymbolicLink()||lstatSync(keyDir).uid!==process.getuid())throw Error('OWNED_BUILD_KEY_DIRECTORY_REQUIRED');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),privateDer=privateKey.export({type:'pkcs8',format:'der'}),publicDer=publicKey.export({type:'spki',format:'der'}),seed=privateDer.subarray(privateDer.length-32),publicRaw=publicDer.subarray(publicDer.length-32);writeFileSync(join(keyDir,'verdict-verify-key.json'),JSON.stringify({publicKeyB64:publicRaw.toString('base64'),algorithm:'ed25519',bakedBy:'T1369 isolated build_smoke'})+'\n',{mode:0o600,flag:'wx'});
 let token;try{token=createBuildSmokeVerdictToken({sidecarPort:port,ttlMs:300000},{CREATOROS_VERDICT_SIGNING_KEY_B64:seed.toString('base64url'),CREATOROS_VERDICT_PUBKEY_B64:publicRaw.toString('base64')});}finally{seed.fill(0);privateDer.fill(0);}
 const env={...process.env,PORT:String(port),NODE_ENV:'production',CREATOROS_SIDECAR_VERDICT_TOKEN:token};for(const key of ['CREATOROS_VERDICT_SIGNING_KEY_B64','CREATOROS_VERDICT_PUBKEY_B64','CREATOROS_DESKTOP','CREATOROS_HANDSHAKE_REQUIRED','CREATOROS_SIDECAR_HANDSHAKE_TOKEN'])delete env[key];event('start-token-minted',{ttlMs:300000,port,publicKeySha256:createHash('sha256').update(publicRaw).digest('hex'),seedInServerEnv:false});launch('next',['--dir','frontend','start','--hostname','127.0.0.1','--port',String(port)],true,env);token=undefined;await tcp(port,deadline);const identity=await jsonGet('/api/v1/auth/me',deadline,port);if(identity.data?.id!==ready.userId)throw Error('PRODUCTION_READY_IDENTITY_MISMATCH');await verifyFixture(deadline);event('production-ready');
 event('real-navigation-start',{testBudgetMs:9360000,osSandbox:true});await finish('playwright',['--dir','frontend','exec','playwright','test','--config=playwright.t1369.production.config.ts','--project=t1369-normal','--workers=1','--retries=0'],true,globalDeadline-720000);
 finalStateAttempted=true;const final=await stateProof('fixture-final',Math.min(globalDeadline-720000,performance.now()+120000));if(final.collectionSubmissions!==baseline.collectionSubmissions)throw Error('UNEXPECTED_NEW_COLLECTION_TASK');event('real-navigation-complete');
}catch(error){originalError??=error;event('original-failure',{error:String(error)});process.exitCode=1;}
finally{if(ready&&baseline&&!cleaning&&!finalStateAttempted){finalStateAttempted=true;try{const final=await stateProof('fixture-final-after-failure',Math.min(globalDeadline-720000,performance.now()+120000));if(final.collectionSubmissions!==baseline.collectionSubmissions){originalError??=Error('UNEXPECTED_NEW_COLLECTION_TASK');process.exitCode=1;}}catch(error){event('fixture-final-UNKNOWN',{error:String(error)});process.exitCode=1;}}event('cleanup-start');await clean();if(cleanup.some(row=>!row.processClosed||!row.cleanupVerified))process.exitCode=1;event('cleanup-complete');}
