import {afterAll, beforeAll, expect, it} from "vitest";
import {build} from "esbuild";
import {fork} from "node:child_process";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
// @ts-expect-error 构建期 ESM 配置与生产打包共用，非运行时模块。
import {piRuntimeInitializationPlugin} from "../../scripts/pi-runtime-bundle.mjs";
let directory:string;
let entry:string;
let executionEntry:string;
let probeEntry:string;
let preload:string;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"creatoros-pi-bundle-"));entry=join(directory,"worker.cjs");
 executionEntry=join(directory,"execution.cjs");probeEntry=join(directory,"probe.cjs");preload=join(directory,"no-network.cjs");
 await writeFile(preload,'globalThis.fetch=async()=>{process.send?.({type:"fixture-fetch"});throw Error("FIXTURE_NETWORK_DISABLED");};');
 for(const [source,outfile] of [["./intelligence-generation-worker-entry.ts",entry],["./worker-entry.ts",executionEntry],["../io/model-probe-worker-entry.ts",probeEntry]] as const)await build({entryPoints:[fileURLToPath(new URL(source,import.meta.url))],outfile,bundle:true,platform:"node",target:"node24",format:"cjs",logLevel:"silent",external:["mammoth","pdf-parse","@playwright/test","jsdom","@mozilla/readability","@xenova/transformers"],plugins:[piRuntimeInitializationPlugin()]});
});
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
it.each(["openai_chat","anthropic","openai_responses"].flatMap(api=>["intelligence","execution"].map(kind=>[api,kind])))("CJS 安装入口 %s / %s 初始化 Pi 并到预留端口；禁止开始收费调用",async(apiFormat,kind)=>{
 const input={kind:"model.structured",operationKey:"fixture",capability:"topic.generate",skillId:"intelligence.topic-decompose",maxOutputTokens:8192,skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"now",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"intelligence.topic-decompose",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"拆解",template:"{{transcript}}",tools:[],requiredFacets:["transcript"],contextRequirements:[],outputSchema:{type:"object",properties:{hook:{type:"string"}},required:["hook"],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null}}]},facets:{transcript:"完整原文",mode:"topic_preview",target:JSON.stringify({positioning:{oneLiner:"定位",keywords:[]},item:{title:"作品",platform:"douyin",canonicalUrl:"https://example.com"},transcript:{text:"完整原文"}})}};
 const result=await new Promise<{ports:string[];commit:any}>((resolve,reject)=>{
  const child=fork(kind==="execution"?executionEntry:entry,[],{stdio:["ignore","ignore","pipe","ipc"],serialization:"advanced",execArgv:[]});
  const ports:string[]=[];let commit:any;let finished=false;
  const timer=setTimeout(()=>finish(new Error("打包 Worker 无响应")),10000);
  function finish(error?:Error){if(finished)return;finished=true;clearTimeout(timer);child.kill();error?reject(error):resolve({ports,commit});}
  child.on("error",finish);child.on("exit",()=>{if(!finished)finish(new Error("打包 Worker 提前退出"));});
  child.on("message",(m:any)=>{
   if(m.type==="ready")child.send({version:1,type:"run",requestId:"r",execution:{executionTaskId:"e",attempt:1,fenceToken:"f"},deadlineAt:null});
   if(m.type==="call"){
    ports.push(m.port);
    if(!["readTaskContext","resolveModelCredential","reserveGenerationCall","commitResult","heartbeat"].includes(m.port)){finish(new Error(`未授权端口 ${m.port}`));return;}
    if(m.port==="commitResult")commit=m.data;
    child.send({version:1,type:"reply",requestId:m.requestId,ok:true,data:m.port==="readTaskContext"?input:m.port==="resolveModelCredential"?{apiFormat,baseUrl:"https://never-network.invalid/v1",model:"fixture",token:"fixture-secret",displayModelKey:"channel-managed"}:m.port==="reserveGenerationCall"?{callId:"c",status:"unknown"}:{}});
   }
   if(m.type==="stopped")finish();
  });
 });
 expect(result.ports).toContain("reserveGenerationCall");
 expect(result.ports).not.toContain("startCall");
 expect(result.commit).toMatchObject({outcome:"unknown_result",errorCode:"MODEL_CALL_REQUIRES_RECONCILIATION"});
 expect(JSON.stringify(result)).not.toContain("fixture-secret");
});

it("打包的模型连接测试入口也初始化 Pi；fetch 在进程预加载时即拦截",async()=>{
 await new Promise<void>((resolve,reject)=>{
  const child=fork(probeEntry,[],{stdio:["ignore","ignore","pipe","ipc"],execArgv:["--require",preload]});let finished=false;
  const timer=setTimeout(()=>finish(new Error("连接测试 Worker 未到达 fetch 拦截")),10000);
  function finish(error?:Error){if(finished)return;finished=true;clearTimeout(timer);child.kill();error?reject(error):resolve();}
  child.on("error",finish);child.on("exit",()=>{if(!finished)finish(new Error("连接测试 Worker 提前退出"));});
  child.on("message",(message:any)=>{
   if(message.type==="ready")child.send({type:"text",requestId:"fixture",deadlineAt:Date.now()+8000,spec:{apiFormat:"openai_chat",baseUrl:"https://never-network.invalid/v1",model:"fixture",token:"fixture"}});
   if(message.type==="fixture-fetch")finish();
   if(message.type==="error")finish(new Error(`连接测试在 fetch 前失败: ${message.message}`));
  });
 });
});
