import { readUIMessageStream,type UIMessage,type UIMessageChunk } from "ai";
import { createExecutionStreamService } from "../modules/execution/execution-stream.service";
import { projectChatReceipts } from "../modules/ai/chat-receipt-projection";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { z } from "zod";
import { createDb,executionStreamEvents,executionTasks,executionCalls,eq,type Db } from "@creatoros/backend";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { createExecutionGenerationPorts } from "../modules/execution/execution-generation-ports.service";
import { createExecutionCallLedgerService } from "../modules/execution/execution-call-ledger.service";
import { createExecutionChatToolPorts, type ChatBackendTool } from "../modules/execution/execution-chat-tool-ports.service";
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>new Date().toISOString(),budget={maxCalls:6,maxTokens:100000,deadlineMs:60000};
const good={status:"ok" as const,summary:"真实结果",data:{kind:"source-card"},evidence:[],error:null,continuation:null,sideEffect:"none" as const};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(rawInput='{"query":"真实参数"}',second=false,prelude=false){
 const ctx={userId:"approval-u",accountId:`approval-a-${++seq}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"权限",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"读取",attachments:[],modelMetadata:{}});
 const parameters=z.object({query:z.string()}).strict();
 const submit=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"读取"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"web.read",version:"1",effect:"none",description:"读",parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters))}]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submit.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:submit.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget});
 const model=await generation.reserveGenerationCall(ref,{operationKey:`chat:${source.id}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,model.callId);
 if(prelude)await createExecutionStreamService(db).append(ref,{callId:model.callId,startIndex:0,chunks:[{type:"text-start",id:"intro"},{type:"text-delta",id:"intro",delta:"前言"},{type:"text-end",id:"intro"}]});
 await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",providerResult:{content:[...(prelude?[{type:"text",text:"前言"}]:[]),{type:"tool-call",toolCallId:"read",toolName:"web_read",input:rawInput},...(second?[{type:"tool-call",toolCallId:"read2",toolName:"web_read",input:'{"query":"第二参数"}'}]:[])],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]},usage:{inputTokens:2,outputTokens:3}});
 const execute=vi.fn<NonNullable<ChatBackendTool["execute"]>>(async()=>good),approve=vi.fn<ChatBackendTool["approve"]>(async()=>({status:"not-applicable"}));
 const host=createExecutionChatToolPorts(db,{now,budget,tools:{"web.read":{version:"1",effect:"none",parameters,execute,approve}}});
 const request={modelCallId:model.callId,toolCallId:"read"};
 const reservation=await host.reserve(ref,request);await host.start(ref,{callId:reservation.callId});
 return {ctx,ref,host,request,reservation,execute,approve};
}
it("Worker跳过宿主执行不能自报成功或伪造用户拒绝",async()=>{
 const f=await fixture();await expect(f.host.settle(f.ref,{callId:f.reservation.callId,status:"settled",output:good})).rejects.toThrow();
 const denied={status:"blocked",summary:"用户未允许本次操作",evidence:[],data:{denied:true},error:{code:"permission",retryable:false,recovery:"用户已拒绝，本次不执行。"},continuation:null,sideEffect:"none"};
 await expect(f.host.settle(f.ref,{callId:f.reservation.callId,status:"settled",output:denied})).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled();
});
it("已确认成功的历史回放不因后来撤销授权而被改写成拒绝",async()=>{
 const f=await fixture();await f.host.execute(f.ref,{callId:f.reservation.callId});f.approve.mockResolvedValue({status:"denied",reason:"后来撤销"});
 expect(await f.host.check(f.ref,f.request)).toEqual({status:"not-applicable"});expect(await f.host.execute(f.ref,{callId:f.reservation.callId})).toEqual(good);expect(f.execute).toHaveBeenCalledTimes(1);
});
it("跳过第一次授权也不能执行已拒绝的工具",async()=>{
 const f=await fixture();f.approve.mockResolvedValue({status:"denied",reason:"不允许"});
 expect(await f.host.execute(f.ref,{callId:f.reservation.callId})).toMatchObject({status:"blocked",sideEffect:"none",data:{denied:true}});expect(f.execute).not.toHaveBeenCalled();
});
it("第一次通过后权限撤销，实际执行仍重新检查",async()=>{
 const f=await fixture();expect(await f.host.check(f.ref,f.request)).toEqual({status:"not-applicable"});f.approve.mockResolvedValue({status:"user-approval"});
 expect(await f.host.execute(f.ref,{callId:f.reservation.callId})).toMatchObject({status:"blocked",sideEffect:"none"});expect(f.execute).not.toHaveBeenCalled();
});
it("检查器失败、Worker注入参数、旧凭证都不能放行",async()=>{
 const f=await fixture();f.approve.mockRejectedValue(Error("private error"));expect(await f.host.check(f.ref,f.request)).toEqual({status:"unavailable"});
 await expect(f.host.check(f.ref,{...f.request,input:{query:"注入"}})).rejects.toThrow();await expect(f.host.check({...f.ref,fenceToken:"wrong"},f.request)).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled();
});
it("授权等待期间取消，迟到允许不启动工具",async()=>{
 const f=await fixture();let release!:()=>void;f.approve.mockImplementation(async()=>{await new Promise<void>(r=>{release=r;});return {status:"not-applicable"};});
 const pending=f.host.check(f.ref,f.request);await vi.waitFor(()=>expect(release).toBeDefined());
 await db.update(executionTasks).set({status:"cancel_requested"}).where(eq(executionTasks.id,f.ref.executionTaskId));release();await expect(pending).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled();
});

it.each(["normal","denied","invalid"])("宿主工具卡经真实SDK归约后与最终消息一致：%s",async mode=>{
 const f=await fixture(mode==="invalid"?"{invalid":undefined);
 if(mode==="denied")f.approve.mockResolvedValue({status:"denied",reason:"已拒绝"});
 await f.host.execute(f.ref,{callId:f.reservation.callId});
 const page=await createExecutionStreamService(db).read(f.ctx,f.ref.executionTaskId);
 let message:UIMessage|undefined;
 const stream=new ReadableStream<UIMessageChunk>({start(c){c.enqueue({type:"start",messageId:"test"});for(const event of page.events)c.enqueue(event.chunk as UIMessageChunk);c.enqueue({type:"finish"});c.close();}});
 for await(const current of readUIMessageStream({stream}))message=current;
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 const task=(await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!;
 const last={id:"final",kind:"model",resultText:null,providerResult:{content:[{type:"text",text:"完成"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}};
 const expected=projectChatReceipts([...calls.sort((a,b)=>a.sequence-b.sequence),last],chatWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput)).parts.find(part=>part.toolCallId==="read");
 expect(JSON.parse(JSON.stringify(message!.parts.find(part=>"toolCallId" in part)))).toMatchObject(expected!);
});
it("结算后卡片缺失可由reserve补齐，重复读取不重跑或重复卡片",async()=>{
 const f=await fixture();await f.host.execute(f.ref,{callId:f.reservation.callId});
 await db.delete(executionStreamEvents).where(eq(executionStreamEvents.callId,f.reservation.callId));
 await f.host.reserve(f.ref,f.request);await f.host.reserve(f.ref,f.request);
 expect(f.execute).toHaveBeenCalledTimes(1);
 expect((await createExecutionStreamService(db).read(f.ctx,f.ref.executionTaskId)).events).toHaveLength(2);
});
it("Worker不能占用工具卡索引或给模型调用伪造工具终态",async()=>{
 const f=await fixture(),stream=createExecutionStreamService(db);
 await expect(stream.append(f.ref,{callId:f.reservation.callId,startIndex:0,chunks:[{type:"text-start",id:"forged"}]})).rejects.toThrow("只能追加模型展示");
 await expect(stream.append(f.ref,{callId:f.request.modelCallId,startIndex:0,chunks:[{type:"tool-output-available",toolCallId:"read",output:{fake:true}}]})).rejects.toThrow("只能追加模型展示");
 expect((await stream.read(f.ctx,f.ref.executionTaskId)).events).toEqual([]);
});
it("取消后的真实迟到卡片可补回，旧凭证和篡改事件不能覆盖事实",async()=>{
 const f=await fixture(),stream=createExecutionStreamService(db);
 await f.host.execute(f.ref,{callId:f.reservation.callId});
 await db.delete(executionStreamEvents).where(eq(executionStreamEvents.callId,f.reservation.callId));
 await db.update(executionTasks).set({status:"cancel_requested"}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await expect(f.host.settle({...f.ref,fenceToken:"old"},{callId:f.reservation.callId,status:"settled",output:good})).rejects.toThrow();
 expect((await stream.read(f.ctx,f.ref.executionTaskId)).events.filter(event=>event.chunk.type==="tool-output-available")).toHaveLength(0);
 await f.host.settle(f.ref,{callId:f.reservation.callId,status:"settled",output:good});
 expect((await stream.read(f.ctx,f.ref.executionTaskId)).events).toHaveLength(2);expect(f.execute).toHaveBeenCalledTimes(1);
 await db.update(executionStreamEvents).set({chunk:{type:"tool-output-available",toolCallId:"read",output:"篡改"}}).where(eq(executionStreamEvents.callId,f.reservation.callId));
 await expect(f.host.settle(f.ref,{callId:f.reservation.callId,status:"settled",output:good})).rejects.toThrow("工具卡与回执不符");
});

it("两个工具逆序完成，流卡片仍按模型声明顺序恢复",async()=>{
 const f=await fixture(undefined,true,true);
 const second=await f.host.reserve(f.ref,{...f.request,toolCallId:"read2"});await f.host.start(f.ref,{callId:second.callId});
 await f.host.execute(f.ref,{callId:second.callId});await f.host.execute(f.ref,{callId:f.reservation.callId});
 const page=await createExecutionStreamService(db).read(f.ctx,f.ref.executionTaskId);let message:UIMessage|undefined;
 const stream=new ReadableStream<UIMessageChunk>({start(c){c.enqueue({type:"start",messageId:"multi"});for(const event of page.events)c.enqueue(event.chunk as UIMessageChunk);c.enqueue({type:"finish"});c.close();}});
 for await(const current of readUIMessageStream({stream}))message=current;
 expect(message!.parts.filter(part=>"toolCallId" in part).map(part=>(part as {toolCallId:string}).toolCallId)).toEqual(["read","read2"]);
 expect(message!.parts[0]).toMatchObject({type:"text",text:"前言"});
 expect(f.execute).toHaveBeenCalledTimes(2);
});
