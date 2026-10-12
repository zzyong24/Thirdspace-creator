import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-assembly-types";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>["read"]>>;
async function fixture(){
 const context={userId:"video-u",accountId:"video-a",requestId:"test",source:"user" as const};
 const execution={executionTaskId:"video-task",attempt:1,fenceToken:"fence"},controller=new AbortController();
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["video.edit.render"],{} as ChatToolDeps))).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:"project",projectId:"project"}}} as unknown as Restored;
 const current={kind:"video.edit" as const,projectId:"project",outputId:"output",expectedRevision:3,sourceRenderTaskId:"render",instruction:"移除第一张卡",summary:["移除 1 张信息卡"],decisions:{},renderProps:{scenes:[]},error:null};
 const prepareVideoEdit=vi.fn(async()=>structuredClone(current));
 const resolve=createChatTaskToolHost({read:async()=>structuredClone(restored)},{} as ContextReaders,{videoEdit:{prepareVideoEdit}});
 const tools=await resolve(context,restored.modelInput,execution,controller.signal);
 return {context,execution,restored,current,prepareVideoEdit,resolve,tool:tools["video.edit.render"],controller,scope:{execution,aiTaskId:"ai",callId:"call",toolCallId:"tool",signal:controller.signal}};
}
it("剪辑候选工具保留 video.edit 卡与原参数，在真正执行时读取当前版本",async()=>{
 const f=await fixture();expect(f.tool).toBeDefined();expect(f.prepareVideoEdit).not.toHaveBeenCalled();
 f.current.expectedRevision=4;
 const input={instruction:"移除第一张卡",removeCardIndexes:[0]};
 expect(await f.tool!.execute!(f.context,input,f.scope)).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"video.edit",expectedRevision:4}});
 expect(f.prepareVideoEdit).toHaveBeenCalledExactlyOnceWith(f.context,{...input,projectId:"project"});
});
it.each(["账号","定义","伪造项目","无项目"])("%s不触发剪辑候选准备",async mode=>{
 const f=await fixture();expect(f.tool).toBeDefined();
 if(mode==="账号")f.restored.context.accountId="other";
 if(mode==="定义")f.restored.modelInput.tools[0]!.version="changed";
 if(mode==="无项目")f.restored.hostContext.chatContext.projectId=null;
 const result=await f.tool!.execute!(f.context,{instruction:"删卡",...(mode==="伪造项目"?{projectId:"other"}:{})},f.scope);
 expect(result.status).not.toBe("ok");expect(f.prepareVideoEdit).not.toHaveBeenCalled();
});
it("普通读取异常保脱敏错误卡，不产生成功候选",async()=>{
 const f=await fixture();expect(f.tool).toBeDefined();f.prepareVideoEdit.mockRejectedValue(new Error("当前项目还没有已确认的分镜方案"));
 const result=await f.tool!.execute!(f.context,{instruction:"删卡"},f.scope);
 expect(result).toMatchObject({status:"error",sideEffect:"none",data:{kind:"video.edit",projectId:"project",outputId:null,expectedRevision:null,sourceRenderTaskId:null,summary:[],decisions:null,renderProps:null,error:"这一步未能完成，原因尚未确认。请先确认是否已有结果，再决定是否重试。"},error:{code:"no_evidence",retryable:false}});
 expect(JSON.stringify(result)).not.toContain("当前项目还没有已确认的分镜方案");
 expect(f.prepareVideoEdit).toHaveBeenCalledTimes(1);
});
it("候选准备期间取消后不能返回可采纳成功",async()=>{
 const f=await fixture();expect(f.tool).toBeDefined();f.prepareVideoEdit.mockImplementation(async()=>{f.controller.abort();return structuredClone(f.current);});
 expect(await f.tool!.execute!(f.context,{instruction:"删卡"},f.scope)).toMatchObject({status:"error",sideEffect:"none",error:{code:"cancelled"}});
});
it("错误的结果卡不能冒充剪辑候选",async()=>{
 const f=await fixture();expect(f.tool).toBeDefined();f.prepareVideoEdit.mockResolvedValue({...f.current,kind:"brief.fill"} as unknown as typeof f.current);
 expect((await f.tool!.execute!(f.context,{instruction:"删卡"},f.scope)).status).not.toBe("ok");
});
