import {it,afterEach,afterAll,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createLocalCodexStatusService} from './local-codex-status.service';

// 公共service→实际request IO→真实Node fork→实际producer；只替外部SDK，不读取用户认证或执行模型。
const repoRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const esbuild=createRequire(path.join(repoRoot,'ai-worker/package.json'))('esbuild') as {
 build(options:Record<string,unknown>):Promise<unknown>; stop():void;
};
const WAIT_MS=120000,CASE_MS=2160000;
const ownedRoots:string[]=[];
afterEach(()=>vi.unstubAllEnvs());
afterAll(()=>{esbuild.stop();for(const root of ownedRoots)fs.rmSync(root,{recursive:true,force:true});},120000);
async function waitUntil(fn:()=>boolean,label:string){
 const deadline=Date.now()+WAIT_MS;
 while(Date.now()<deadline){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('OBSERVATION_DEADLINE:'+label);
}
type Kind='fifo'|'authenticated'|'runtime-failure'|'cancel'|'cleanup-failure';
type Event={type:string;time:number;pid:number;cwd?:string;n?:number;message?:{type:string}};
async function exercise(kind:Kind){
 const root=fs.mkdtempSync(path.join(tmpdir(),'creatoros-status-public-regression-'));fs.chmodSync(root,0o700);ownedRoots.push(root);
 // 仅临时目录指向本case；不覆盖HOME/CODEX_HOME。外部SDK fixture根本不访问认证文件。
 for(const key of ['TMPDIR','TEMP','TMP'])vi.stubEnv(key,root);
 const events=path.join(root,'events.ndjson'),gate=path.join(root,'release-cleanup');
 const fixture=`const fs=require('node:fs');const log=x=>fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({...x,time:Date.now(),pid:process.pid})+'\\n');
 const send=process.send.bind(process);process.send=(...args)=>{log({type:'output',message:args[0]});return send(...args);};
 let wires=0;process.on('message',m=>{log({type:'input',message:m});if(m.type==='status'){const n=++wires;log({type:'wire',id:m.requestId,n});setImmediate(()=>log({type:'wire-handled',n}));}});
 export const CODEX_RUNTIME_VERSION='0.159.3';export class CodexHostError extends Error{constructor(code){super(code);this.code=code;}}
 export async function resolveBundledCodex(){log({type:'admission'});${kind==='runtime-failure'?"throw new CodexHostError('CODEX_RUNTIME_UNAVAILABLE');":"return 'external-protocol-fixture-not-executed';"}}
 export async function createControlledCodexSession(cwd,signal,env,image){log({type:'session',cwd,image:!!image});return {authenticated:${kind==='authenticated'},loginStatus:'${kind==='authenticated'?'authenticated':'unauthenticated'}',mcpNames:[],rpc:{async request(method){log({type:'rpc',method});return {data:[{id:'fixture-real-model-id',isDefault:true,inputModalities:['text','image']}]};},async close(){log({type:'cleanup-start',cwd});${kind==='cleanup-failure'?"throw Error('external-close-fixture-failure');":kind==='fifo'||kind==='cancel'?`const deadline=Date.now()+120000;while(!fs.existsSync(${JSON.stringify(gate)})){if(Date.now()>=deadline)throw Error('FIXTURE_CLEANUP_DEADLINE');await new Promise(r=>setTimeout(r,20));}`:''}log({type:'cleanup-finished',cwd});}}};}`;
 const sdk=path.join(root,'external-sdk-fixture.ts'),worker=path.join(root,'worker.cjs');fs.writeFileSync(sdk,fixture);
 const source=path.join(repoRoot,'ai-worker/src/execution/codex-status-entry.ts');
 await esbuild.build({entryPoints:[source],outfile:worker,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{
  name:'external-sdk-protocol-fixture-only',setup(builder:{onResolve(options:{filter:RegExp},callback:(args:{importer:string})=>{path:string}|undefined):void}){builder.onResolve({filter:/^\.\/codex-app-server$/},args=>args.importer===source?{path:sdk}:undefined);}
 }]});
 const rows=():Event[]=>fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
 const io=createLocalCodexStatusService({entryPath:()=>worker});
 const controllers=Array.from({length:kind==='fifo'||kind==='cancel'?3:1},()=>new AbortController());
 const jobs=controllers.map((controller,n)=>io.read({userId:controllers.length===3?'fixture-status-user-'+n:'fixture-status-user',accountId:null,groupId:'fixture-status-group',requestId:kind+n,source:'user'},controller.signal));
 jobs.forEach(job=>{void job.catch(()=>undefined);});
 try{
  if(kind==='fifo'){
   await waitUntil(()=>rows().filter(x=>x.type==='cleanup-start').length===2,'two-owned-cleanups');
   fs.writeFileSync(gate,'release');await waitUntil(()=>rows().some(x=>x.type==='wire-handled'&&x.n===3),'third-actual-ipc-processed');
   assert.equal(rows().filter(x=>x.type==='admission').length,3,'third queued request reaches actual producer after cleanup');
   const values=await Promise.all(jobs);assert.equal(values.length,3);
   for(const value of values){assert.equal(value.loginStatus,'unauthenticated');assert.equal(value.errorCode,'CODEX_LOGIN_REQUIRED');assert.equal(value.version,'0.159.3');}
   const log=rows();assert.equal(log.filter(x=>x.type==='wire').length,3,'no retry or duplicate status request');
   assert.equal(log.filter(x=>x.type==='cleanup-finished').length,3);assert.equal(new Set(log.map(x=>x.pid)).size,1,'one real reused IO process');
   for(const x of log.filter(x=>x.type==='session'))assert.equal(fs.existsSync(x.cwd!),false,'session directory removed before reply');
  }else if(kind==='cancel'){
   await waitUntil(()=>rows().filter(x=>x.type==='cleanup-start').length===2,'original-two-close-gates');controllers[0]!.abort();
   await assert.rejects(jobs[0]!,{name:'AbortError'});
   assert.equal(rows().filter(x=>x.type==='input'&&x.message?.type==='status').length,2,'observer cancellation cannot recycle real in-flight slot before cleanup');
   fs.writeFileSync(gate,'release');const values=await Promise.all(jobs.slice(1));
   for(const value of values){assert.equal(value.loginStatus,'unauthenticated');assert.equal(value.errorCode,'CODEX_LOGIN_REQUIRED');}
   // 被取消的观察者已提前拒绝；另两个结果不能证明其 producer 清理已经完成。
   await waitUntil(()=>rows().filter(x=>x.type==='cleanup-finished').length===3,'cancelled-producer-cleanup-finished');
   assert.equal(rows().filter(x=>x.type==='input'&&x.message?.type==='status').length,3);
   assert.equal(rows().filter(x=>x.type==='input'&&x.message?.type==='cancel').length,1);assert.equal(rows().filter(x=>x.type==='cleanup-finished').length,3);
  }else{
   const [value]=await Promise.all(jobs);assert.ok(value);
   if(kind==='authenticated'){
    assert.deepEqual(value,{engine:'codex',installed:true,available:true,version:'0.159.3',defaultModelId:'fixture-real-model-id',availableModels:[{id:'fixture-real-model-id',inputModalities:['text','image']}],loginStatus:'authenticated',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true,imageEditing:'unverified'}});
    assert.equal(rows().filter(x=>x.type==='cleanup-finished').length,2);
    const reply=rows().find(x=>x.type==='output'&&x.message?.type==='result');assert.ok(reply);
    assert.ok(rows().filter(x=>x.type==='cleanup-finished').every(x=>x.time<=reply.time));
   }else{
    assert.equal(value.available,false);assert.equal(value.loginStatus,'unchecked');assert.equal(value.version,null);
    assert.equal(value.errorCode,kind==='runtime-failure'?'CODEX_RUNTIME_UNAVAILABLE':'CODEX_STATUS_UNAVAILABLE');
    if(kind==='cleanup-failure')assert.equal(rows().filter(x=>x.type==='output'&&x.message?.type==='result').length,0,'failed cleanup must never ACK a false positive');
   }
  }
 }finally{
  fs.writeFileSync(gate,'release-final');controllers.forEach(controller=>controller.abort());await Promise.allSettled(jobs);await io.stop();
  for(const pid of new Set(rows().map(x=>x.pid))){let present=true;try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')present=false;else throw error;}
   assert.equal(present,false,'owned producer closed after public stop');}
 }
}
it('第三个FIFO状态请求须在前两个真实清理后获准，不能丢请求或提前ACK',()=>exercise('fifo'),CASE_MS);
it.each(['authenticated','runtime-failure','cancel','cleanup-failure'] as const)('公共状态宿主保留%s边界',kind=>exercise(kind),CASE_MS);
