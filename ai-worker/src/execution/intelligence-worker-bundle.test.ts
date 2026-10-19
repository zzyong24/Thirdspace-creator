import {afterAll,beforeAll,expect,it} from 'vitest';
import {build} from 'esbuild';
import {fork,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
// @ts-expect-error 构建期 ESM 配置与生产打包共用，非运行时模块。
import {piRuntimeInitializationPlugin} from '../../scripts/pi-runtime-bundle.mjs';
let directory:string,entry:string,executionEntry:string,probeEntry:string,preload:string;
const requestMs=120000,observationMs=300000,cleanupMs=120000,caseMs=480000;
const commonExternal=['@playwright/test','jsdom','@mozilla/readability','@xenova/transformers'];
const executionExternal=['@openclaw/fs-safe','mammoth','pdf-parse',...commonExternal];
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'creatoros-pi-bundle-'));entry=join(directory,'worker.cjs');
 executionEntry=join(directory,'execution.cjs');probeEntry=join(directory,'probe.cjs');preload=join(directory,'no-network.cjs');
 await writeFile(preload,'globalThis.fetch=async()=>{process.send?.({type:"fixture-fetch"});throw Error("FIXTURE_NETWORK_DISABLED");};');
 const productionBuild=await readFile(fileURLToPath(new URL('../../scripts/build.mjs',import.meta.url)),'utf8');
 // 正式构建消费者证据，私有测试包不得把官方 external 内联成错误的 import.meta。
 expect(productionBuild.slice(productionBuild.indexOf('../src/execution/worker-entry.ts'),productionBuild.indexOf('../src/execution/agentic-worker-entry.ts'))).toContain('external: ["@openclaw/fs-safe", "mammoth", "pdf-parse", "@playwright/test", "jsdom", "@mozilla/readability", "@xenova/transformers"]');
 for(const [source,outfile,external] of [['./intelligence-generation-worker-entry.ts',entry,commonExternal],['./worker-entry.ts',executionEntry,executionExternal],['../io/model-probe-worker-entry.ts',probeEntry,[]]] as const)
  await build({entryPoints:[fileURLToPath(new URL(source,import.meta.url))],outfile,bundle:true,platform:'node',target:'node24',format:'cjs',logLevel:'silent',external:[...external],plugins:[piRuntimeInitializationPlugin()]});
},480000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});},180000);
function childEnvironment(){
 const env:NodeJS.ProcessEnv={...process.env,NODE_PATH:[fileURLToPath(new URL('../../node_modules',import.meta.url)),process.env.NODE_PATH].filter(Boolean).join(delimiter)};
 for(const key of Object.keys(env))if(/^(CREATOROS_|GROWTH_|TAURI_|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|OPTIONS)|DATABASE_URL$|OPENAI_API_KEY$|ANTHROPIC_API_KEY$)/.test(key))delete env[key];
 return env;
}
/** 首个终态后仅清理 owned child；等真实 close 后结算，退出诊断保留 code/signal/stderr。 */
async function observedChild<T>(path:string,initial:T,onMessage:(message:any,child:ChildProcess,finish:(error?:Error)=>void,result:T)=>void):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  const child=fork(path,[],{stdio:['ignore','ignore','pipe','ipc'],serialization:'advanced',env:childEnvironment(),execArgv:['--require',preload]});
  let finishing=false,error:Error|undefined,stderr='',exitCode:number|null=null,exitSignal:NodeJS.Signals|null=null;
  const timer=setTimeout(()=>finish(new Error('打包 Worker 完整观察期限耗尽')),observationMs);let cleanup:ReturnType<typeof setTimeout>|undefined;
  child.stderr!.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-65536);});
  function finish(cause?:Error){if(finishing)return;finishing=true;error=cause;clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');cleanup=setTimeout(()=>{error??=new Error('owned Worker 清理期限耗尽');child.kill('SIGKILL');},cleanupMs);}}
  child.on('error',finish);
  child.on('exit',(code,signal)=>{exitCode=code;exitSignal=signal;if(!finishing)finish(new Error('打包 Worker 提前退出'));});
  child.on('close',()=>{clearTimeout(timer);clearTimeout(cleanup);if(error)reject(new Error(`${error.message}; entry=${path}; exitCode=${exitCode}; signal=${exitSignal}; stderr=${stderr}`));else resolve(initial);});
  child.on('message',message=>{if(finishing)return;try{onMessage(message,child,finish,initial);}catch(cause){finish(cause instanceof Error?cause:new Error(String(cause)));}});
 });
}
it.each(['openai_chat','anthropic','openai_responses'].flatMap(api=>['intelligence','execution'].map(kind=>[api,kind])))('CJS 安装入口 %s / %s 初始化 Pi 并到预留端口；禁止开始收费调用',async(apiFormat,kind)=>{
 const input={kind:'model.structured',operationKey:'fixture',capability:'topic.generate',skillId:'intelligence.topic-decompose',maxOutputTokens:8192,skillSnapshot:{snapshotVersion:1,userId:'u',accountId:'a',resolvedAt:'now',platformPolicyVersion:'1',platformPolicy:'候选',skills:[{skillId:'intelligence.topic-decompose',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'拆解',template:'{{transcript}}',tools:[],requiredFacets:['transcript'],contextRequirements:[],outputSchema:{type:'object',properties:{hook:{type:'string'}},required:['hook'],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null}}]},facets:{transcript:'完整原文',mode:'topic_preview',target:JSON.stringify({positioning:{oneLiner:'定位',keywords:[]},item:{title:'作品',platform:'douyin',canonicalUrl:'https://example.com'},transcript:{text:'完整原文'}})}};
 const result=await observedChild(kind==='execution'?executionEntry:entry,{ports:[] as string[],commit:undefined as any},(m,child,finish,result)=>{
  if(m.type==='fixture-fetch'){finish(new Error('unknown 原调用不得联网'));return;}
  if(m.type==='ready')child.send({version:1,type:'run',requestId:'r',execution:{executionTaskId:'e',attempt:1,fenceToken:'f'},deadlineAt:Date.now()+requestMs});
  if(m.type==='call'){
   result.ports.push(m.port);
   if(!['readTaskContext','resolveModelCredential','reserveGenerationCall','commitResult','heartbeat'].includes(m.port)){finish(new Error(`未授权端口 ${m.port}`));return;}
   if(m.port==='commitResult')result.commit=m.data;
   child.send({version:1,type:'reply',requestId:m.requestId,ok:true,data:m.port==='readTaskContext'?input:m.port==='resolveModelCredential'?{apiFormat,baseUrl:'https://never-network.invalid/v1',model:'fixture',token:'fixture-secret',displayModelKey:'channel-managed'}:m.port==='reserveGenerationCall'?{callId:'c',status:'unknown'}:{}});
  }
  if(m.type==='stopped')finish();
 });
 expect(result.ports).toContain('reserveGenerationCall');expect(result.ports.filter(port=>port==='reserveGenerationCall')).toHaveLength(1);
 expect(result.ports).not.toContain('startCall');expect(result.commit).toMatchObject({outcome:'unknown_result',errorCode:'MODEL_CALL_REQUIRES_RECONCILIATION'});
 expect(JSON.stringify(result)).not.toContain('fixture-secret');
},caseMs);
it('打包的模型连接测试入口也初始化 Pi；fetch 在进程预加载时即拦截',async()=>{
 let blocked=false;
 await observedChild(probeEntry,{},(message,child,finish)=>{
  if(message.type==='ready')child.send({type:'text',requestId:'fixture',deadlineAt:Date.now()+requestMs,spec:{apiFormat:'openai_chat',baseUrl:'https://never-network.invalid/v1',model:'fixture',token:'fixture'}});
  if(message.type==='fixture-fetch'){blocked=true;finish();}
  if(message.type==='error')finish(new Error(`连接测试在 fetch 前失败: ${message.message}`));
 });
 expect(blocked).toBe(true);
},caseMs);
