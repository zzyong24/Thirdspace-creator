// 仅测试入口：页面/浏览器context为内存fixture；Pi、搜索解析、Readability和全部IPC走生产实现。
import {appendFileSync} from "node:fs";
import {join} from "node:path";
type ResearchDeps = Parameters<typeof createResearchWorkerTools>[0];
type Browser = Awaited<ReturnType<NonNullable<ResearchDeps["connect"]>>>;
type BrowserServer = Awaited<ReturnType<NonNullable<ResearchDeps["launchServer"]>>>;
import {createExecutionWorker} from "../../../../ai-worker/src/execution/worker-runtime";
import {runAgenticInWorker} from "../../../../ai-worker/src/execution/agentic-worker-run";
import {createResearchWorkerTools} from "../../../../ai-worker/src/execution/research-worker-tools";
import {isPiAgenticRuntimeAvailable} from "../../../../ai-worker/src/runtime/agentic/pi-engine";
const sourceUrl="https://research.example.com/article";
const title="受控调研网页";
const text="首窗可核实事实：这是内存网页fixture。"+"调研正文素材。".repeat(2100)+"尾窗可核实事实：分页必须保留来源。";
const article=`<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${text}</p></article></body></html>`;
const search=`<html><body><ol id="b_results"><li class="b_algo"><h2><a href="${sourceUrl}">${title}</a></h2><div class="b_caption"><p>这是受控网页来源。</p></div></li></ol></body></html>`;
const trace=(data:unknown)=>appendFileSync(join(__dirname,"trace.ndjson"),JSON.stringify({pid:process.pid,...data as object})+"\n");
async function main(){
 if(!process.send || !await isPiAgenticRuntimeAvailable())throw new Error("PI_UNAVAILABLE");
 const resources=new Set<ReturnType<typeof createResearchWorkerTools>>();
 const worker=createExecutionWorker({capabilities:["agentic.run"],generate:async()=>{throw new Error("wrong capability");},
  runAgentic:async(input,model,signal,call,onText)=>{
   const browser={isConnected:()=>true,
    newContext:async(options?:{storageState?:unknown})=>{
     trace({type:"context",hasFixtureCookie:JSON.stringify(options?.storageState ?? null).includes("fixture-private-cookie")});
     return {route:async()=>{},routeWebSocket:async()=>{},close:async()=>{trace({type:"context-close"});},storageState:async()=>options?.storageState ?? {cookies:[],origins:[]},newPage:async()=>{
      let current="about:blank";
      return {goto:async(url:string)=>{current=url;trace({type:"navigation",url});return {status:()=>200,url:()=>url,request:()=>({url:()=>url,redirectedFrom:()=>null})};},url:()=>current,content:async()=>current!==sourceUrl?search:article,title:async()=>title,screenshot:async()=>Buffer.from("fixture"),evaluate:async()=>undefined,waitForTimeout:async()=>{},waitForSelector:async()=>{}};
     }};
    },close:async()=>{trace({type:"browser-close"});},
   };
   const tools=createResearchWorkerTools({signal,call,launchServer:async()=>({process:()=>({}),wsEndpoint:()=>"ws://memory-fixture",close:async()=>{trace({type:"server-close"});}} as BrowserServer),connect:async()=>browser as unknown as Browser,
    guardUrl:async(url)=>{const parsed=new URL(url);if(!["https://www.bing.com","https://www.baidu.com"].includes(parsed.origin) && parsed.href!==sourceUrl)throw new Error("禁止fixture之外的URL");},
   });resources.add(tools);
   try{return await runAgenticInWorker(input,model,signal,call,onText,tools);}finally{await tools.close();resources.delete(tools);}
  },
  send(message){if(message.type==="call")trace({type:"ipc",port:message.port});if(process.connected)process.send!(message);},
 });
 process.on("message",message=>worker.receive(message));
 const stop=async()=>{worker.close();await Promise.all([...resources].map(item=>item.close()));process.exit(0);};
 process.on("disconnect",()=>{void stop();});process.on("SIGTERM",()=>{void stop();});worker.ready();
}
void main().catch(error=>{trace({type:"startup-error",message:String(error)});process.exit(78);});
