import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ContextReaders} from "./chat-assembly-types";
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>["read"]>>;
async function fixture(projectId:string|null=null){
 const context={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const execution={executionTaskId:"task",attempt:1,fenceToken:"fence"},signal=new AbortController().signal;
 const tools=buildChatTools(["learning.capture","brief.fill"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(tools)).definitions;
 const snapshot={snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[]};
 // 这里只隔离工厂边界；真实宿主 reader 和领域回读另由集成覆盖。
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:"review",projectId},skillSnapshot:snapshot}} as unknown as Restored;
 const read=vi.fn(async()=>structuredClone(restored));
 const getProjectBrief=vi.fn(async()=>({targetAudience:"原观众"}));
 const resolve=createChatTaskToolHost({read},{getProjectBrief} as unknown as ContextReaders);
 return {context,execution,signal,restored,read,getProjectBrief,resolve,scope:{execution,aiTaskId:"ai",callId:"call",toolCallId:"tool",signal}};
}
it("组合工厂提供原定义的两个纯候选工具，经验只回显模型参数",async()=>{
 const f=await fixture(),tools=await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal);
 const learning=tools["learning.capture"]!;expect(learning).toBeDefined();expect(learning.effect).toBe("proposal");
 const input={title:"复盘经验",insight:"保留实际原因",learningType:"process"};
 expect(await learning.approve(f.context,input,{execution:f.execution,modelCallId:"m",toolCallId:"t"})).toEqual({status:"not-applicable"});
 expect(await learning.execute!(f.context,input,f.scope)).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"learning.capture",suggestion:input}});
 expect(f.getProjectBrief).not.toHaveBeenCalled();
});
it("策划候选读取冻结账号和项目的当前值，不接受模型提供另一个项目",async()=>{
 const f=await fixture("project-a"),tools=await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal),brief=tools["brief.fill"]!;
 expect(brief).toBeDefined();
 expect(await brief.execute!(f.context,{targetAudience:" 新观众 ",coreMessage:" "},f.scope)).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"brief.fill",suggestion:{targetAudience:"新观众"},current:{targetAudience:"原观众"}}});
 expect(f.getProjectBrief).toHaveBeenCalledExactlyOnceWith(f.context,{projectId:"project-a"});
 expect((await brief.execute!(f.context,{projectId:"other",targetAudience:"越权"},f.scope)).status).not.toBe("ok");
 expect(f.getProjectBrief).toHaveBeenCalledTimes(1);
});
it("无项目保留空 current；取消、非法输入和失效租约不会执行领域读取",async()=>{
 const f=await fixture(),tools=await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal),brief=tools["brief.fill"]!;
 expect(brief).toBeDefined();
 expect(await brief.execute!(f.context,{contentGoal:"解释清楚"},f.scope)).toMatchObject({status:"ok",data:{current:null}});
 expect((await brief.execute!(f.context,{contentGoal:3},f.scope)).status).not.toBe("ok");
 expect((await brief.execute!(f.context,{}, {...f.scope,signal:AbortSignal.abort()})).status).not.toBe("ok");
 f.read.mockRejectedValue(new Error("stale lease"));
 expect((await brief.execute!(f.context,{},f.scope)).status).not.toBe("ok");
 expect(f.getProjectBrief).not.toHaveBeenCalled();
});
it.each(["账号","定义"])("候选执行时%s变化，原工厂不能继续执行",async(kind)=>{
 const f=await fixture("project-a"),tools=await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal),brief=tools["brief.fill"]!;
 expect(brief).toBeDefined();
 if(kind==="账号")f.restored.context.accountId="b";else f.restored.modelInput.tools[1]!.version="changed";
 expect((await brief.execute!(f.context,{},f.scope)).status).not.toBe("ok");
 expect(f.getProjectBrief).not.toHaveBeenCalled();
});

it("策划读取明确瞬断不虚报候选成功，也不在适配器内重试",async()=>{
 const f=await fixture("project-a"),brief=(await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal))["brief.fill"]!;
 f.getProjectBrief.mockRejectedValue(Object.assign(new Error("temporary failure"),{statusCode:503}));
 expect(await brief.execute!(f.context,{targetAudience:"建议"},f.scope)).toMatchObject({status:"error",sideEffect:"none",error:{code:"transient",retryable:true},data:{kind:"brief.fill"}});
 expect(f.getProjectBrief).toHaveBeenCalledTimes(1);
});
it("策划读取期间取消，不返回可采纳的成功候选",async()=>{
 const f=await fixture("project-a"),brief=(await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal))["brief.fill"]!;
 const controller=new AbortController();
 f.getProjectBrief.mockImplementation(async()=>{controller.abort();return {targetAudience:"原观众"};});
 expect(await brief.execute!(f.context,{targetAudience:"建议"},{...f.scope,signal:controller.signal})).toMatchObject({status:"error",sideEffect:"none",error:{code:"cancelled",retryable:false}});
 expect(f.getProjectBrief).toHaveBeenCalledTimes(1);
});
