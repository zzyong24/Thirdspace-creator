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
