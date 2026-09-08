import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {writeFileSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const require=createRequire(resolve(root,'ai-worker/package.json'));
const {build}=require('esbuild');
const {outputFiles}=await build({entryPoints:[resolve(root,'ai-worker/src/execution/durable-stream-model.ts')],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'warning'});
const mod=new Module('chat-fallback-ablation');mod._compile(outputFiles[0].text,'chat-fallback-ablation.cjs');
const {createDurableStreamModel}=mod.exports;
// 仅模拟协议和供应商拒绝；不启动应用、数据库、浏览器或网络请求。
async function scenario({fallback,unknown=false,replay=false}){
 let primaryCalls=0,fallbackCalls=0;const rows=new Map();
 const provider=(id,run)=>({specificationVersion:'v4',provider:'controlled',modelId:id,supportedUrls:{},doGenerate:async()=>{throw Error('unexpected generate');},doStream:run});
 const primary=provider('primary',async()=>{primaryCalls++;throw unknown?new TypeError('模拟连接中断'):Object.assign(new Error('模拟限流'),{statusCode:429});});
 const secondary=provider('secondary',async()=>{fallbackCalls++;return {stream:new ReadableStream({start(c){
  for(const part of [{type:'stream-start',warnings:[]},{type:'text-start',id:'answer'},{type:'text-delta',id:'answer',delta:'result'},{type:'text-end',id:'answer'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}}])c.enqueue(part);c.close();
 }})};});
 const ports={async reserve(input){if(!rows.has(input.operationKey))rows.set(input.operationKey,{callId:input.operationKey,status:'reserved'});return {...rows.get(input.operationKey)};},async start(id){rows.get(id).status='started';},async settle(id,result){Object.assign(rows.get(id),result);}};
 const run=async()=>{let text='';try{const model=createDurableStreamModel({model:primary,operationKey:'controlled-turn',ports,...(fallback?{fallbackModel:async()=>secondary}:{})});const result=await model.doStream({prompt:[],maxOutputTokens:8});for await(const part of result.stream){if(part.type==='text-delta')text+=part.delta;if(part.type==='error')throw part.error;}return {status:'completed',text};}catch(error){return {status:error.outcome??'error',code:error.errorCode??error.message};}};
 const first=await run(),restored=replay?await run():undefined;
 return {first,...(restored?{restored}:{}),primaryCalls,fallbackCalls,calls:[...rows.values()].map(row=>({callId:row.callId,status:row.status}))};
}
const results={withoutFallback:await scenario({fallback:false}),withFallback:await scenario({fallback:true,replay:true}),unknownSubmission:await scenario({fallback:true,unknown:true})};
const evidence={scope:'局部受控消融：仅模型流适配器与模拟账本；不代表真实供应商/持久数据库/业务验收',results};
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'chat-fallback-ablation.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
if(results.withoutFallback.first.status!=='retry_wait'||results.withFallback.first.text!=='result'||results.withFallback.restored?.text!=='result'||results.withFallback.primaryCalls!==1||results.withFallback.fallbackCalls!==1||results.unknownSubmission.first.status!=='unknown_result'||results.unknownSubmission.fallbackCalls!==0)throw Error('局部消融结果与预期语义不符');
