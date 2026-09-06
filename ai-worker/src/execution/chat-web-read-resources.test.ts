import {afterEach,expect,it,vi} from "vitest";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
import {WebCaptureError} from "../runtime/browser/web-capture";
const fake=vi.hoisted(()=>({create:vi.fn(),readDocument:vi.fn(),searchBrowser:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock("./research-worker-tools",async importOriginal=>({...await importOriginal<typeof import("./research-worker-tools")>(),createResearchWorkerTools:fake.create}));
import {createChatWebReadResources,closeChatWebReadResources} from "./chat-web-read-resources";
const output={status:"ok",summary:"读取完成",evidence:[],data:{assetId:"asset"},error:null,continuation:null,sideEffect:"committed"};
const read={text:"真实读取正文",title:"标题",finalUrl:"https://example.com/source",extractor:"readability",extractPath:"readability",turnCount:null};
function fixture(){
 const controller=new AbortController();
 fake.create.mockReset().mockReturnValue({readDocument:fake.readDocument,searchBrowser:fake.searchBrowser,close:fake.close});
 fake.readDocument.mockReset().mockResolvedValue(read);fake.searchBrowser.mockReset().mockResolvedValue([]);fake.close.mockClear();
 const configured={provider:"tavily",baseUrl:null,model:"",token:"fixture-private-token"};
 const call=vi.fn(async(port:WorkerPort):Promise<unknown>=>{
  if(port==="prepareChatWebRead")return {url:read.finalUrl,observation:null,evidenceRef:null};
  if(port==="readChatWebReadCache")return {status:"miss"};
  if(port==="resolveChatWebReadSearch")return {configured};
  if(port==="readChatWebReadSession")return {domain:"example.com",stateJson:null,revision:null};
  if(port==="saveChatWebReadSession")return {saved:true,revision:"new"};
  if(port==="completeChatWebRead" || port==="failChatWebRead")return output;
  return {};
 });
 const search=vi.fn(async()=>[]);
 const resources=createChatWebReadResources(controller.signal,call,{tavily:{search}});
 return {controller,call,search,configured,resources,run:()=>resources.run("parent",controller.signal)};
}
afterEach(async()=>{await closeChatWebReadResources();});
it("缓存命中不创建浏览器执行器或读取搜索配置",async()=>{
 const f=fixture();f.call.mockImplementationOnce(async()=>({url:read.finalUrl,observation:null,evidenceRef:null})).mockImplementationOnce(async()=>({status:"hit",output}));
 expect(await f.run()).toEqual(output);expect(fake.create).not.toHaveBeenCalled();expect(f.call.mock.calls.map(c=>c[0])).toEqual(["prepareChatWebRead","readChatWebReadCache"]);
});
it("正文读取使用对话专属登录端口，凭据不进入事实或最终结果",async()=>{
 const f=fixture();expect(await f.run()).toEqual(output);
 const deps=fake.create.mock.calls[0]![0];
 await deps.sessionAccess.read("parent",f.controller.signal);
 await deps.sessionAccess.save({callId:"parent",revision:null,stateJson:'{"cookies":[],"origins":[]}'},f.controller.signal);
 expect(f.call).toHaveBeenCalledWith("readChatWebReadSession",{callId:"parent"},expect.any(AbortSignal));
 expect(f.call).toHaveBeenCalledWith("saveChatWebReadSession",expect.objectContaining({callId:"parent",revision:null}),expect.any(AbortSignal));
 expect(f.call.mock.calls.some(c=>c[0]==="resolveChatWebReadSearch")).toBe(false);
 expect(JSON.stringify(f.call.mock.calls)).not.toContain(f.configured.token);
});
it("HTTP 失败依次尝试已配置服务、必应、百度，遇真实替代来源后停止",async()=>{
 const f=fixture();fake.readDocument.mockRejectedValue(new WebCaptureError("HTTP 403",{status:403}));
 f.search.mockRejectedValueOnce(new Error("provider failed"));
 fake.searchBrowser.mockResolvedValueOnce([]).mockResolvedValueOnce([{title:"替代来源",url:"https://other.example/item",snippet:"摘要"}]);
 await f.run();expect(f.search).toHaveBeenCalledWith(f.configured,"example.com/source",expect.objectContaining({count:5,signal:expect.any(AbortSignal)}));
 expect(fake.searchBrowser.mock.calls.map(c=>c[0].baseUrl)).toEqual([null,"https://www.baidu.com/s?wd={q}"]);
 expect(f.call).toHaveBeenCalledWith("failChatWebRead",expect.objectContaining({failure:expect.objectContaining({kind:"http_blocked",alternates:[{title:"替代来源",url:"https://other.example/item",snippet:"摘要"}]})}),undefined);
 expect(JSON.stringify(f.call.mock.calls)).not.toContain(f.configured.token);
});
it("配置端口回执未知立即上抛且不开始备用搜索",async()=>{
 const f=fixture();fake.readDocument.mockRejectedValue(new WebCaptureError("HTTP 403",{status:403}));
 const original=f.call.getMockImplementation()!;f.call.mockImplementation(async port=>{if(port==="resolveChatWebReadSearch")throw new Error(f.configured.token);return original(port);});
 await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result",errorCode:"CHAT_WEB_READ_PRIVATE_RECEIPT_UNKNOWN"});
 expect(f.search).not.toHaveBeenCalled();expect(fake.searchBrowser).not.toHaveBeenCalled();expect(f.call.mock.calls.some(c=>c[0]==="failChatWebRead")).toBe(false);
});
it("关闭会中资源后禁止新读取，重复关闭不会重复释放底层执行器",async()=>{
 const f=fixture();await f.run();await closeChatWebReadResources();await f.resources.close();expect(fake.close).toHaveBeenCalledTimes(1);
 await expect(f.run()).rejects.toThrow();expect(fake.readDocument).toHaveBeenCalledTimes(1);
});
it("私有配置响应不符合契约时保留未知，不把协议故障结算成网页失败",async()=>{
 const f=fixture();fake.readDocument.mockRejectedValue(new WebCaptureError("HTTP 403",{status:403}));
 const original=f.call.getMockImplementation()!;f.call.mockImplementation(async port=>port==="resolveChatWebReadSearch"?{configured:{provider:"tavily"}}:original(port));
 await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result",errorCode:"CHAT_WEB_READ_PRIVATE_RECEIPT_UNKNOWN"});
 expect(fake.searchBrowser).not.toHaveBeenCalled();expect(f.call.mock.calls.some(c=>c[0]==="failChatWebRead")).toBe(false);
});
