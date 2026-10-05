import { afterAll,beforeAll,expect,it } from "vitest";
import { z } from "zod";
import { createDb, aiConversations, executionCalls, eq, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService } from "./chat-turn-submission.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExternalChatTurnService } from "./external-chat-turn.service";
import { createExternalTaskToolService } from "./external-task-tool.service";
import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";

let db:Db,close:()=>Promise<void>,counter=0;
const now=()=>"2026-09-28T10:00:00.000Z",budget={maxCalls:4,maxTokens:10000,deadlineMs:60000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close());
async function fixture(){
 const ctx={userId:"external-tool-user",accountId:`external-tool-account-${++counter}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++counter}`});
 const conversation=await repo.createConversation({title:"会话",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"读项目",attachments:[],modelMetadata:{}});
 const definitions=[{name:"context.projects",version:"read-v1",description:"读项目",parameters:{type:"object"},effect:"none" as const},{name:"publish.package",version:"publish-v1",description:"发布",parameters:{type:"object"},effect:"committed" as const}];
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"读项目"}],maxSteps:6,maxOutputTokens:128,tools:definitions})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:"codex"});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submission.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const chat=createExternalChatTurnService(db,{now,budget}),turn=await chat.reserve(ref,{});
 await chat.start(ref,{callId:turn.callId,sessionId:"session-real",protocolKind:"acp",protocolVersion:1});
 let count=0;
 const read:ChatBackendTool={version:"read-v1",effect:"none",parameters:z.object({}).strict(),approve:async()=>({status:"not-applicable"}),execute:async()=>{count++;return {status:"ok",summary:"读取成功",evidence:[],data:{kind:"context.projects",projects:["真实项目"]},error:null,continuation:null,sideEffect:"none"};}};
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
 await expect(f.service.execute(f.ref,{...request,input:{changed:true}},f.tools,f.signal)).rejects.toThrow();
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:"settled",receipt:{schemaVersion:1,engine:"codex",protocolKind:"acp",protocolVersion:1,sessionId:"session-real",turnId:f.turn.callId,stopReason:"end_turn",text:"已经读取真实项目",usage:null}});
 expect(await f.chat.commit(f.ref,{callId:f.turn.callId})).toMatchObject({outcome:"succeeded"});
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
