import assert from 'node:assert/strict';
import { it } from 'vitest';
import {runChatPiLoop} from './chat-pi-loop';
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
// 真实Pi core与SDK协议，供应商流及工具回执均来自内存，不涉及外部IO。
it.each(['success','empty','tool','legacy'])("缺final恢复协议：%s", async mode => {
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
 requests.push(request);calls++;let content:any[]=[];let finish='stop';
 if(calls===1){content=[{type:'file',mediaType:'image/png',data:{type:'data',data:'AQ=='}},{type:'tool-call',toolCallId:'tool-1',toolName:'read',input:'{}'}];finish='tool-calls';}
 if(calls===3 && mode==='success')content=[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'已完成读取，资料已保留。'},{type:'text-end',id:'t'}];
 if(calls===3 && mode==='tool'){content=[{type:'tool-call',toolCallId:'tool-2',toolName:'read',input:'{}'}];finish='tool-calls';}
 if(calls>3)throw Error('PROBE_TOO_MANY_REQUESTS');
 return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const p of content)c.enqueue(p);c.enqueue({type:'finish',usage,finishReason:{unified:finish,raw:finish}});c.close();}})};
 }};
 try{const value=await runChatPiLoop({model:model as never,system:'按请求执行',messages:[{role:'user',content:'读取资料并说明结果'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>{executions++;return {text:'证据'}},approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'message',...(mode==='legacy'?{}:{recoverMissingFinal:true})});
 assert.equal(mode==='success'||mode==='legacy',true);if(mode==='success')assert.ok(value.text.includes('已完成'));console.log(JSON.stringify({mode,ok:true,calls,executions}));
 }catch(e:any){assert.equal(mode==='empty'||mode==='tool',true,String(e));assert.equal(e.code,mode==='empty'?'CHAT_FINAL_RECOVERY_EMPTY':'CHAT_FINAL_RECOVERY_TOOL_CALL');console.log(JSON.stringify({mode,ok:false,code:e.code,calls,executions}));}
 assert.equal(executions,1);assert.equal(calls,mode==='legacy'?2:3);if(calls===3){assert.equal(requests[2].toolChoice?.type,'none');assert.equal(requests[2].tools?.length??0,0);}
});

it('接受的计划仍有未完成步骤时在原Pi循环继续，工具回执后才交付', async () => {
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;
  const content:any[]=calls===2?[{type:'tool-call',toolCallId:'tool-plan',toolName:'read',input:'{}'}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:calls===1?'我已处理完毕。':'已核实完成并交付。'},{type:'text-end',id:'t'}];
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:calls===2?'tool-calls':'stop',raw:calls===2?'tool-calls':'stop'}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'完成资料读取'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>{executions++;return {status:'ok'}},approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'plan',readPlanStatus:async()=>executions?{revision:2,progressToken:'tool-1',steps:[{stepId:'read',title:'读取资料',status:'succeeded'}]}:{revision:1,progressToken:'initial',steps:[{stepId:'read',title:'读取资料',status:'pending'}]}});
 assert.equal(calls,3);assert.equal(executions,1);assert.match(result.text,/已核实完成并交付/);assert.ok(JSON.stringify(requests[1]).includes('读取资料'));
});

it('计划未推进且模型重复宣称完成时给具体步骤错误，停止无限循环', async () => {
 let calls=0;
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  calls++;return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:'完成'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};
 }};
 await assert.rejects(runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'读取'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'stalled',readPlanStatus:async()=>({revision:1,progressToken:'same',steps:[{stepId:'read',title:'读取资料',status:'pending'}]})}),{code:'CHAT_PLAN_NO_PROGRESS'});
 assert.equal(calls,3);
});
