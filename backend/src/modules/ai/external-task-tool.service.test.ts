import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { z } from "zod";
import { createDb, aiConversations, executionCalls, executionStreamEvents, executionTasks, eq, and, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService } from "./chat-turn-submission.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExternalChatTurnService } from "./external-chat-turn.service";
import { createExternalTaskToolService } from "./external-task-tool.service";
import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import {externalToolCard} from '../execution/chat-tool-stream-chunks';
import {chatInputDigest} from './chat-turn-submission.service';

let db:Db,close:()=>Promise<void>,counter=0;
const now=()=>"2026-09-28T10:00:00.000Z",budget={maxCalls:4,maxTokens:10000,deadlineMs:120000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close());
async function fixture(effect:'none'|'proposal'='none'){
 const ctx={userId:"external-tool-user",accountId:`external-tool-account-${++counter}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++counter}`});
 const conversation=await repo.createConversation({title:"会话",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"读项目",attachments:[],modelMetadata:{}});
 const definitions=[{name:"context.projects",version:"read-v1",description:"读项目",parameters:{type:"object"},effect},{name:"publish.package",version:"publish-v1",description:"发布",parameters:{type:"object"},effect:"committed" as const}];
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"读项目"}],maxSteps:6,maxOutputTokens:128,tools:definitions})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:"codex"});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submission.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const chat=createExternalChatTurnService(db,{now,budget}),turn=await chat.reserve(ref,{});
 await chat.start(ref,{callId:turn.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 let count=0;
 const read:ChatBackendTool={version:"read-v1",effect,parameters:z.object({}).strict(),approve:async()=>({status:"not-applicable"}),execute:async()=>{count++;return {status:"ok",summary:"读取成功",evidence:[],data:{kind:"context.projects",projects:["真实项目"]},error:null,continuation:null,sideEffect:effect};}};
 const publish:ChatBackendTool={version:"publish-v1",effect:"committed",parameters:z.object({}).strict(),approve:async()=>({status:"not-applicable"}),execute:async()=>{throw Error("不应执行");}};
 const service=createExternalTaskToolService(db,{now}),tools={"context.projects":read,"publish.package":publish};
 const signal=new AbortController().signal;
 return {ctx,conversation,ref,turn,chat,service,tools,signal,count:()=>count};
}

it("只列当前任务的短读取工具；真实执行结算后可回放，不重复调用",async()=>{
 const f=await fixture(),listed=await f.service.list(f.ref,{},f.tools);
 expect(listed.tools.map(tool=>tool.name)).toEqual(["context.projects"]);
 const request={turnCallId:f.turn.callId,toolCallId:"mcp-1",toolName:"context.projects",input:{}};
 const first=await f.service.execute(f.ref,request,f.tools,f.signal);
 expect(first).toMatchObject({status:"settled",outcome:{status:"ok",data:{projects:["真实项目"]}}});
 expect(await f.service.execute(f.ref,request,f.tools,f.signal)).toEqual(first);
 expect(f.count()).toBe(1);
 const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 expect(rows).toHaveLength(2);
 expect(rows[1]).toMatchObject({kind:"external_tool",parentCallId:f.turn.callId,status:"settled"});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((task!.payload as any).modelInput.externalToolProjectionVersion).toBe(1);
 const early=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
 expect(early.map(row=>row.chunk.type)).toEqual(['tool-input-available','tool-output-available']);
 expect(early[1]!.chunk.output).toMatchObject({kind:'context.projects',projects:['真实项目']});
 await expect(f.service.execute(f.ref,{...request,input:{changed:true}},f.tools,f.signal)).rejects.toThrow();
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:"settled",receipt:{schemaVersion:1,engine:"codex",protocolKind:"acp",protocolVersion:1,sessionId:"session-real",turnId:f.turn.callId,stopReason:"end_turn",text:"已经读取真实项目",usage:null}});
 expect(await f.chat.commit(f.ref,{callId:f.turn.callId})).toMatchObject({outcome:"succeeded"});
 const final=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
 expect(final.filter(row=>row.chunk.type==='tool-input-available')).toHaveLength(1);
 expect(final.filter(row=>row.chunk.type==='tool-output-available')).toHaveLength(1);
});

it("发布工具、伪造回合、账号变更和旧 fence 均被拒绝",async()=>{
 const f=await fixture();
 await expect(f.service.execute(f.ref,{turnCallId:f.turn.callId,toolCallId:"high-impact",toolName:"publish.package",input:{}},f.tools,f.signal)).rejects.toThrow();
 await expect(f.service.execute(f.ref,{turnCallId:"invented",toolCallId:"mcp-2",toolName:"context.projects",input:{}},f.tools,f.signal)).rejects.toThrow();
 await expect(f.service.list({...f.ref,fenceToken:"old"},{},f.tools)).rejects.toThrow();
 await db.update(aiConversations).set({accountId:"foreign"}).where(eq(aiConversations.id,f.conversation.id));
 await expect(f.service.list(f.ref,{},f.tools)).rejects.toThrow();
 expect(f.count()).toBe(0);
});

it("执行结果不明只返回 unknown，同一 toolCallId 不重放副作用",async()=>{
 const f=await fixture(),tools={...f.tools,"context.projects":{...f.tools["context.projects"]!,execute:async()=>{throw Error("连接断开，结果未知");}}};
 const request={turnCallId:f.turn.callId,toolCallId:"mcp-unknown",toolName:"context.projects",input:{}};
 const first=await f.service.execute(f.ref,request,tools,f.signal);
 expect(first.status).toBe("unknown");
 tools["context.projects"].execute=async()=>{throw Error("不能二次执行");};
 expect((await f.service.execute(f.ref,request,tools,f.signal)).status).toBe("unknown");
 await expect(f.service.execute(f.ref,{...request,toolCallId:"mcp-new-id"},tools,f.signal)).rejects.toThrow("尚未对账");
 await expect(f.chat.settle(f.ref,{callId:f.turn.callId,status:"settled",receipt:{schemaVersion:1,engine:"codex",protocolKind:"acp",protocolVersion:1,sessionId:"session-real",turnId:f.turn.callId,stopReason:"end_turn",text:"工具可能已经执行",usage:null}})).rejects.toThrow("子工具回执尚未确认");
 await expect(f.chat.commit(f.ref,{callId:f.turn.callId})).rejects.toThrow();
});

const endTurn=async(f:Awaited<ReturnType<typeof fixture>>)=>{
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:'settled',receipt:{schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,sessionId:'session-real',turnId:f.turn.callId,stopReason:'end_turn',text:'已完成本轮',usage:null}});
 return f.chat.commit(f.ref,{callId:f.turn.callId});
};
it('T1300 所有proposal完整output留终态；none丢早期事件可安全finish恢复',async()=>{
 for(const effect of ['none','proposal'] as const){
  const f=await fixture(effect),request={turnCallId:f.turn.callId,toolCallId:`policy-${effect}`,toolName:'context.projects',input:{}};
  await f.service.execute(f.ref,request,f.tools,f.signal);
  const early=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
  expect(early).toHaveLength(effect==='none'?2:0);
  if(effect==='none')await db.delete(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
  await endTurn(f);
  const final=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
  expect(final.filter(row=>row.chunk.type==='tool-output-available')).toHaveLength(1);
  expect(f.count()).toBe(1);
 }
});
it.each(['foreign-output','reverse-sequence','missing-input','proof-version','none-proposal'] as const)('T1300 不能把%s篡改/乱序补成实时成功',async mode=>{
 const f=await fixture(),request={turnCallId:f.turn.callId,toolCallId:`integrity-${mode}`,toolName:'context.projects',input:{}};
 const result=await f.service.execute(f.ref,request,f.tools,f.signal);
 const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
 const input=events.find(row=>row.chunk.type==='tool-input-available')!,output=events.find(row=>row.chunk.type==='tool-output-available')!;
 if(mode==='foreign-output')await db.insert(executionStreamEvents).values({...output,sequence:3,callId:f.turn.callId,callIndex:1});
 if(mode==='reverse-sequence'){
  await db.delete(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
  await db.insert(executionStreamEvents).values([{...input,sequence:2},{...output,sequence:1}]);
 }
 if(mode==='missing-input')await db.delete(executionStreamEvents).where(and(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId),eq(executionStreamEvents.sequence,input.sequence)));
 if(mode==='proof-version'){
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));const payload=structuredClone(task!.payload) as any;
  payload.externalToolInputs[result.callId].toolVersion='forged';await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 }
 if(mode==='none-proposal'){
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,result.callId));const outcome=JSON.parse(call!.resultText!);outcome.sideEffect='proposal';await db.update(executionCalls).set({resultText:JSON.stringify(outcome)}).where(eq(executionCalls.id,result.callId));
 }
 await expect(endTurn(f)).rejects.toThrow();
 expect(f.count()).toBe(1);
 expect((await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId))).some(row=>row.chunk.type==='finish')).toBe(false);
});
it('T1300 native线程/回合、冻结协议和原Host族必须对应；合法ACP与native均可受信重建',async()=>{
 const f=await fixture(),result=await f.service.execute(f.ref,{turnCallId:f.turn.callId,toolCallId:'native-proof',toolName:'context.projects',input:{}},f.tools,f.signal);
 const [saved]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 const child=rows.find(row=>row.id===result.callId)!;
 expect(externalToolCard(saved!,rows,child).definition.effect).toBe('none');
 const task=structuredClone(saved!),nativeRows=structuredClone(rows),payload=task.payload as any,parent=nativeRows.find(row=>row.id===f.turn.callId)!;
 delete payload.modelInput.externalAgentBinding;parent.inputDigest=chatInputDigest(payload.modelInput);
 const provider=parent.providerResult as any;provider.protocolKind='codex-app-server';provider.providerTurnId='native-provider-turn';
 payload.codexCalls={[parent.id]:{threadId:provider.sessionId,turnId:provider.providerTurnId}};
 expect(externalToolCard(task,nativeRows,child).identity.toolCallId).toBe('native-proof');
 payload.codexCalls[parent.id].turnId='foreign-turn';expect(()=>externalToolCard(task,nativeRows,child)).toThrow('绑定');
 payload.codexCalls[parent.id].turnId=provider.providerTurnId;provider.protocolKind='acp';expect(()=>externalToolCard(task,nativeRows,child)).toThrow('协议');
 provider.protocolKind='codex-app-server';payload.modelInput.workbenchCapabilities=[{name:'context.projects'}];expect(()=>externalToolCard(task,nativeRows,child)).toThrow();
});
it('T1300 none声明不能交付proposal效果，未知原调用不重执行',async()=>{
 const f=await fixture(),tools={...f.tools,'context.projects':{...f.tools['context.projects']!,execute:async()=>({status:'ok' as const,summary:'不合法候选',evidence:[],data:{kind:'context.projects'},error:null,continuation:null,sideEffect:'proposal' as const})}};
 const request={turnCallId:f.turn.callId,toolCallId:'effect-mismatch',toolName:'context.projects',input:{}};
 expect((await f.service.execute(f.ref,request,tools,f.signal)).status).toBe('unknown');
 expect((await f.service.execute(f.ref,request,tools,f.signal)).status).toBe('unknown');
 expect(await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId))).toHaveLength(0);
});
it.each(['same-id','finish'] as const)('T1300 投影事务真实回滚后按%s恢复，保settled回执且不重execute',async recovery=>{
 const f=await fixture();let fail=true;
 type Transaction=Parameters<Db['transaction']>[0];
 const failingDb={transaction:async(action:Transaction)=>db.transaction(async tx=>{
  const result=await action(tx);
  const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
  if(fail&&events.length){fail=false;throw Error('T1300 controlled append rollback');}
  return result;
 })} as unknown as Db;
 const service=createExternalTaskToolService(failingDb,{now}),request={turnCallId:f.turn.callId,toolCallId:`rollback-${recovery}`,toolName:'context.projects',input:{}};
 const first=await service.execute(f.ref,request,f.tools,f.signal);
 expect(first.status).toBe('settled');
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,first.callId)))[0]?.status).toBe('settled');
 expect(await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId))).toHaveLength(0);
 if(recovery==='same-id')expect(await service.execute(f.ref,request,f.tools,f.signal)).toEqual(first);
 await endTurn(f);
 const final=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId));
 expect(final.filter(row=>row.chunk.type==='tool-output-available')).toHaveLength(1);expect(final.filter(row=>row.chunk.type==='finish')).toHaveLength(1);expect(f.count()).toBe(1);
});
it('T1300 同租约两个并发宿主请求只执行一次，旧fence不能取新执行权',async()=>{
 const f=await fixture(),request={turnCallId:f.turn.callId,toolCallId:'concurrent-same-id',toolName:'context.projects',input:{}};
 const result=await Promise.all([f.service.execute(f.ref,request,f.tools,f.signal),f.service.execute(f.ref,request,f.tools,f.signal)]);
 expect(result.some(row=>row.status==='settled')).toBe(true);expect(f.count()).toBe(1);
 expect((await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId))).filter(row=>row.chunk.type==='tool-output-available')).toHaveLength(1);
 await expect(f.service.execute({...f.ref,fenceToken:'old-fence'},request,f.tools,f.signal)).rejects.toThrow('失效');expect(f.count()).toBe(1);
 await endTurn(f);
});
it.each(['cancel','fence'] as const)('T1300 %s后的迟到只读回执不恢复任务或重执行',async stop=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void;
 const ready=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 let calls=0;
 const tools={...f.tools,'context.projects':{...f.tools['context.projects']!,execute:async()=>{calls++;entered();await gate;return {status:'ok' as const,summary:'已读取',evidence:[],data:{kind:'context.projects'},error:null,continuation:null,sideEffect:'none' as const};}}};
 const request={turnCallId:f.turn.callId,toolCallId:`late-${stop}`,toolName:'context.projects',input:{}};
 const pending=f.service.execute(f.ref,request,tools,f.signal);await ready;
 // 控制夹具模拟取消已落终态或新租约已换fence；不是取消后重新执行工具。
 await db.update(executionTasks).set(stop==='cancel'?{status:'cancelled'}:{fenceToken:'new-fence'}).where(eq(executionTasks.id,f.ref.executionTaskId));release();
 if(stop==='cancel')expect((await pending).status).toBe('settled');else await expect(pending).rejects.toThrow('失效');
 expect(calls).toBe(1);
 const task=(await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!;
 expect(stop==='cancel'?task.status:task.fenceToken).toBe(stop==='cancel'?'cancelled':'new-fence');
 await expect(f.service.execute(f.ref,request,tools,f.signal)).rejects.toThrow();
 expect((await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId))).some(row=>row.chunk.type==='finish')).toBe(false);
});
it('T1300 诊断sink抛错不改变结算、投影或终态，诊断仅固定安全字段',async()=>{
 const f=await fixture(),spy=vi.spyOn(console,'info').mockImplementation(()=>{throw Error('diagnostic sink unavailable');});
 try{
  await f.service.execute(f.ref,{turnCallId:f.turn.callId,toolCallId:'sink-failure',toolName:'context.projects',input:{}},f.tools,f.signal);
  expect((await endTurn(f)).outcome).toBe('succeeded');expect(f.count()).toBe(1);
  const values=spy.mock.calls.filter(args=>args[0]==='[chat-tool-timing]').map(args=>JSON.parse(String(args[1])));
  expect(values.some(value=>value.phase==='tool_settled')).toBe(true);expect(values.some(value=>value.projectionTiming==='before_finish')).toBe(true);
  for(const value of values)expect(Object.keys(value).every(key=>['executionTaskId','callId','attempt','phase','observedAt','elapsedMs','inputSchemaBytes','projectionTiming','result'].includes(key))).toBe(true);
 }finally{spy.mockRestore();}
});
