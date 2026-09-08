import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-assembly-types";
async function fixture(){
 const context={userId:"u",accountId:"a",source:"user" as const,requestId:"r"},execution={executionTaskId:"e",attempt:1,fenceToken:"f"};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["local.tools","local.workspace"],{} as ChatToolDeps))).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:"project"},skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"test",platformPolicyVersion:"1",platformPolicy:"test",skills:[]}}};
 const read=vi.fn(async()=>structuredClone(restored)),detectTools=vi.fn(async()=>({tools:[{name:"node",installed:true,path:"/real/node",version:"1",purpose:"脚本",installHint:null}],rejected:["unknown"]})),listAuthorizedDirs=vi.fn(async()=>({dirs:["/allowed"]}));
 const resolve=createChatTaskToolHost({read} as never,{} as ContextReaders,{local:{detectTools,listAuthorizedDirs}} as never);
 const signal=new AbortController().signal,tools=await resolve(context,restored.modelInput as never,execution,signal);
 return {context,execution,restored,read,detectTools,listAuthorizedDirs,tools,scope:{execution,callId:"call",toolCallId:"tool",aiTaskId:"ai",signal}};
}
it("两个真实本机工具复用原 schema 和短宿主端口",async()=>{
 const f=await fixture();expect(Object.keys(f.tools)).toEqual(["local.tools","local.workspace"]);
 expect(await f.tools["local.tools"]!.execute!(f.context,{tools:["node","unknown"]},f.scope)).toMatchObject({status:"ok",sideEffect:"none",data:{kind:"local.tools",tools:[{name:"node",installed:true,path:"/real/node"}],rejected:["unknown"]}});
 expect(f.detectTools).toHaveBeenCalledExactlyOnceWith(f.context,{tools:["node","unknown"],signal:f.scope.signal});
 expect(await f.tools["local.workspace"]!.execute!(f.context,{},f.scope)).toMatchObject({status:"ok",sideEffect:"none",data:{kind:"local.workspace",dirs:["/allowed"]}});
});
it.each(["account","definition","cancel","input"])("%s 失效不执行本机读取",async reason=>{
 const f=await fixture(),tool=f.tools["local.tools"];expect(tool).toBeDefined();
 if(reason==="account")f.restored.context.accountId="other";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 expect((await tool!.execute!(f.context,reason==="input"?{tools:42}:{}, {...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).status).not.toBe("ok");expect(f.detectTools).not.toHaveBeenCalled();
});
it("瞬断进入可恢复结果，不把旧工具 catch 的字符串当不可重试失败",async()=>{
 const f=await fixture(),tool=f.tools["local.workspace"];expect(tool).toBeDefined();
 f.listAuthorizedDirs.mockRejectedValue(Object.assign(new Error("private text"),{statusCode:503}));
 const result=await tool!.execute!(f.context,{},f.scope);expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"transient",retryable:true}});expect(JSON.stringify(result)).not.toContain("private text");expect(f.listAuthorizedDirs).toHaveBeenCalledTimes(1);
});
it("本机端口读取期间取消，迟到数据不返回模型",async()=>{
 const f=await fixture(),tool=f.tools["local.tools"];expect(tool).toBeDefined();
 const controller=new AbortController();f.detectTools.mockImplementation(async()=>{controller.abort();return {tools:[],rejected:[]};});
 expect(await tool!.execute!(f.context,{}, {...f.scope,signal:controller.signal})).toMatchObject({status:"error",error:{code:"cancelled"}});
});
