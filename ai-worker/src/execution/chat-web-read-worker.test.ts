import {expect,it,vi} from "vitest";
import {runChatWebReadInWorker} from "./chat-web-read-worker";
import {BrowserRuntimeUnavailableError} from "../runtime/browser/browser-launch";
import {GenerationFailure} from "./generation-error";
import {WebCaptureError} from "../runtime/browser/web-capture";
import {WebReaderLoginRequiredError} from "../runtime/browser/web-reader";
const output={status:"ok",summary:"后端原回执",evidence:[],data:{asset:{id:"real"}},error:null,continuation:null,sideEffect:"committed"};
const read={text:"真实全文",title:"标题",finalUrl:"https://example.com/final",extractor:"chatgpt-share",extractPath:"ssr",turnCount:3};
function fixture(){
 const signal=new AbortController().signal,call=vi.fn(async(port:string)=>{
  if(port==="prepareChatWebRead")return {url:"https://example.com/bound",observation:null,evidenceRef:null};
  if(port==="readChatWebReadCache")return {status:"miss"};
  return output;
 });
 const readDocument=vi.fn(async()=>read as any),searchers=vi.fn(async()=>[]),hasSession=vi.fn(async()=>false);
 return {signal,call,readDocument,searchers,hasSession,run:()=>runChatWebReadInWorker("parent",signal,{call,readDocument,searchers,hasSession})};
}
it("缓存回执直接返回，零网页和搜索调用",async()=>{
 const f=fixture();f.call.mockImplementation(async p=>p==="prepareChatWebRead"?{url:"https://example.com/bound",observation:null,evidenceRef:null}:({status:"hit",output}) as any);
 expect(await f.run()).toEqual(output);expect(f.readDocument).not.toHaveBeenCalled();expect(f.searchers).not.toHaveBeenCalled();
});
it("持久观察只恢复和完成，不再抓取正文",async()=>{
 const f=fixture();f.call.mockImplementation(async p=>p==="prepareChatWebRead"?{url:"https://example.com/bound",observation:read,evidenceRef:"e"}:output as any);
 expect(await f.run()).toEqual(output);expect(f.call.mock.calls.map(r=>r[0])).toEqual(["prepareChatWebRead","restoreChatWebRead","completeChatWebRead"]);expect(f.readDocument).not.toHaveBeenCalled();
});
it("新读取保留完整诊断，结算ACK丢失只重发完成请求",async()=>{
 const f=fixture();let completions=0;const original=f.call.getMockImplementation()!;
 f.call.mockImplementation(async p=>{if(p==="completeChatWebRead" && completions++===0)throw new Error("ACK lost");return original(p);});
 expect(await f.run()).toEqual(output);expect(f.readDocument).toHaveBeenCalledTimes(1);
 expect(f.call).toHaveBeenCalledWith("observeChatWebRead",{callId:"parent",observation:read},f.signal);
 expect(f.call.mock.calls.filter(r=>r[0]==="completeChatWebRead")).toHaveLength(2);
});
it("HTTP备用来源沿共享顺序选择并结算失败，登录不触发备用搜索",async()=>{
 const f=fixture(),alternate={title:"备用",url:"https://other.example",snippet:"摘要"};
 f.readDocument.mockRejectedValueOnce(new WebCaptureError("HTTP 403",{status:403}));
 const first=vi.fn(async()=>[]),second=vi.fn(async()=>[alternate]);f.searchers.mockResolvedValue([first,second] as never);
 await f.run();expect(first).toHaveBeenCalled();expect(second).toHaveBeenCalled();
 expect(f.call).toHaveBeenCalledWith("failChatWebRead",expect.objectContaining({failure:expect.objectContaining({kind:"http_blocked",status:403,alternates:[alternate]})}),undefined);
 const login=fixture();login.readDocument.mockRejectedValueOnce(new WebReaderLoginRequiredError("example.com"));await login.run();expect(login.searchers).not.toHaveBeenCalled();
});
it("未知宿主回执不伪装网页读取失败，取消不触发失败结算",async()=>{
 const f=fixture();f.call.mockRejectedValue(new Error("transport unknown"));await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
 expect(f.call.mock.calls.some(r=>r[0]==="failChatWebRead")).toBe(false);
 const c=new AbortController(),other=fixture();other.readDocument.mockImplementationOnce(async()=>{c.abort();throw new Error("stopped");});
 await expect(runChatWebReadInWorker("parent",c.signal,other)).rejects.toThrow();expect(other.call.mock.calls.some(r=>r[0]==="failChatWebRead")).toBe(false);
});

it.each(["search","search-init","session"])("HTTP回退中的 %s 未知回执必须透传，不能结算普通失败",async(point)=>{
 const f=fixture(),unknown=new GenerationFailure("unknown_result","RECEIPT_UNKNOWN"),next=vi.fn(async()=>[]);
 f.readDocument.mockRejectedValueOnce(new WebCaptureError("HTTP 403",{status:403}));
 if(point==="search")f.searchers.mockResolvedValue([async()=>{throw unknown;},next] as never);
 else if(point==="search-init")f.searchers.mockRejectedValueOnce(unknown);
 else f.hasSession.mockRejectedValueOnce(unknown);
 await expect(f.run()).rejects.toBe(unknown);expect(next).not.toHaveBeenCalled();expect(f.call.mock.calls.some(r=>r[0]==="failChatWebRead")).toBe(false);
});

it("备用搜索初始化失败仍按原 HTTP 404 结算，不重复抓取或保存假正文",async()=>{
 const f=fixture();f.readDocument.mockRejectedValueOnce(new WebCaptureError("HTTP 404",{status:404}));
 f.searchers.mockRejectedValueOnce(new Error("备用搜索不可用"));
 await f.run();
 expect(f.call).toHaveBeenCalledWith("failChatWebRead",expect.objectContaining({failure:expect.objectContaining({kind:"http_blocked",status:404,alternates:[]})}),undefined);
 expect(f.readDocument).toHaveBeenCalledTimes(1);
 expect(f.call.mock.calls.some(r=>r[0]==="observeChatWebRead")).toBe(false);
});

it("备用搜索初始化期间取消，不查询登录状态或结算失败",async()=>{
 const f=fixture(),controller=new AbortController();
 f.readDocument.mockRejectedValueOnce(new WebCaptureError("HTTP 503",{status:503}));
 f.searchers.mockImplementationOnce(async()=>{controller.abort();throw new Error("已取消");});
 await expect(runChatWebReadInWorker("parent",controller.signal,f)).rejects.toThrow();
 expect(f.hasSession).not.toHaveBeenCalled();
 expect(f.call.mock.calls.some(r=>r[0]==="failChatWebRead")).toBe(false);
});

it("浏览器缺失与无效正文通过不同明确失败结算，不上传假观察",async()=>{
 const missing=fixture();missing.readDocument.mockRejectedValueOnce(new BrowserRuntimeUnavailableError());await missing.run();
 expect(missing.call).toHaveBeenCalledWith("failChatWebRead",{callId:"parent",failure:{kind:"browser_runtime_unavailable"}},undefined);
 const invalid=fixture();invalid.readDocument.mockResolvedValueOnce({...read,text:""});await invalid.run();
 expect(invalid.call).toHaveBeenCalledWith("failChatWebRead",expect.objectContaining({failure:expect.objectContaining({kind:"read_error",code:"no_evidence"})}),undefined);
 expect(invalid.call.mock.calls.some(r=>r[0]==="observeChatWebRead")).toBe(false);
});

it.each([["UNSAFE_URL","permission"],["PARSE_FAILED","no_evidence"]] as const)("读取器 %s 保留为 %s，不误报临时网络故障",async(readerCode,code)=>{
 const f=fixture();f.readDocument.mockRejectedValueOnce(new WebCaptureError("读取受阻",{code:readerCode}));
 await f.run();
 expect(f.call).toHaveBeenCalledWith("failChatWebRead",expect.objectContaining({failure:expect.objectContaining({kind:"read_error",code})}),undefined);
 expect(f.searchers).not.toHaveBeenCalled();
 expect(f.call.mock.calls.some(r=>r[0]==="observeChatWebRead")).toBe(false);
});

it.each(["observe","cache"])("%s ACK 丢失后只回读原调用事实，不重复网页或缓存动作",async point=>{
 const f=fixture();let preparations=0;const original=f.call.getMockImplementation()!;
 f.call.mockImplementation(async p=>{
  if(p==="prepareChatWebRead" && preparations++>0)return (point==="observe"?{url:"https://example.com/bound",observation:read,evidenceRef:"stored"}:{url:"https://example.com/bound",observation:null,evidenceRef:null,output}) as any;
  if(p===(point==="observe"?"observeChatWebRead":"readChatWebReadCache"))throw new Error("ACK lost");return original(p);
 });
 expect(await f.run()).toEqual(output);expect(preparations).toBe(2);expect(f.readDocument).toHaveBeenCalledTimes(point==="observe"?1:0);
 expect(f.call.mock.calls.filter(c=>c[0]==="readChatWebReadCache")).toHaveLength(1);
 expect(f.call.mock.calls.filter(c=>c[0]==="observeChatWebRead")).toHaveLength(point==="observe"?1:0);
});
it.each(["absent","changed","url","missing-ref","read-lost","cache-observation"])("ACK 对账 %s 时不采信或重放",async variant=>{
 const f=fixture();let preparations=0;const original=f.call.getMockImplementation()!;
 f.call.mockImplementation(async p=>{
  if(p==="prepareChatWebRead" && preparations++>0){
   if(variant==="read-lost")throw new Error("read ACK lost");
   return {url:variant==="url"?"https://other.example/":"https://example.com/bound",observation:variant==="absent"?null:variant==="changed"?{...read,turnCount:4}:read,evidenceRef:variant==="missing-ref"?null:"stored"} as any;
  }
  if(p===(variant==="cache-observation"?"readChatWebReadCache":"observeChatWebRead"))throw new Error("ACK lost");return original(p);
 });
 await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});expect(preparations).toBe(2);
 expect(f.call.mock.calls.some(c=>["completeChatWebRead","failChatWebRead","restoreChatWebRead"].includes(c[0]))).toBe(false);
});
it("观察 ACK 丢失时已取消，不发起对账或完成",async()=>{
 const f=fixture(),controller=new AbortController();let preparations=0;const original=f.call.getMockImplementation()!;
 f.call.mockImplementation(async p=>{if(p==="prepareChatWebRead")preparations++;if(p==="observeChatWebRead"){controller.abort();throw new Error("lost during cancel");}return original(p);});
 await expect(runChatWebReadInWorker("parent",controller.signal,f)).rejects.toThrow();expect(preparations).toBe(1);
 expect(f.call.mock.calls.some(c=>["completeChatWebRead","failChatWebRead"].includes(c[0]))).toBe(false);
});
