import assert from 'node:assert/strict';
import { it } from 'vitest';
import {runChatPiLoop} from './chat-pi-loop';
import {createDurableStreamModel} from '../../execution/durable-stream-model';
import {runChatInWorker} from '../../execution/chat-worker-run';
import {projectReceiptForPi} from '../../capabilities/result-pages';
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
it('完整 legacy 窗口只替换本轮宿主回执，冻结历史和用户/助手同文保持原样',async()=>{
 const current='宿主投影 toolCallId=provider',legacy='宿主投影 toolCallId=execution';
 let calls=0,buildLegacy:(()=>Promise<unknown>)|undefined,legacyPrompt:unknown;
 const requests:unknown[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:unknown)=>{
  requests.push(request);calls++;
  if(calls===2)legacyPrompt=await buildLegacy!();
  const first=calls===1;
  return {stream:new ReadableStream({start(c){
   c.enqueue({type:'stream-start',warnings:[]});
   if(first)c.enqueue({type:'tool-call',toolCallId:'owned',toolName:'read',input:'{}'});
   else{c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:'完成'});c.enqueue({type:'text-end',id:'t'});}
   c.enqueue({type:'finish',usage,finishReason:{unified:first?'tool-calls':'stop',raw:first?'tool-calls':'stop'}});c.close();
  }})};
 }};
 await runChatPiLoop({model:model as never,system:current,messages:[
  {role:'user',content:current},
  {role:'assistant',content:[{type:'text',text:current},{type:'tool-call',toolCallId:'frozen',toolName:'read',input:{text:current}}]},
  {role:'tool',content:[{type:'tool-result',toolCallId:'frozen',toolName:'read',output:{type:'content',value:[{type:'text',text:current}]}}]},
  {role:'user',content:'继续读取'},
 ],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>({ok:true}),
  presentToolResult:async()=>[{type:'text',text:current}],approve:async()=> 'approved',approvalId:()=> 'approval',
  signal:AbortSignal.timeout(10000),maxOutputTokens:128,messageId:'projection',
  replayProjection:{original:new Map(['owned','frozen'].map(id=>[id,[{current,legacy}]])),capture:build=>{buildLegacy=build;}},
 });
 const expected=structuredClone((requests[1] as {prompt:Array<{role:string;content:unknown}>}).prompt);
 const last=expected.at(-1)! as {content:Array<{output:{value:Array<{text:string}>}}>};
 last.content[0]!.output.value[0]!.text=legacy;
 assert.deepEqual(legacyPrompt,expected);
 assert.equal(calls,2); // 规范化模型不进入真正供应商 doStream。
});
it('截图回执经可信解析后以 image 内容进入 Pi 下一次模型请求',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==';
 const outcome={status:'ok' as const,summary:'截图',evidence:[],data:{workbench:{operationId:'screen-call',status:'succeeded',artifactRefs:[],progressCursor:null,content:[{type:'image',mediaType:'image/png',dataRef:'wm1-'+ 'a'.repeat(64)}]}},error:null,continuation:null,sideEffect:'none' as const};
 const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);const first=requests.length===1;
  const content=first?[{type:'tool-call',toolCallId:'screen-call',toolName:'browser_screenshot',input:'{}'}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'我已查看截图。'},{type:'text-end',id:'t'}];
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:first?'tool-calls':'stop',raw:first?'tool-calls':'stop'}});c.close();}})};
 }};
 let resolved=0;
 await runChatPiLoop({model:model as never,system:'查看页面',messages:[{role:'user',content:'截图'}],definitions:[{name:'browser.screenshot',description:'截图',parameters:{type:'object',properties:{}}}],execute:async()=>outcome,
  presentToolResult:async()=>{const projected=await projectReceiptForPi(outcome,'screen-call',{resolveImage:async()=>{resolved++;return {mimeType:'image/png',data:png};}});return projected.content;},
  approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'screenshot'});
 assert.equal(resolved,1);assert.equal(requests.length,2);
 assert.ok(JSON.stringify(requests[1]).includes(png));
 assert.ok(!JSON.stringify(requests[0]).includes(png));
});
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

it('没有工具行动的连续空答复只做一次无工具恢复并快速失败',async()=>{
 let calls=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};
 }};
 await assert.rejects(runChatPiLoop({model:model as never,system:'回答用户',messages:[{role:'user',content:'生成分析'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:128,messageId:'empty-without-tools',recoverMissingFinal:true}),{code:'CHAT_FINAL_RECOVERY_EMPTY'});
 assert.equal(calls,2);assert.equal(requests[1].toolChoice?.type,'none');assert.equal(Object.keys(requests[1].tools??{}).length,0);
});

it('计划未推进且模型重复宣称完成时给具体步骤错误，停止无限循环', async () => {
 let calls=0;
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  calls++;return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:'完成'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};
 }};
 await assert.rejects(runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'读取'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'stalled',readPlanStatus:async()=>({revision:1,progressToken:'same',steps:[{stepId:'read',title:'读取资料',status:'pending'}]})}),{code:'CHAT_PLAN_NO_PROGRESS'});
 assert.equal(calls,3);
});

it('相同不可重试工具错误最多重复一次，随后无工具生成部分答复',async()=>{
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;
  const repeat=calls<=2,content=repeat?[{type:'tool-call',toolCallId:`bad-${calls}`,toolName:'plan_update',input:'{}'}]:[{type:'text-start',id:'final'},{type:'text-delta',id:'final',delta:'计划登记失败，检索未完成。'},{type:'text-end',id:'final'}],finish=repeat?'tool-calls':'stop';
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:finish,raw:finish}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'按请求工作',messages:[{role:'user',content:'执行两步任务'}],definitions:[{name:'plan.update',description:'更新计划',parameters:{type:'object',properties:{expectedRevision:{type:'integer'},steps:{type:'array'}}}}],execute:async()=>{executions++;return {status:'error',summary:'参数错误',error:{code:'invalid_input',retryable:false},sideEffect:'none'};},approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'duplicate-nonretryable',terminalToolFailurePolicyVersion:1,terminalToolFailureInput:()=>({expectedRevision:0,steps:[]})} as Parameters<typeof runChatPiLoop>[0]);
 assert.equal(calls,3,JSON.stringify(requests.map(request=>({toolChoice:request.toolChoice,tools:Object.keys(request.tools??{}),last:request.prompt?.at(-1)}))));assert.equal(executions,2);assert.equal(requests[2].toolChoice?.type,'none');assert.equal(Object.keys(requests[2].tools??{}).length,0);assert.match(JSON.stringify(requests[2].prompt),/宿主生成的最终回复恢复/);assert.match(result.text,/计划登记失败/);assert.deepEqual(result.terminalToolFailureCallIds,['bad-1','bad-2']);
});

it('长度截断在原任务自动续写，持续截断时有限收口并保留 partial 内容', async () => {
 let calls=0;
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  calls++;return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:`t-${calls}`});c.enqueue({type:'text-delta',id:`t-${calls}`,delta:`片段${calls}`});c.enqueue({type:'text-end',id:`t-${calls}`});c.enqueue({type:'finish',usage,finishReason:{unified:'length',raw:'length'}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'完整回答',messages:[{role:'user',content:'生成长内容'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'length-bounded'});
 assert.equal(calls,3);assert.equal(result.finishReason,'length');assert.equal(result.text,'片段1片段2片段3');
});

it('长度截断后模型完成时沿原任务正常收口', async () => {
 let calls=0;
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  calls++;const reason=calls===1?'length':'stop';return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:`t-${calls}`});c.enqueue({type:'text-delta',id:`t-${calls}`,delta:calls===1?'前半':'后半'});c.enqueue({type:'text-end',id:`t-${calls}`});c.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'完整回答',messages:[{role:'user',content:'生成长内容'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'length-complete'});
 assert.equal(calls,2);assert.equal(result.finishReason,'stop');assert.equal(result.text,'前半后半');
});

it('计划未完成时空响应继续原任务并允许下一步工具，不能进入只读最终答复恢复', async () => {
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;
  const content:any[]=calls===1||calls===3?[{type:'tool-call',toolCallId:`tool-${calls}`,toolName:'read',input:'{}'}]:calls===4?[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'已按回执交付'},{type:'text-end',id:'t'}]:[];
  const reason=calls===1||calls===3?'tool-calls':'stop';
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'继续计划',messages:[{role:'user',content:'完成两步'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>({status:'ok',count:++executions}),approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'empty-plan',recoverMissingFinal:true,readPlanStatus:async()=>({revision:executions+1,progressToken:String(executions),steps:[{stepId:'read',title:'读取资料',status:executions<2?'pending':'succeeded'}]})});
 assert.equal(calls,4);assert.equal(executions,2);assert.match(result.text,/已按回执交付/);
 assert.ok(requests[2].tools?.length>0);
});

it('重复工具调用不重置计划无进展计数', async () => {
 let calls=0,executions=0;
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  calls++;if(calls>8)throw Error('FIXTURE_UNBOUNDED_LOOP');const isTool=calls%2===1;const content:any[]=isTool?[{type:'tool-call',toolCallId:`loop-${calls}`,toolName:'read',input:'{}'}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'已完成'},{type:'text-end',id:'t'}];
  const reason=isTool?'tool-calls':'stop';return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});c.close();}})};
 }};
 await assert.rejects(runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'读取'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>({status:'ok',count:++executions}),approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'tool-stall',readPlanStatus:async()=>({revision:1,progressToken:'unchanged',steps:[{stepId:'read',title:'读取资料',status:'pending'}]})}),{code:'CHAT_PLAN_NO_PROGRESS'});
 assert.equal(calls,6);assert.equal(executions,3);
});

it('只有终态失败计划时不再请求模型或工具，只向后端提交可信失败步骤ID', async () => {
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;if(calls>2)throw Error('FIXTURE_UNBOUNDED_LOOP');return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:calls===1?'已生成报告，检索步骤失败。':'报告已交付；检索步骤仍失败，内容分析目标未完成。'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'完成失败步骤'}],definitions:[{name:'redfox_query',description:'检索',parameters:{type:'object',properties:{}}}],execute:async()=>{executions++;return {status:'error'};},approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'failed-plan',readPlanStatus:async()=>({revision:1,progressToken:'failed-receipt',hasSuccessor:false,steps:[{stepId:'read',title:'读取失败',status:'failed'}]})});
 assert.equal(result.text,'已生成报告，检索步骤失败。');assert.deepEqual(result.terminalPlanFailureStepIds,['read']);assert.equal(result.finishReason,'stop');assert.equal(calls,1);assert.equal(executions,0);assert.equal(requests.length,1);
});

it('取消或跳过的终态计划不能让聊天任务冒充完成',async()=>{
 let calls=0;const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{calls++;return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:'已结束'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};}};
 const result=await runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'交付'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'cancelled-plan',readPlanStatus:async()=>({revision:2,progressToken:'terminal',steps:[{stepId:'cancelled',title:'已取消步骤',status:'cancelled'},{stepId:'skipped',title:'被跳过步骤',status:'skipped'},{stepId:'done',title:'已完成步骤',status:'succeeded'}]})});
 assert.equal(calls,1);assert.equal(result.finishReason,'stop');assert.deepEqual(result.terminalPlanFailureStepIds,['cancelled','skipped']);
});

it('终态失败遇到length仍先按既有规则续写，只有stop才提交部分结果',async()=>{
 let calls=0;const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{calls++;const reason=calls===1?'length':'stop';return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:calls===1?'部分内容':'补全内容'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});c.close();}})};}};
 const result=await runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'生成'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'failed-length',readPlanStatus:async()=>({revision:1,progressToken:'failed',steps:[{stepId:'research',title:'来源检索失败',status:'failed'}]})});
 assert.equal(calls,2);assert.equal(result.text,'部分内容补全内容');assert.deepEqual(result.terminalPlanFailureStepIds,['research']);
});

it('历史stop有后继时保留既有续行提示，再只对最新失败收口',async()=>{
 let calls=0;const requests:any[]=[];const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{requests.push(request);calls++;return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:'已有结果'});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',usage,finishReason:{unified:'stop',raw:'stop'}});c.close();}})};}};
 let reads=0;const result=await runChatPiLoop({model:model as never,system:'执行计划',messages:[{role:'user',content:'完成失败步骤'}],definitions:[],execute:async()=>null,approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'failed-history',readPlanStatus:async()=>({revision:1,progressToken:'failed-receipt',hasSuccessor:++reads===1,steps:[{stepId:'read',title:'读取失败',status:'failed'}]})});
 assert.equal(calls,2);assert.match(JSON.stringify(requests[1]),/当前已接受计划仍有未完成步骤：读取失败/);assert.deepEqual(result.terminalPlanFailureStepIds,['read']);assert.equal(result.finishReason,'stop');
});

it('停止后沿原操作键回放已结算模型与工具回执，再继续同一计划', async () => {
 const taskId='original-task';const receipts=new Map<string,unknown>();const toolReceipts=new Map<string,unknown>();
 let supplierCalls=0,dispatches=0;
 const provider={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>{
  supplierCalls++;const isTool=supplierCalls===1||supplierCalls===3;
  const content:any[]=isTool?[{type:'tool-call',toolCallId:`tool-${supplierCalls}`,toolName:'read',input:'{}'}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:supplierCalls===2?'还需检查':'计划已核验'},{type:'text-end',id:'t'}];
  const reason=isTool?'tool-calls':'stop';return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});c.close();}})};
 }};
 const model=()=>createDurableStreamModel({model:provider as never,operationKey:taskId,ports:{
  reserve:async(request:any)=>({callId:request.operationKey,status:receipts.has(request.operationKey)?'settled':'reserved',...(receipts.has(request.operationKey)?{providerResult:receipts.get(request.operationKey)}:{})}),
  start:async()=>{},settle:async(callId:string,value:any)=>{assert.equal(value.status,'settled');receipts.set(callId,value.providerResult);},
 }});
 const execute=async(_name:string,_input:unknown,{toolCallId}:{toolCallId:string})=>{
  if(!toolReceipts.has(toolCallId)){dispatches++;toolReceipts.set(toolCallId,{status:'ok',operationId:`${taskId}:${toolCallId}`});}
  return toolReceipts.get(toolCallId);
 };
 const controller=new AbortController();
 const options={system:'完成原计划',messages:[{role:'user' as const,content:'执行后检查'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute,approve:async()=> 'approved' as const,approvalId:()=> 'approval',maxOutputTokens:256,messageId:taskId,
  readPlanStatus:async()=>({revision:dispatches+1,progressToken:String(dispatches),steps:[{stepId:'work',title:'处理并检查',status:dispatches===2?'succeeded' as const:'pending' as const}]})};
 await assert.rejects(runChatPiLoop({...options,model:model(),signal:controller.signal,readPlanStatus:async()=>{controller.abort(new Error('TEST_STOP_AFTER_SETTLED_RECEIPTS'));return options.readPlanStatus();}}));
 assert.equal(controller.signal.aborted,true);assert.equal(supplierCalls,2);assert.equal(dispatches,1);
 const resumed=await runChatPiLoop({...options,model:model(),signal:AbortSignal.timeout(10000)});
 assert.equal(supplierCalls,4);assert.equal(dispatches,2);assert.equal(receipts.size,4);assert.equal(toolReceipts.size,2);
 assert.match(resumed.text,/计划已核验/);
});

it.each([{recovery:'requires_reconciliation',status:'unknown'},{recovery:'ready',status:'unknown'},{recovery:'ready',status:'started'}] as const)('重启前未知在途调用由 Worker 原检查点阻断（$recovery/$status），不进入供应商或工具', async ({recovery,status}) => {
 const calls:string[]=[];
 const input={kind:'chat.run' as const,executionEngine:'pi' as const,operationKey:'original-task',capability:'copilot.assist',userId:'u',accountId:'a',conversationId:'c',sourceMessageId:'m',system:'执行',messages:[{role:'user' as const,content:'继续原任务'}],maxSteps:4,maxOutputTokens:256,tools:[]};
 const spec={apiFormat:'openai_chat' as const,baseUrl:null,model:'fixture',token:'fixture'};
 await assert.rejects(runChatInWorker(input,spec,new AbortController().signal,{call:async(port)=>{calls.push(port);if(port==='readCheckpoint')return {revision:1,ledgerSequence:2,messages:[{role:'assistant',callId:'settled-model'}],uncheckpointedReceipts:[],pendingCalls:[{callId:'in-flight-tool',status}],recovery};throw Error('FORBIDDEN_REDISPATCH');},approve:async()=>{throw Error('FORBIDDEN_APPROVAL');}}),{outcome:'unknown_result',errorCode:'CHAT_CHECKPOINT_REQUIRES_RECONCILIATION'});
 assert.deepEqual(calls,['readCheckpoint']);
});

it('已结算长结果只把分页投影送回模型，UI仍持有完整结果',async()=>{
 let calls=0;const requests:any[]=[];const original={text:'证据'.repeat(8000)};
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);calls++;
  const content:any[]=calls===1?[{type:'tool-call',toolCallId:'tool-page',toolName:'read',input:'{}'}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'根据证据完成。'},{type:'text-end',id:'t'}];
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const part of content)c.enqueue(part);c.enqueue({type:'finish',usage,finishReason:{unified:calls===1?'tool-calls':'stop',raw:calls===1?'tool-calls':'stop'}});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'读取',messages:[{role:'user',content:'读取资料'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>original,presentToolResult:async()=>[{type:'text',text:'证据首段 [调用 tool.result.read 继续读取]'}],approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(10000),maxOutputTokens:256,messageId:'page'});
 assert.equal(calls,2);
 assert.ok(JSON.stringify(requests[1]).includes('tool.result.read'));
 assert.ok(!JSON.stringify(requests[1]).includes('证据'.repeat(200)));
 assert.equal((result.message.parts.find(part=>'toolCallId' in part) as any).output.text,original.text);
});

// 参数签名只比较宿主绑定的机械事实，不进行内容或创作判断。
it.each([
 {label:'不同参数可继续纠错',inputs:[{revision:0},{revision:1}],terminal:false},
 {label:'相同参数两次有限收口',inputs:[{revision:0},{revision:0}],terminal:true},
 {label:'对象键顺序不制造新调用',inputs:[{a:1,b:2},{b:2,a:1}],terminal:true},
 {label:'数组顺序保留',inputs:[{steps:[1,2]},{steps:[2,1]}],terminal:false},
 {label:'不同错误不合并',inputs:[{revision:0},{revision:0}],codes:['invalid_input','not_found'],terminal:false},
 {label:'不同工具不合并',inputs:[{revision:0},{revision:0}],names:['read','other'],terminal:false},
])('$label',async({inputs,codes,names,terminal})=>{
 let calls=0,executions=0;const requests:any[]=[];
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async(request:any)=>{
  requests.push(request);const turn=++calls;
  return {stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});
   if(turn<=2)c.enqueue({type:'tool-call',toolCallId:`owned-${turn}`,toolName:names?.[turn-1]??'read',input:JSON.stringify(inputs[turn-1])});
   else {c.enqueue({type:'text-start',id:'final'});c.enqueue({type:'text-delta',id:'final',delta:'已说明结果'});c.enqueue({type:'text-end',id:'final'});}
   c.enqueue({type:'finish',finishReason:{unified:turn<=2?'tool-calls':'stop',raw:null},usage});c.close();}})};
 }};
 const result=await runChatPiLoop({model:model as never,system:'读取并核实',messages:[{role:'user',content:'读取资料'}],definitions:['read','other'].map(name=>({name,description:'读取',parameters:{type:'object',properties:{}}})),execute:async(_name,_args,{toolCallId})=>{executions++;return {status:'error',sideEffect:'none',error:{code:codes?.[Number(toolCallId.slice(-1))-1]??'invalid_input',retryable:false}};},approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(120000),maxOutputTokens:256,messageId:'bound-input',terminalToolFailurePolicyVersion:1,terminalToolFailureInput:(id:string)=>structuredClone(inputs[Number(id.slice(-1))-1])} as Parameters<typeof runChatPiLoop>[0]);
 assert.equal(calls,3);assert.equal(executions,2);assert.equal(requests[2].toolChoice?.type==='none',terminal);assert.equal(Object.keys(requests[2].tools??{}).length===0,terminal);assert.deepEqual(result.terminalToolFailureCallIds,terminal?['owned-1','owned-2']:undefined);
},120000);

it('缺宿主绑定参数不把 SDK 空占位当真实重复调用',async()=>{
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:async()=>{throw Error('forbidden')},doStream:async()=>({stream:new ReadableStream({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'tool-call',toolCallId:'missing',toolName:'read',input:'{}'});c.enqueue({type:'finish',finishReason:{unified:'tool-calls',raw:null},usage});c.close();}})})};
 await assert.rejects(runChatPiLoop({model:model as never,system:'读取',messages:[{role:'user',content:'读取'}],definitions:[{name:'read',description:'读取',parameters:{type:'object',properties:{}}}],execute:async()=>({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}}),approve:async()=> 'approved',approvalId:()=> 'approval',signal:AbortSignal.timeout(120000),maxOutputTokens:256,messageId:'missing-bound-input',terminalToolFailurePolicyVersion:1,terminalToolFailureInput:()=>undefined} as Parameters<typeof runChatPiLoop>[0]),/CHAT_TERMINAL_TOOL_FAILURE_RECEIPT_MISSING/);
},120000);
