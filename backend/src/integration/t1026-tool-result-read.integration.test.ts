import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createDb,type Db} from '@creatoros/backend';
import {chatWorkerInputSchema,agenticToolOutcomeSchema,workerToolResultReceiptSchema,type WorkerProviderReceipt} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createChatHostContextReader} from '../modules/ai/chat-host-context.service';
import {runChatInWorker,type ChatWorkerPorts} from '../../../ai-worker/src/execution/chat-worker-run';
import * as projection from '../../../ai-worker/src/capabilities/result-pages';

const provider=vi.hoisted(()=>({modelFor:vi.fn()}));
vi.mock('../../../ai-worker/src/runtime/provider-factory',async importOriginal=>({
 ...await importOriginal<Record<string,unknown>>(),modelFor:provider.modelFor,
}));
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},20000);
afterAll(async()=>close?.());
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==';
const digest=(value:unknown)=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
function strings(value:unknown):string[]{
 if(typeof value==='string')return [value];
 if(Array.isArray(value))return value.flatMap(strings);
 return value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
}

// 仅替换供应商流和 IPC 装配；Worker、Pi、投影、租约、账本与 backend reader 均为真实实现。
it.each([false,true])('长回执经真实 Worker/Pi notice 调用 backend reader；截图=%s 仍使用 execution ID',async screenshot=>{
 const nonce=randomUUID(),userId=`t1026-user-${nonce}`,accountId=`t1026-account-${nonce}`;
 const sourceId=`provider-source-${nonce}`,pageId=`provider-page-${nonce}`,sourceTool=screenshot?'browser.screenshot':'artifact.read';
 const sourceProviderTool=screenshot?'browser_screenshot':'artifact_read';
 const input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',operationKey:`turn-${nonce}`,capability:'copilot.assist',
  userId,accountId,conversationId:`conversation-${nonce}`,sourceMessageId:`message-${nonce}`,system:'回读已登记报告并保留来源',
  messages:[{role:'user',content:'完整读取报告'}],maxSteps:4,maxOutputTokens:128,
  tools:[{name:sourceTool,version:'1',effect:'none',description:'回读报告',parameters:{type:'object',properties:{}}},
   {name:'tool.result.read',version:'1',effect:'none',description:'分页回读',parameters:{type:'object',properties:{toolCallId:{type:'string'},offset:{type:'integer'}},required:['toolCallId','offset']}}]});
 const tasks=createPersistentTaskService(db);
 const makeTask=async()=>{
  const id=randomUUID(),task=await tasks.enqueue({userId,accountId,requestId:id,source:'user'},
   {kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload:{modelInput:input}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${id}`}))!;
  return {executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 };
 const ref=await makeTask(),otherTask=await makeTask();
 const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:12,maxTokens:10000,deadlineMs:60000}});
 const reader=createChatHostContextReader(db),modelReceipts=new Map<string,WorkerProviderReceipt>();
 const toolBindings=new Map<string,{toolCallId:string;toolName:string;input:unknown}>();
 let sourceExecutionId='',original:ReturnType<typeof agenticToolOutcomeSchema.parse>|undefined;
 let notice='',pageInput:{toolCallId:string;offset:number}|undefined;
 let page:Awaited<ReturnType<typeof reader.readToolResult>>|undefined;
 const pageErrors:unknown[]=[],imageResolutions:unknown[]=[],requests:unknown[]=[];
 const projectionSpy=vi.spyOn(projection,'projectReceiptForPi');
 const model={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},
  doGenerate:async()=>{throw new Error('只允许流协议');},
  doStream:async(request:unknown)=>{
   requests.push(request);
   const content:Array<Record<string,unknown>>=[];
   if(requests.length===1)content.push({type:'tool-call',toolCallId:sourceId,toolName:sourceProviderTool,input:'{}'});
   else if(requests.length===2){
    notice=strings(request).find(value=>value.includes('结果未显示完'))??'';
    const match=/toolCallId=("[^"]+")，offset=(\d+)/.exec(notice);
    if(!match?.[1]||!match[2])throw new Error('模型未收到分页提示');
    pageInput={toolCallId:JSON.parse(match[1]),offset:Number(match[2])};
    content.push({type:'tool-call',toolCallId:pageId,toolName:'tool_result_read',input:JSON.stringify(pageInput)});
   }else if(requests.length===3)content.push({type:'text-start',id:'final'},{type:'text-delta',id:'final',delta:'已回读报告原文。'},{type:'text-end',id:'final'});
   else throw new Error('不应重新执行原操作');
   const reason=requests.length<3?'tool-calls':'stop';
   return {stream:new ReadableStream({start(controller){
    controller.enqueue({type:'stream-start',warnings:[]});
    for(const part of content)controller.enqueue(part);
    controller.enqueue({type:'finish',usage,finishReason:{unified:reason,raw:reason}});controller.close();
   }})};
  },
 };
 provider.modelFor.mockReturnValue(model);
 const call:ChatWorkerPorts['call']=async(port,raw)=>{
  const args=raw as Record<string,unknown>;
  if(port==='readCheckpoint')return {revision:0,ledgerSequence:0,messages:[],uncheckpointedReceipts:[],pendingCalls:[],recovery:'ready'};
  if(port==='appendStreamEvents')return {nextIndex:Number(args.startIndex)+(args.chunks as unknown[]).length,lastSequence:1};
  if(port==='reserveGenerationCall'){
   const row=await ledger.reserve(ref,{kind:'model',operationKey:String(args.operationKey),inputDigest:digest(args.request),reservedTokens:128});
   return {callId:row.id,status:row.status};
  }
  if(port==='startCall'||port==='startAgenticTool'){
   const row=await ledger.start(ref,String(args.callId));return {callId:row.id,status:row.status};
  }
  if(port==='settleGenerationCall'){
   const {callId,...settlement}=args;
   await ledger.settle(ref,String(callId),settlement as Parameters<typeof ledger.settle>[2]);
   if(args.status==='settled')modelReceipts.set(String(callId),args.providerResult as WorkerProviderReceipt);
   return {callId,status:args.status};
  }
  if(port==='reserveAgenticTool'){
   const parent=modelReceipts.get(String(args.modelCallId));
   const part=parent?.content.find(value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.type==='tool-call'&&value.toolCallId===args.toolCallId) as {toolName:string;input:unknown}|undefined;
   if(!part)throw new Error('没有持久模型调用');
   const binding={toolCallId:String(args.toolCallId),toolName:part.toolName,input:typeof part.input==='string'?JSON.parse(part.input):part.input};
   const row=await ledger.reserve(ref,{kind:'tool',operationKey:`tool/${binding.toolCallId}`,inputDigest:digest(binding),reservedTokens:0});
   toolBindings.set(row.id,binding);return {callId:row.id,status:row.status,toolName:binding.toolName,input:binding.input};
  }
  if(port==='executeAgenticTool'){
   const binding=toolBindings.get(String(args.callId))!;
   if(binding.toolCallId===sourceId){
    sourceExecutionId=String(args.callId);
    original=agenticToolOutcomeSchema.parse({status:'ok',summary:'报告原文',evidence:[],error:null,continuation:null,sideEffect:'none',
     data:{workbench:{operationId:sourceExecutionId,status:'succeeded',artifactRefs:[],progressCursor:null,content:[
      {type:'text',text:'<h1>报告</h1>'+ '数据42；'.repeat(3200)+'<p>原始回执末尾 END</p>',},
      ...(screenshot?[{type:'image',mediaType:'image/png',dataRef:'wm1-'+'a'.repeat(64)}]:[]),
     ]}}});
    return original;
   }
   try{page=await reader.readToolResult(ref,binding.input as {toolCallId:string;offset:number});}
   catch(error){pageErrors.push(error);}
   return agenticToolOutcomeSchema.parse({status:'ok',summary:'分页回读',evidence:[],data:page??{error:'回读失败'},error:null,continuation:null,sideEffect:'none'});
  }
  if(port==='settleAgenticTool'){
   if(args.status!=='settled')throw new Error('不允许把已确认回执变为未知');
   const binding=toolBindings.get(String(args.callId))!;
   const receipt=workerToolResultReceiptSchema.parse({schemaVersion:1,kind:'tool',toolCallId:binding.toolCallId,toolName:binding.toolName,output:args.output});
   await ledger.settle(ref,String(args.callId),{status:'settled',usage:{totalTokens:0},resultText:JSON.stringify(receipt)});
   return {callId:args.callId,status:'settled'};
  }
  if(port==='resolveWorkbenchScreenshot'){imageResolutions.push(raw);return {mimeType:'image/png',data:png};}
  throw new Error(`未预期端口 ${port}`);
 };
 try{
  const result=await runChatInWorker(input,{apiFormat:'openai_chat',baseUrl:'https://fixture.invalid',model:'fixture',token:'fixture'},AbortSignal.timeout(15000),{call,approve:async()=> 'approved'});
  expect(result.outcome).toBe('completed');
  expect(sourceExecutionId).not.toBe(sourceId);
  expect(pageErrors).toEqual([]);
  expect(pageInput).toEqual({toolCallId:sourceId,offset:12000});
  expect(page).toMatchObject({toolCallId:sourceId,offset:12000,hasMore:false,nextOffset:null,text:JSON.stringify(original).slice(12000)});
  expect(strings(requests[2]).join('\n')).toContain('原始回执末尾 END');
  expect(notice).toContain(`[原工具调用 ID: ${sourceExecutionId}；完成计划步骤时引用此 operationRef。]`);
  const firstProjectionResult=projectionSpy.mock.results[0];
  if(!firstProjectionResult)throw new Error('Worker 未调用回执投影');
  const firstProjection=await firstProjectionResult.value;
  expect(firstProjection.details).toEqual({toolCallId:sourceId,totalCharacters:JSON.stringify(original).length,nextOffset:12000});
  if(screenshot){
   expect(imageResolutions).toEqual([{callId:sourceExecutionId,dataRef:'wm1-'+'a'.repeat(64)}]);
   expect(firstProjection.content).toContainEqual({type:'image',mimeType:'image/png',data:png});
  }else expect(imageResolutions).toEqual([]);
  await expect(reader.readToolResult(ref,{toolCallId:sourceExecutionId,offset:12000})).rejects.toThrow('当前任务没有该已结算工具结果');
  await expect(reader.readToolResult(otherTask,{toolCallId:sourceId,offset:12000})).rejects.toThrow('当前任务没有该已结算工具结果');
  await expect(reader.readToolResult(otherTask,{toolCallId:sourceExecutionId,offset:12000})).rejects.toThrow('当前任务没有该已结算工具结果');
  expect((await ledger.inspect(ref)).calls.filter(row=>row.kind==='tool')).toHaveLength(2);
 }finally{projectionSpy.mockRestore();}
},20000);
