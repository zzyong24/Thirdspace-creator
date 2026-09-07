import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-runner";
async function fixture(){
 const context={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const execution={executionTaskId:"parent",attempt:1,fenceToken:"f"};
 const tools=buildChatTools(["publish.package"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(tools,{atomicPublishPackage:true} as never)).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[]},chatContext:{projectId:"project",selection:{label:"选区标题"}}}};
 const read=vi.fn(async()=>structuredClone(restored));
 const preparePublish=vi.fn(async()=>({commit:vi.fn()}));
 const wakeTask=vi.fn(async()=>{});
 const resolve=createChatTaskToolHost({read} as never,{} as ContextReaders,{publish:{preparePublish,wakeTask}} as never);
 const bound=await resolve(context,restored.modelInput as never,execution,new AbortController().signal);
 return {context,execution,tools,restored,read,preparePublish,wakeTask,bound,scope:{execution,callId:"call",attemptId:"chat-submit:original-call"}};
}
it("真实工厂生成独立事务声明，保留原生schema和描述",async()=>{
 const f=await fixture(),legacy=(await prepareChatToolDefinitions(f.tools)).definitions[0]!;
 expect(f.restored.modelInput.tools[0]).toMatchObject({execution:"host.task-submit",effect:"committed",parameters:legacy.parameters,description:legacy.description});
 expect(f.restored.modelInput.tools[0]!.version).not.toBe(legacy.version);
 expect(f.bound["publish.package"]?.prepareTask).toBeTypeOf("function");expect(f.bound["publish.package"]?.execute).toBeUndefined();
});
it.each([{}, {topic:" explicit "}])("准备沿原项目和选区默认值，不派发或写库 %j",async input=>{
 const f=await fixture(),tool=f.bound["publish.package"]!;expect(tool).toBeDefined();
 const prepared=await tool.prepareTask!(f.context,JSON.parse(JSON.stringify(input)),f.scope);
 expect(f.preparePublish).toHaveBeenCalledExactlyOnceWith(f.context,{attemptId:f.scope.attemptId,projectId:"project",topic:input.topic?"explicit":"选区标题"});
 expect(f.wakeTask).not.toHaveBeenCalled();
 expect(prepared.result({id:"real-child",projectId:"project"} as never)).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"publish.package",taskId:"real-child",projectId:"project"}});
});
it.each(["account","definition","cancel","missing-project"])("准备前 %s 失效不调用提交服务",async reason=>{
 const f=await fixture(),tool=f.bound["publish.package"]!;expect(tool).toBeDefined();
 if(reason==="account")f.restored.context.accountId="other";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 if(reason==="missing-project")f.restored.hostContext.chatContext.projectId="";
 await expect(tool.prepareTask!(f.context,{}, {...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).rejects.toThrow();
 expect(f.preparePublish).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
});
it("空稿提示保留发布包卡，瞬断继续交给统一重试分类",async()=>{
 const f=await fixture(),tool=f.bound["publish.package"]!;
 f.preparePublish.mockRejectedValue(new Error("当前稿面尚无可审整稿，请先保存文案"));
 await expect(tool.prepareTask!(f.context,{},f.scope)).rejects.toMatchObject({outcome:{status:"error",sideEffect:"none",data:{kind:"publish.package",taskId:null,projectId:"project",error:"当前稿面尚无可审整稿，请先保存文案"}}});
 const transient=Object.assign(new Error("temporary failure"),{statusCode:503});f.preparePublish.mockRejectedValue(transient);
 await expect(tool.prepareTask!(f.context,{},f.scope)).rejects.toBe(transient);
});
