import {spawn} from 'node:child_process';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import net from 'node:net';
import {createBuildSmokeVerdictToken} from '../../../../frontend/scripts/desktop/verdict-key-material.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..'),out=resolve(process.env.T1369_PRODUCTION_OUTPUT??dirname(fileURLToPath(import.meta.url))),root=realpathSync(process.env.T1356_FIXTURE_ROOT),port=Number(process.env.T1356_APP_PORT);
const owner=JSON.parse(readFileSync(join(root,'owner.json'))),ready=JSON.parse(readFileSync(join(root,'ready.json')));
if(owner.nonce!==ready.nonce||owner.root!==root||ready.root!==root||lstatSync(root).uid!==process.getuid()||!Number.isInteger(port))throw Error('PRODUCTION_FIXTURE_IDENTITY_REQUIRED');
let child,stopping=false;const events=[];const save=()=>writeFileSync(join(out,'SERVER_PHASE_SAFE.json'),JSON.stringify({events,seedOnlyInDriverMemory:true,normalWebTopology:true},null,2)+'\n');
function event(phase,details={}){events.push({phase,at:Date.now(),...details});save();console.log('T1369_PHASE '+phase);}
async function bounded(run,ms,label){let timer;try{return await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),Math.max(1,ms));})]);}finally{clearTimeout(timer);}}
function spawnCommand(args,env=process.env){child=spawn('pnpm',args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);const promise=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error('OWNED_CHILD_EXIT_'+code+'_'+signal)));});promise.catch(()=>{});return promise;}
async function stop(){if(stopping)return;stopping=true;if(child&&child.exitCode===null){const target=child;const exited=new Promise(resolve=>target.once('exit',resolve));target.kill('SIGTERM');try{await bounded(()=>exited,120000,'OWNED_CHILD_STOP_UNKNOWN');}catch(error){event('child-stop-UNKNOWN',{error:String(error)});throw error;}}}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stop().then(()=>process.exit(0),()=>process.exit(1));});
try{
 event('build-start',{budgetMs:7200000});let start=performance.now();await bounded(()=>spawnCommand(['--dir','frontend','build']),7200000,'PRODUCTION_BUILD_TIMEOUT_7200000');event('build-complete',{elapsedMs:performance.now()-start});
 const deadline=performance.now()+600000;event('seed-start',{sharedReadinessBudgetMs:600000});await bounded(()=>spawnCommand(['--dir','backend','exec','tsx','../docs/verification/t1356/harness/seed-collected-dashboard.mts']),deadline-performance.now(),'PRODUCTION_SEED_READINESS_DEADLINE');event('seed-complete');
 if(performance.now()>=deadline)throw Error('PRODUCTION_READINESS_EXHAUSTED_BEFORE_TOKEN');
 const keyDir=join(repo,'frontend/.next/server');if(lstatSync(keyDir).isSymbolicLink()||lstatSync(keyDir).uid!==process.getuid())throw Error('OWNED_BUILD_KEY_DIRECTORY_REQUIRED');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');const privateDer=privateKey.export({type:'pkcs8',format:'der'}),publicDer=publicKey.export({type:'spki',format:'der'}),seed=privateDer.subarray(privateDer.length-32),publicRaw=publicDer.subarray(publicDer.length-32);
 const keyFile=join(keyDir,'verdict-verify-key.json');writeFileSync(keyFile,JSON.stringify({publicKeyB64:publicRaw.toString('base64'),algorithm:'ed25519',bakedBy:'T1369 isolated build_smoke'})+'\n',{mode:0o600,flag:'wx'});
 let token;try{token=createBuildSmokeVerdictToken({sidecarPort:port,ttlMs:300000},{CREATOROS_VERDICT_SIGNING_KEY_B64:seed.toString('base64url'),CREATOROS_VERDICT_PUBKEY_B64:publicRaw.toString('base64')});}finally{seed.fill(0);privateDer.fill(0);}
 const env={...process.env,PORT:String(port),NODE_ENV:'production',CREATOROS_SIDECAR_VERDICT_TOKEN:token};for(const key of ['CREATOROS_VERDICT_SIGNING_KEY_B64','CREATOROS_VERDICT_PUBKEY_B64','CREATOROS_DESKTOP','CREATOROS_HANDSHAKE_REQUIRED','CREATOROS_SIDECAR_HANDSHAKE_TOKEN'])delete env[key];
 event('start-token-minted',{ttlMs:300000,port,publicKeySha256:createHash('sha256').update(publicRaw).digest('hex'),seedInServerEnv:false});const serverExit=spawnCommand(['--dir','frontend','start','--hostname','127.0.0.1','--port',String(port)],env);token=undefined;
 await bounded(async()=>{for(;;){if(child.exitCode!==null)throw Error('PRODUCTION_EXIT_BEFORE_READY');try{await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');socket.setTimeout(Math.max(1,deadline-performance.now()),()=>socket.destroy(Error('READINESS_SOCKET_DEADLINE')));socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',reject);});break;}catch(error){if(performance.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}const response=await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`,{signal:AbortSignal.timeout(Math.max(1,Math.floor(deadline-performance.now())))});const body=await response.json();if(response.status!==200||body.data?.id!==ready.userId)throw Error('PRODUCTION_READY_IDENTITY_MISMATCH');},deadline-performance.now(),'PRODUCTION_SEED_START_READINESS_DEADLINE_600000');
 event('production-ready');console.log('T1369_PRODUCTION_READY');await serverExit;
}catch(error){event('original-failure',{error:String(error)});process.exitCode=1;await stop().catch(()=>{});}
