import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-runner";
async function fixture(){
 const context={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const execution={executionTaskId:"parent",attempt:1,fenceToken:"f"};
 const tools=buildChatTools(["planning.thesis"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(tools,{atomicPlanningThesis:true} as never)).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[]},chatContext:{projectId:"project",selection:{label:"选区标题"}}}};
 const read=vi.fn(async()=>structuredClone(restored));
 const prepareTaskCommit=vi.fn(async()=>({commit:vi.fn()}));
 const wakeTask=vi.fn(async()=>{});
 const resolve=createChatTaskToolHost({read} as never,{} as ContextReaders,{planning:{prepareTaskCommit,wakeTask}} as never);
 const bound=await resolve(context,restored.modelInput as never,execution,new AbortController().signal);
 return {context,execution,tools,restored,read,prepareTaskCommit,wakeTask,bound,scope:{execution,callId:"call",attemptId:"chat-submit:original-call"}};
}
it("真实工厂生成独立事务声明，保留原生schema和描述",async()=>{
 const f=await fixture(),legacy=(await prepareChatToolDefinitions(f.tools)).definitions[0]!;
 expect(f.restored.modelInput.tools[0]).toMatchObject({execution:"host.task-submit",effect:"committed",parameters:legacy.parameters,description:legacy.description});
 expect(f.restored.modelInput.tools[0]!.version).not.toBe(legacy.version);
 expect(f.bound["planning.thesis"]?.prepareTask).toBeTypeOf("function");expect(f.bound["planning.thesis"]?.execute).toBeUndefined();
});
it.each([{}, {projectId:" explicit ",topic:" topic "}])("准备沿原项目和选区默认值，不派发或写库 %j",async input=>{
 const f=await fixture(),tool=f.bound["planning.thesis"]!;expect(tool).toBeDefined();
 const prepared=await tool.prepareTask!(f.context,JSON.parse(JSON.stringify(input)),f.scope);
 expect(f.prepareTaskCommit).toHaveBeenCalledExactlyOnceWith(f.context,{taskType:"planning.thesis",attemptId:f.scope.attemptId,inputData:{projectId:input.projectId?"explicit":"project",topic:input.topic?"topic":"选区标题"}});
 expect(f.wakeTask).not.toHaveBeenCalled();
 expect(prepared.result({id:"real-child",projectId:"project"} as never)).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"planning.thesis",taskId:"real-child",projectId:"project"}});
});
it.each(["account","definition","cancel","missing-project"])("准备前 %s 失效不调用提交服务",async reason=>{
 const f=await fixture(),tool=f.bound["planning.thesis"]!;expect(tool).toBeDefined();
 if(reason==="account")f.restored.context.accountId="other";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 if(reason==="missing-project")f.restored.hostContext.chatContext.projectId="";
 await expect(tool.prepareTask!(f.context,{}, {...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).rejects.toThrow();
 expect(f.prepareTaskCommit).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
});
