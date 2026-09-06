import {z} from "zod";
import {agenticToolOutcomeSchema,chatWebReadSearchSpecSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {searchWeb,type SearchProviderRegistry} from "../runtime/search-factory";
import {createBochaAdapter} from "../runtime/search-bocha";
import {createTavilyAdapter} from "../runtime/search-tavily";
import {createSerpapiAdapter} from "../runtime/search-serpapi";
import type {AlternateSearcher} from "../runtime/browser/web-read-fallback";
import {runChatWebReadInWorker} from "./chat-web-read-worker";
import {GenerationFailure} from "./generation-error";

const configuration=z.object({configured:chatWebReadSearchSpecSchema.nullable()}).strict();
const session=z.object({domain:z.string().min(1),stateJson:z.string().nullable(),revision:z.string().nullable()}).strict();
const sessionReply=z.union([session,z.object({status:z.literal("blocked"),outcome:agenticToolOutcomeSchema}).strict()]);
function privateParse<T>(schema:z.ZodType<T>,value:unknown):T{
 try{return schema.parse(value);}catch{throw new GenerationFailure("unknown_result","CHAT_WEB_READ_PRIVATE_RECEIPT_UNKNOWN");}
}
const resources=new Set<{close():Promise<void>}>();
type HostCall=(port:WorkerPort,input:unknown,signal?:AbortSignal)=>Promise<unknown>;

/** 同一对话共用浏览器执行器；配置与登录态始终绑定当前真实网页父调用。 */
export function createChatWebReadResources(parentSignal:AbortSignal,call:HostCall,registry:SearchProviderRegistry={bocha:createBochaAdapter(),tavily:createTavilyAdapter(),serpapi:createSerpapiAdapter()}){
 parentSignal.throwIfAborted();
 const stop=new AbortController(),signal=AbortSignal.any([parentSignal,stop.signal]);
 let pending:Promise<ReturnType<typeof import("./research-worker-tools").createResearchWorkerTools>>|undefined;
 let closing:Promise<void>|undefined;
 const privateCall=async(port:WorkerPort,input:unknown,requestSignal:AbortSignal)=>{
  requestSignal.throwIfAborted();
  try{const result=await call(port,input,requestSignal);requestSignal.throwIfAborted();return result;}
  catch{requestSignal.throwIfAborted();throw new GenerationFailure("unknown_result","CHAT_WEB_READ_PRIVATE_RECEIPT_UNKNOWN");}
 };
 const executor=()=>pending??=(async()=>{
  signal.throwIfAborted();const {createResearchWorkerTools}=await import("./research-worker-tools");signal.throwIfAborted();
  return createResearchWorkerTools({signal,call,sessionAccess:{
   read:async(callId,requestSignal)=>privateParse(sessionReply,await privateCall("readChatWebReadSession",{callId},requestSignal)),
   save:(input,requestSignal)=>privateCall("saveChatWebReadSession",input,requestSignal),
  }});
 })();
 const resource={
  async run(callId:string,toolSignal:AbortSignal){
   const combined=AbortSignal.any([signal,toolSignal]);combined.throwIfAborted();
   return runChatWebReadInWorker(callId,combined,{call,
    readDocument:async(url,scope)=>(await executor()).readDocument(url,scope),
    async searchers(){
     const {configured}=privateParse(configuration,await privateCall("resolveChatWebReadSearch",{callId},combined));
     const searchers:AlternateSearcher[]=[];
     if(configured && configured.provider!=="rss" && configured.provider!=="browser")searchers.push((query,count)=>searchWeb(configured,query,registry,{count,signal:combined}));
     for(const baseUrl of [null,"https://www.baidu.com/s?wd={q}"])searchers.push(async(query,count)=>(await executor()).searchBrowser({baseUrl,query,count},{callId,signal:combined}));
     return searchers;
    },
    async hasSession(domain){
     const state=privateParse(session,await privateCall("readChatWebReadSession",{callId},combined));
     if(state.domain!==domain)throw new GenerationFailure("unknown_result","CHAT_WEB_READ_SESSION_OWNER_MISMATCH");
     return state.stateJson!==null;
    },
   });
  },
  close(){return closing??=(async()=>{
   stop.abort();parentSignal.removeEventListener("abort",onAbort);
   try{await (await pending)?.close();}finally{resources.delete(resource);}
  })();},
 };
 const onAbort=()=>{void resource.close().catch(()=>{});};
 resources.add(resource);parentSignal.addEventListener("abort",onAbort,{once:true});
 return resource;
}
export async function closeChatWebReadResources(){await Promise.all([...resources].map(resource=>resource.close()));}
