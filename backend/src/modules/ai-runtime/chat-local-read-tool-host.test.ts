import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
async function fixture(){
 const context={userId:"u",accountId:"a",source:"user" as const,requestId:"r"},execution={executionTaskId:"e",attempt:1,fenceToken:"f"};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["local.read"],{} as ChatToolDeps))).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:"topics"},skillSnapshot:{snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"test",platformPolicyVersion:"1",platformPolicy:"test",skills:[]}}};
 const read=vi.fn(async()=>structuredClone(restored));
 const readLocalFile=vi.fn(async()=>({status:"file" as const,path:"/note.txt",name:"note.txt",fullText:"abcdefghij"}));
 const decideLocalReadAccess=vi.fn(async()=>({status:"granted" as const}));
 const resolve=createChatTaskToolHost({read} as never,{} as never,{localRead:{readLocalFile,decideLocalReadAccess}} as never);
 const signal=new AbortController().signal,tools=await resolve(context,restored.modelInput as never,execution,signal);
 expect(tools["local.read"]).toBeDefined();
 return {context,execution,restored,read,readLocalFile,decideLocalReadAccess,tool:tools["local.read"]!,scope:{execution,callId:"call",toolCallId:"tool",aiTaskId:"ai",modelCallId:"model",signal}};
}
it("统一宿主装配原本地读取定义，真实正文按原窗口交给模型",async()=>{
 const f=await fixture();expect(f.tool.effect).toBe("committed");
 expect(await f.tool.execute!(f.context,{path:"/note.txt",offset:2,maxChars:4},f.scope)).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"local.read",file:{path:"/note.txt",text:"cdef",offset:2,totalChars:10,hasMore:true}}});
 expect(f.readLocalFile).toHaveBeenCalledExactlyOnceWith(f.context,{path:"/note.txt",signal:f.scope.signal});
});
it.each(["account","definition","cancel"])("%s 失效不会读本机文件",async reason=>{
 const f=await fixture();if(reason==="account")f.restored.context.accountId="foreign";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 await expect(f.tool.execute!(f.context,{path:"/note.txt"},{...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).rejects.toBeDefined();
 expect(f.readLocalFile).not.toHaveBeenCalled();
});
it("执行前授权失效返回等待用户，不能将无正文当成功",async()=>{
 const f=await fixture();f.decideLocalReadAccess.mockResolvedValue({status:"needApproval"} as never);
 expect(await f.tool.approve(f.context,{path:"/note.txt"},f.scope)).toEqual({status:"user-approval"});
 expect(await f.tool.execute!(f.context,{path:"/note.txt"},f.scope)).toMatchObject({status:"blocked",sideEffect:"none",error:{code:"permission",retryable:false}});
 expect(f.readLocalFile).not.toHaveBeenCalled();
});
it.each(["needApproval","nameMatch","nameCandidates"])("%s 保留原卡片并等待用户",async status=>{
 const f=await fixture();f.readLocalFile.mockResolvedValue({status,path:"/note.txt",requestedName:"note.txt",size:1,type:"txt",items:[{path:"/note.txt",size:1,type:"txt"}],truncated:false,reason:"当前路径不可读"} as never);
 expect(await f.tool.execute!(f.context,{path:"/note.txt"},f.scope)).toMatchObject({status:"blocked",sideEffect:"none",data:{kind:"local.read",recoveryState:"chat_authorization_required"},error:{code:"permission",retryable:false}});
});
it("宿主异常不转换成可重试的无副作用结果，交给账本保留未知",async()=>{
 const f=await fixture();f.readLocalFile.mockRejectedValue(new Error("私有宿主异常"));
 await expect(f.tool.execute!(f.context,{path:"/note.txt"},f.scope)).rejects.toBeDefined();
 expect(f.readLocalFile).toHaveBeenCalledTimes(1);
});

it("读取安全硬拒返回明确错误，不生成可授权绕过的恢复标记",async()=>{
 const f=await fixture();f.readLocalFile.mockResolvedValue({status:"denied",path:"/note.txt",reason:"不支持二进制"} as never);
 expect(await f.tool.execute!(f.context,{path:"/note.txt"},f.scope)).toMatchObject({status:"error",sideEffect:"none",data:{kind:"local.read",error:"不支持二进制"},error:{code:"no_evidence",retryable:false}});
});
