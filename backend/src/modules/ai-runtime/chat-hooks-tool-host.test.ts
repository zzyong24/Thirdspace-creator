import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatHooksTaskToolHost} from "./chat-hooks-tool-host";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>["read"]>>;
async function fixture(){
 const ctx={userId:"u",accountId:"a",source:"ai" as const,requestId:"r"};
 const execution={executionTaskId:"task",attempt:2,fenceToken:"fence"},signal=new AbortController().signal;
 const prototype=buildChatTools(["script.hooks"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototype,{workerScriptHooks:true})).definitions;
 // 此处仅隔离测试工厂边界；真实 reader 与 Worker 的验证在 integration/chat-hooks-worker。
 const restored={context:ctx,modelInput:{tools:definitions},hostContext:{scriptHooksContext:{selectionTitle:"主题"},scriptHooksGeneration:{version:1,maxOutputTokens:2048}}};
 const read=vi.fn(async()=>structuredClone(restored) as unknown as Restored);
 const resolve=createChatHooksTaskToolHost({read});
 const call=()=>resolve(ctx,{} as Restored["modelInput"],execution,signal);
 return {ctx,execution,signal,prototype,restored,read,call};
}
it("真实原型只装配 Worker 参数与授权，宿主没有生成执行器",async()=>{
 const f=await fixture(),tools=await f.call(),hooks=tools["script.hooks"]!;
 expect(hooks.execution).toBe("worker.script-hooks");expect(hooks).not.toHaveProperty("execute");
 expect(hooks.parameters.safeParse({topic:123}).success).toBe(false);
 expect(await hooks.approve(f.ctx,{}, {execution:f.execution,modelCallId:"m",toolCallId:"t",signal:f.signal})).toEqual({status:"not-applicable"});
 expect(f.read).toHaveBeenCalledTimes(2);
});
it.each(["旧宿主","版本","schema","账号","缺配置"])("工厂拒绝不匹配的冻结事实：%s",async(kind)=>{
 const f=await fixture();
 if(kind==="旧宿主")f.restored.modelInput.tools=(await prepareChatToolDefinitions(f.prototype)).definitions;
 if(kind==="版本")f.restored.modelInput.tools[0]!.version="changed";
 if(kind==="schema")f.restored.modelInput.tools[0]!.parameters={type:"object"};
 if(kind==="账号")f.read.mockImplementation(async()=>({...structuredClone(f.restored),context:{...f.ctx,accountId:"other"}} as unknown as Restored));
 if(kind==="缺配置")f.read.mockImplementation(async()=>({...structuredClone(f.restored),hostContext:{}} as unknown as Restored));
 await expect(f.call()).rejects.toThrow();
});
it.each(["租约失效","账号变化"])("授权时重新读取，%s 后不可沿用已建工具",async(kind)=>{
 const f=await fixture(),hooks=(await f.call())["script.hooks"]!;
 if(kind==="租约失效")f.read.mockRejectedValue(new Error("stale execution"));
 else f.read.mockImplementation(async()=>({...structuredClone(f.restored),context:{...f.ctx,accountId:"other"}} as unknown as Restored));
 expect(await hooks.approve(f.ctx,{}, {execution:f.execution,modelCallId:"m",toolCallId:"t",signal:f.signal})).toEqual({status:"unavailable"});
});
