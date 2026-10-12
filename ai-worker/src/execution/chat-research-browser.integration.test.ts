import {expect,it,vi} from "vitest";
import {chromium,type Browser,type BrowserContext} from "@playwright/test";
import {launchWithBrowser} from "../runtime/browser/browser-launch";
import {createResearchWorkerTools} from "./research-worker-tools";
import {runChatResearchInWorker} from "./chat-research-worker";
it("真实浏览器解析搜索页并切换空来源，结果沿聊天观察协议结算",async()=>{
 const visited:string[]=[];let browser:Browser|undefined;
 const server=await launchWithBrowser(selection=>chromium.launchServer({...selection,headless:true}));
 const call=vi.fn(async(port:string,raw:unknown)=>{
  if(port==="prepareChatResearch")return {available:true,query:"原查询 原材料",count:10};
  expect(port).toBe("settleChatResearch");
  expect(raw).toMatchObject({observation:{status:"ok",results:[{title:"真实测试页面",url:"https://example.com/source",snippet:"真实测试摘要"}]}});
  return {status:"ok",summary:"结算完成",evidence:[],data:{kind:"material.gather",items:[]},error:null,continuation:null,sideEffect:"none"};
 });
 const controller=new AbortController();
 const research=createResearchWorkerTools({signal:controller.signal,call,guardUrl:async()=>{},launchServer:async()=>server,connect:async endpoint=>{
  browser=await chromium.connect(endpoint);
  // 明确测试传输替身：真实 Chromium 和搜索解析器读取固定 HTML，不访问外部搜索站。
  return new Proxy(browser,{get(target,key){if(key==="newContext")return async(...args:Parameters<Browser["newContext"]>)=>{
   const context=await target.newContext(...args);
   return new Proxy(context,{get(ctx,prop){if(prop==="route")return async(pattern:Parameters<BrowserContext["route"]>[0])=>ctx.route(pattern,async route=>{
    const url=route.request().url();visited.push(url);
    await route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:url.includes("duckduckgo.com")?'<html><body><div class="result"><h2><a class="result__a" href="https://example.com/source">真实测试页面</a></h2><a class="result__snippet">真实测试摘要</a></div></body></html>':'<html><body>没有匹配项</body></html>'});
   });const value=Reflect.get(ctx,prop,ctx);return typeof value==="function"?value.bind(ctx):value;}});
  };const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 }});
 try{
  await runChatResearchInWorker("search",controller.signal,call,research);
  expect(visited.some(url=>url.includes("baidu.com"))).toBe(true);expect(visited.some(url=>url.includes("duckduckgo.com"))).toBe(true);
  expect(visited.every(url=>decodeURIComponent(url.replaceAll("+"," ")).includes("原查询 原材料"))).toBe(true);
 }finally{await research.close();await server.close();}
 expect(browser?.isConnected()).toBe(false);
},180000);
