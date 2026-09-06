import {expect,it,vi} from "vitest";
import {createServer} from "node:http";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
const fixture=vi.hoisted(()=>({origin:"",executors:[] as Array<{browserProcessIds():number[]}>}));
vi.mock("./research-worker-tools",async importOriginal=>{
 const original=await importOriginal<typeof import("./research-worker-tools")>();
 return {...original,createResearchWorkerTools:(deps:Parameters<typeof original.createResearchWorkerTools>[0])=>{
  const executor=original.createResearchWorkerTools({...deps,guardUrl:async url=>{if(new URL(url).origin!==fixture.origin)throw new Error("测试只允许本地站点");}});
  fixture.executors.push(executor);return executor;
 }};
});
import {createChatWebReadResources} from "./chat-web-read-resources";

it.each(["read","cancel"] as const)("真实 Chromium 对话网页资源：%s",async mode=>{
 fixture.executors=[];let reached!:()=>void;const requested=new Promise<void>(resolve=>{reached=resolve;});
 const server=createServer((_req,res)=>{reached();if(mode==="cancel")return;res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(`<html><head><title>网页资源实测</title></head><body><article><h1>网页资源实测</h1><p>${"用于验证对话 Worker 真实网页读取和退出的正文。".repeat(100)}</p></article></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));fixture.origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const url=`${fixture.origin}/page`,controller=new AbortController();
 const output={status:"ok",summary:"已保存",evidence:[],data:{assetId:"fixture-host-asset"},error:null,continuation:null,sideEffect:"committed"};
 const call=vi.fn(async(port:WorkerPort,_input:unknown)=>{
  if(port==="prepareChatWebRead")return {url,observation:null,evidenceRef:null};
  if(port==="readChatWebReadCache")return {status:"miss"};
  if(port==="readChatWebReadSession")return {domain:"127.0.0.1",stateJson:null,revision:null};
  if(port==="saveChatWebReadSession")return {saved:true,revision:"fixture"};
  if(port==="observeChatWebRead")return {};
  if(port==="completeChatWebRead")return output;
  throw new Error(`未预期的端口 ${port}`);
 });
 const resources=createChatWebReadResources(controller.signal,call);
 try{
  const pending=resources.run("parent",controller.signal);
  if(mode==="cancel"){
   const rejected=expect(pending).rejects.toThrow();await requested;controller.abort();await rejected;
   expect(call.mock.calls.some(c=>["observeChatWebRead","completeChatWebRead","saveChatWebReadSession"].includes(c[0]))).toBe(false);
  }else{
   expect(await pending).toEqual(output);
   expect(call).toHaveBeenCalledWith("observeChatWebRead",expect.objectContaining({callId:"parent",observation:expect.objectContaining({text:expect.stringContaining("真实网页读取和退出"),finalUrl:url})}),expect.any(AbortSignal));
   expect(call.mock.calls.some(c=>c[0]==="saveChatWebReadSession")).toBe(true);
  }
  expect(fixture.executors).toHaveLength(1);const pids=fixture.executors[0]!.browserProcessIds();expect(pids.length).toBeGreaterThan(0);
  await resources.close();for(const pid of pids)expect(()=>process.kill(pid,0)).toThrow();
 }finally{await resources.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
