import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-assembly-types";
async function fixture(){
 const context={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const execution={executionTaskId:"parent",attempt:1,fenceToken:"f"};
 const tools=buildChatTools(["review.script"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(tools,{atomicScriptReview:true} as never)).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[]},chatContext:{projectId:"project",selection:{label:"选区标题"}}}};
 const read=vi.fn(async()=>structuredClone(restored));
 const prepareReview=vi.fn(async()=>({commit:vi.fn()}));
 const wakeTask=vi.fn(async()=>{});
 const resolve=createChatTaskToolHost({read} as never,{} as ContextReaders,{review:{prepareReview,wakeTask}} as never);
 const bound=await resolve(context,restored.modelInput as never,execution,new AbortController().signal);
 return {context,execution,tools,restored,read,prepareReview,wakeTask,bound,scope:{execution,callId:"call",attemptId:"chat-submit:original-call"}};
}
it("真实工厂生成独立事务声明，保留原生schema和描述",async()=>{
 const f=await fixture(),legacy=(await prepareChatToolDefinitions(f.tools)).definitions[0]!;
 expect(f.restored.modelInput.tools[0]).toMatchObject({execution:"host.task-submit",effect:"committed",parameters:legacy.parameters,description:legacy.description});
 expect(f.restored.modelInput.tools[0]!.version).not.toBe(legacy.version);
 expect(f.bound["review.script"]?.prepareTask).toBeTypeOf("function");expect(f.bound["review.script"]?.execute).toBeUndefined();
});
it.each([{}, {projectId:" explicit "}])("准备沿原项目和选区默认值，不派发或写库 %j",async input=>{
 const f=await fixture(),tool=f.bound["review.script"]!;expect(tool).toBeDefined();
 const prepared=await tool.prepareTask!(f.context,JSON.parse(JSON.stringify(input)),f.scope);
 expect(f.prepareReview).toHaveBeenCalledExactlyOnceWith(f.context,{attemptId:f.scope.attemptId,projectId:input.projectId?"explicit":"project"});
 expect(f.wakeTask).not.toHaveBeenCalled();
 expect(prepared.result({id:"real-child",projectId:"project"} as never)).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"review.report",taskId:"real-child",projectId:"project"}});
});
it.each(["account","definition","cancel","missing-project"])("准备前 %s 失效不调用提交服务",async reason=>{
 const f=await fixture(),tool=f.bound["review.script"]!;expect(tool).toBeDefined();
 if(reason==="account")f.restored.context.accountId="other";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 if(reason==="missing-project")f.restored.hostContext.chatContext.projectId="";
 await expect(tool.prepareTask!(f.context,{}, {...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).rejects.toThrow();
 expect(f.prepareReview).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
});
it("空稿提示保留审核卡，瞬断继续交给统一重试分类",async()=>{
 const f=await fixture(),tool=f.bound["review.script"]!;
 f.prepareReview.mockRejectedValue(new Error("当前稿面尚无可审整稿，请先保存文案"));
 await expect(tool.prepareTask!(f.context,{},f.scope)).rejects.toMatchObject({outcome:{status:"error",sideEffect:"none",data:{kind:"review.report",taskId:null,projectId:"project",error:"当前稿面尚无可审整稿，请先保存文案"}}});
 const transient=Object.assign(new Error("temporary failure"),{statusCode:503});f.prepareReview.mockRejectedValue(transient);
 await expect(tool.prepareTask!(f.context,{},f.scope)).rejects.toBe(transient);
});
