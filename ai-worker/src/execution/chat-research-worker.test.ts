import {expect,it,vi} from "vitest";
import {runChatResearchInWorker} from "./chat-research-worker";
const result={status:"ok" as const,summary:"搜索完成",evidence:[],data:{kind:"material.gather",items:[]},error:null,continuation:null,sideEffect:"none" as const};
it("只执行宿主准备的查询，同一结算 ACK 丢失不重复搜索",async()=>{
 const execute=vi.fn(async()=>({...result,data:{results:[{title:"事实",url:"https://example.com/a",snippet:"来源摘要"}]}}));let settles=0;
 const call=vi.fn(async(port:string,raw:unknown)=>{
  if(port==="prepareChatResearch")return {available:true,query:"原查询 原素材词",count:10};
  expect(raw).toMatchObject({callId:"call",observation:{status:"ok",results:[{title:"事实",url:"https://example.com/a",snippet:"来源摘要"}]}});
  if(++settles===1)throw Error("ACK 丢失");return result;
 });
 expect(await runChatResearchInWorker("call",new AbortController().signal,call,{execute:execute as never})).toEqual(result);
 expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0]).toMatchObject(["web.search",{query:"原查询 原素材词",count:10},{callId:"call",signal:expect.any(AbortSignal)}]);expect(settles).toBe(2);
});
it.each([true,false])("空查询或未装配不启动浏览器：available=%s",async available=>{
 const execute=vi.fn();const call=vi.fn(async(port:string)=>port==="prepareChatResearch"?{available,query:"",count:10}:result);
 await runChatResearchInWorker("call",new AbortController().signal,call,{execute});expect(execute).not.toHaveBeenCalled();
 expect(call.mock.calls).toHaveLength(2);
});
it("保留可恢复错误供下一轮选择，不伪造搜索成功",async()=>{
 const failure={status:"error",summary:"网页操作失败",error:{code:"transient",retryable:true,recovery:"修改查询后继续"}};
 const call=vi.fn(async(port:string,raw:unknown)=>{if(port==="prepareChatResearch")return {available:true,query:"原查询",count:10};expect(raw).toMatchObject({observation:failure});return {...result,...failure};});
 const output=await runChatResearchInWorker("call",new AbortController().signal,call,{execute:async()=>({...result,...failure}) as never});
 expect(output.error?.retryable).toBe(true);
});
it("取消后不提交新观察，非法 URL 不能生成卡片",async()=>{
 const abort=new AbortController(),call=vi.fn(async()=>({available:true,query:"原查询",count:10}));
 await expect(runChatResearchInWorker("call",abort.signal,call,{execute:async()=>{abort.abort();return result as never;}})).rejects.toThrow();
 expect(call).toHaveBeenCalledTimes(1);
 await expect(runChatResearchInWorker("call",new AbortController().signal,call,{execute:async()=>({...result,data:{results:[{title:"伪地址",url:"file:///tmp/a",snippet:"正文"}]}}) as never})).rejects.toThrow();
});
it("浏览器修复标记不能在跨进程观察转换时丢失",async()=>{
 const failure={status:"blocked" as const,summary:"浏览器不可用",error:{code:"permission" as const,retryable:false,recovery:"修复浏览器后恢复"},data:{recoveryState:"browser_runtime_unavailable"}};
 const call=vi.fn(async(port:string,raw:unknown)=>{if(port==="prepareChatResearch")return {available:true,query:"原查询",count:10};expect(raw).toMatchObject({observation:{recoveryState:"browser_runtime_unavailable"}});return {...result,...failure};});
 await runChatResearchInWorker("call",new AbortController().signal,call,{execute:async()=>({...result,...failure})});
});
