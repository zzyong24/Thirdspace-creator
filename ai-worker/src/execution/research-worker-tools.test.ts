import { expect, it, vi } from "vitest";
import { createResearchWorkerTools } from "./research-worker-tools";
import type { Browser, BrowserServer, BrowserContext } from "@playwright/test";
import { WebReaderLoginRequiredError } from "../runtime/browser/web-reader";
import { createServer } from "node:http";
const outcome={status:"ok",summary:"窗口",evidence:[{sourceUrl:"https://example.com",text:"正文"}],data:{text:"正文"},error:null,continuation:null,sideEffect:"none"};
function fixture(){
  const controller=new AbortController();
  const ctx={close:vi.fn(async()=>{}),route:vi.fn(async()=>{}),routeWebSocket:vi.fn(async()=>{}),storageState:vi.fn(async()=>({cookies:[],origins:[]})),newPage:vi.fn()};
  const browser={isConnected:vi.fn(()=>true),newContext:vi.fn(async()=>ctx as unknown as BrowserContext),close:vi.fn(async()=>{})};
  const server={process:()=>({pid:12345}),wsEndpoint:()=>"ws://local-fixture",close:vi.fn(async()=>{})};
  const call=vi.fn(async(port:string)=>port==="readBrowserSession"?{domain:"example.com",stateJson:JSON.stringify({cookies:[],origins:[]}),revision:"version-private"}:port==="saveBrowserSession"?{saved:false,revision:"new-version"}:outcome);
  const read=vi.fn(async(_url:unknown,_opts:unknown,deps:unknown)=>{
    const opened=await (deps as {openContext:()=>Promise<{close():Promise<void>}>}).openContext();await opened.close();
    return {text:"正文",title:"标题",finalUrl:"https://example.com",extractor:"readability" as const,extractPath:"readability" as const,turnCount:null};
  });
  const launchServer=vi.fn(async()=>server as unknown as BrowserServer);
  const tools=createResearchWorkerTools({call,signal:controller.signal,launchServer,connect:async()=>browser as unknown as Browser,guardUrl:async()=>{},read});
  return {tools,call,read,ctx,browser,server,launchServer,controller};
}
it("已取消的研究工具不启动浏览器或调用宿主",async()=>{
  const call=vi.fn(),launchServer=vi.fn();const signal=AbortSignal.abort();
  const tools=createResearchWorkerTools({call,signal,launchServer});
  await expect(tools.execute("web.search",{query:"研究"},{callId:"call",signal})).rejects.toThrow();
  await tools.close();expect(call).not.toHaveBeenCalled();expect(launchServer).not.toHaveBeenCalled();
});
it("首读在Worker执行，CAS冲突仍返回正文，session与revision不进入工具结果",async()=>{
  const f=fixture();try{
    expect(await f.tools.execute("web.read",{url:"https://example.com"},{callId:"read",signal:f.controller.signal})).toEqual(outcome);
    expect(f.read).toHaveBeenCalledTimes(1);expect(f.ctx.route).toHaveBeenCalled();expect(f.ctx.routeWebSocket).toHaveBeenCalled();
    expect(f.call.mock.calls.map(row=>row[0])).toEqual(["readBrowserSession","saveBrowserSession","settleResearchRead"]);
    expect(f.tools.browserProcessIds()).toEqual([12345]);
    expect(JSON.stringify(outcome)).not.toContain("version-private");
  }finally{await f.tools.close();}
  expect(f.ctx.close).toHaveBeenCalled();expect(f.browser.close).toHaveBeenCalled();expect(f.server.close).toHaveBeenCalled();
});
it("快照续读只调用host证据窗口，不读取登录态也不启动浏览器",async()=>{
  const f=fixture();try{
    expect(await f.tools.execute("web.read",{url:"https://example.com",snapshotId:"snapshot"},{callId:"read",signal:f.controller.signal})).toEqual(outcome);
    expect(f.launchServer).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();expect(f.call.mock.calls.map(row=>row[0])).toEqual(["executeEvidenceRead"]);
  }finally{await f.tools.close();}
});
it("首次浏览器启动失败后下一已授权工具调用可重新启动",async()=>{
  const f=fixture();f.launchServer.mockRejectedValueOnce(new Error("启动瞬态失败"));
  try{
    expect(await f.tools.execute("web.read",{url:"https://example.com"},{callId:"first",signal:f.controller.signal})).toMatchObject({status:"error",error:{code:"transient"}});
    expect(await f.tools.execute("web.read",{url:"https://example.com"},{callId:"second",signal:f.controller.signal})).toEqual(outcome);expect(f.launchServer).toHaveBeenCalledTimes(2);
  }finally{await f.tools.close();}
});
it("浏览器断线后只在下一已授权工具调用重新启动",async()=>{
  const f=fixture();try{
    await f.tools.execute("web.read",{url:"https://example.com"},{callId:"first",signal:f.controller.signal});
    f.browser.isConnected.mockReturnValueOnce(false);
    expect(await f.tools.execute("web.read",{url:"https://example.com"},{callId:"second",signal:f.controller.signal})).toEqual(outcome);
    expect(f.launchServer).toHaveBeenCalledTimes(2);expect(f.read).toHaveBeenCalledTimes(2);
  }finally{await f.tools.close();}
});
it("launch期间取消会关闭迟到server且不connect",async()=>{
  const controller=new AbortController();let resolve!:(server:BrowserServer)=>void;
  const launched=new Promise<BrowserServer>(done=>{resolve=done;});const connect=vi.fn();const close=vi.fn(async()=>{});
  const launchServer=vi.fn(()=>launched);
  const tools=createResearchWorkerTools({call:vi.fn(),signal:controller.signal,launchServer,connect});
  const run=tools.execute("web.search",{query:"查询"},{callId:"search",signal:controller.signal});const rejected=expect(run).rejects.toThrow();
  await vi.waitFor(()=>expect(launchServer).toHaveBeenCalledTimes(1));
  controller.abort();resolve({process:()=>({pid:2}),wsEndpoint:()=>"ws://fixture",close} as unknown as BrowserServer);
  await rejected;await tools.close();expect(close).toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();
});
it("登录墙返回可持久blocked，同域不重复访问",async()=>{
  const f=fixture();f.read.mockRejectedValue(new WebReaderLoginRequiredError("example.com"));
  try{for(let i=0;i<2;i++)expect(await f.tools.execute("web.read",{url:"https://example.com"},{callId:`read-${i}`,signal:f.controller.signal})).toMatchObject({status:"blocked",error:{code:"needs_login",retryable:false}});expect(f.read).toHaveBeenCalledTimes(1);}finally{await f.tools.close();}
});
it("host读取结算回执丢失不可伪装网页瞬态失败",async()=>{
  const f=fixture();const original=f.call.getMockImplementation()!;
  f.call.mockImplementation(async(port:string)=>{if(port==="settleResearchRead")throw new Error("receipt lost");return original(port);});
  try{await expect(f.tools.execute("web.read",{url:"https://example.com"},{callId:"read",signal:f.controller.signal})).rejects.toMatchObject({outcome:"unknown_result"});}finally{await f.tools.close();}
});
it("newContext挂起时取消先关闭browser，不能等资源创建完成才释放连接",async()=>{
  const controller=new AbortController();let began!:()=>void;const started=new Promise<void>(done=>{began=done;});let rejectContext!:(error:Error)=>void;
  const browser={newContext:()=>{began();return new Promise((_resolve,reject)=>{rejectContext=reject;});},close:vi.fn(async()=>{rejectContext?.(new Error("closed"));})};
  const server={process:()=>({pid:321}),wsEndpoint:()=>"ws://fixture",close:vi.fn(async()=>{})};
  const tools=createResearchWorkerTools({call:vi.fn(),signal:controller.signal,launchServer:async()=>server as unknown as BrowserServer,connect:async()=>browser as unknown as Browser});
  const run=tools.execute("web.search",{query:"查询"},{callId:"search",signal:controller.signal});const failed=expect(run).rejects.toThrow();await started;
  controller.abort();await tools.close();await failed;expect(browser.close).toHaveBeenCalled();
});
it("真实临时Chromium首读本地fixture并关闭，不把session带入观察回执",async()=>{
  const page=createServer((_req,res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(`<html><head><title>Worker真实阅读</title></head><body><article><h1>Worker真实阅读</h1><p>${"这是用于本地浏览器集成测试的正文。".repeat(80)}</p></article></body></html>`);});
  await new Promise<void>(done=>page.listen(0,"127.0.0.1",done));
  const url=`http://127.0.0.1:${(page.address() as {port:number}).port}`;const signal=new AbortController().signal;
  const observations:unknown[]=[];
  const tools=createResearchWorkerTools({signal,guardUrl:async(target)=>{if(new URL(target).origin!==url)throw new Error("fixture之外不允许访问");},call:async(port,input)=>{
    if(port==="readBrowserSession")return {domain:"127.0.0.1",stateJson:null,revision:null};
    if(port==="saveBrowserSession")return {saved:true,revision:"fixture-revision"};
    if(port==="settleResearchRead"){observations.push(input);return outcome;}
    throw new Error("unexpected port");
  }});
  try{
    expect(await tools.execute("web.read",{url},{callId:"real-read",signal})).toEqual(outcome);
    expect(observations).toHaveLength(1);expect(JSON.stringify(observations)).toContain("这是用于本地浏览器集成测试的正文");
    expect(JSON.stringify(observations)).not.toContain("stateJson");expect(tools.browserProcessIds().length).toBeGreaterThan(0);
  }finally{await tools.close();page.closeAllConnections();await new Promise<void>(done=>page.close(()=>done()));}
},30000);
