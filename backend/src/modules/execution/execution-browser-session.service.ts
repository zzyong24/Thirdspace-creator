import { z } from "zod";
import { getDomain } from "tldts";
import { and, asc, eq, aiTasks, executionCalls, type Db } from "@creatoros/backend";
import { workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { assertSafeWebDomain, webDomainFromUrl, webSessionLookupDomains } from "@creatoros/ai-worker/browser/web-domain";
import type { BrowserSessionsService } from "../browser-sessions";
import { createAgenticToolBinding, type AgenticBackendTool } from "./agentic-tool-binding";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";

type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
const readSchema=workerPortInputSchemas.readBrowserSession;
const saveSchema=workerPortInputSchemas.saveBrowserSession;
const cookieSchema=z.object({name:z.string(),value:z.string(),domain:z.string().min(1),path:z.string().startsWith("/"),expires:z.number().finite().optional(),httpOnly:z.boolean().optional(),secure:z.boolean().optional(),sameSite:z.enum(["Strict","Lax","None"]).optional(),partitionKey:z.string().optional()}).strict();
const stateSchema=z.object({cookies:z.array(cookieSchema).max(10000),origins:z.array(z.object({origin:z.string(),localStorage:z.array(z.object({name:z.string(),value:z.string()}).strict()).max(10000)}).strict()).max(1000)}).strict();

/** 验证浏览器状态形状及域边界；只验证权限和结构，不推断登录状态。 */
export function validateBrowserStorageState(stateJson:string,targetUrl:URL,canonical:string):void {
  if(Buffer.byteLength(stateJson,"utf8")>2*1024*1024)throw new ConflictError("网站登录态超过2MB上限");
  let state:z.infer<typeof stateSchema>;
  try{state=stateSchema.parse(JSON.parse(stateJson));}catch{throw new ConflictError("网站登录态不是合法的cookies/origins结构");}
  const normalize=(host:string)=>assertSafeWebDomain(host.toLowerCase());
  const withinIdentity=(host:string)=>host===canonical || host.endsWith(`.${canonical}`) || (canonical==="douyin.com" && webDomainFromUrl(`https://${host}`)===canonical);
  const targetHost=normalize(targetUrl.hostname),targetRegistered=getDomain(targetHost,{allowPrivateDomains:true});
  for(const cookie of state.cookies){
    const domain=normalize(cookie.domain.replace(/^\./,""));
    const registered=getDomain(domain,{allowPrivateDomains:true});
    const parent=targetHost.endsWith(`.${domain}`) && registered!==null && registered===targetRegistered;
    if(!registered || (!withinIdentity(domain) && !parent))throw new ConflictError("网站登录态包含未授权域的cookie");
    if(cookie.partitionKey){
      let partition:URL;try{partition=new URL(cookie.partitionKey);}catch{throw new ConflictError("cookie分区来源不合法");}
      if(!["http:","https:"].includes(partition.protocol) || !withinIdentity(normalize(partition.hostname)))throw new ConflictError("cookie分区属于未授权域");
    }
  }
  for(const origin of state.origins){
    let parsed:URL;try{parsed=new URL(origin.origin);}catch{throw new ConflictError("登录态origin不合法");}
    if(!["http:","https:"].includes(parsed.protocol) || parsed.origin!==origin.origin || !withinIdentity(normalize(parsed.hostname)))throw new ConflictError("网站登录态包含未授权的origin");
  }
}

/** 命名短端口：只消费当前started web.read的冻结URL，不接受调用者自报域名、用户或profile路径。 */
export function createExecutionBrowserSessionService(db:Db,deps:{tools:Record<string,AgenticBackendTool>;budget:Parameters<typeof createExecutionCallLedgerService>[1]["budget"];now?:()=>string;sessions:Pick<BrowserSessionsService,"getStateVersioned"|"saveStateVersioned">}){
  const leases=createExecutionLeaseService(db,deps),bindings=createAgenticToolBinding(deps.tools);
  async function scoped<T>(ref:ExecutionRef,callId:string,action:(scope:{tx:Transaction;context:import("@creatoros/contract").RequestContext;domain:string;url:URL})=>Promise<T>):Promise<T>{
    return leases.withLease(ref,"admission",async({tx,task,context})=>{
      if(task.kind!=="ai_task" || task.ownerType!=="ai_task")throw new ConflictError("浏览器会话缺少AI执行归属");
      const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
      if(!business || !["queued","running"].includes(business.status))throw new ConflictError("浏览器会话的AI归属映射或状态不符");
      const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
      const call=calls.find(candidate=>candidate.id===callId);if(!call || call.status!=="started" || call.startedAttempt!==ref.attempt || call.toolExecutionClaimId)throw new ConflictError("浏览器调用未获当前独占执行许可");
      const bound=bindings.forCall(task,calls,call);
      if(bound.toolName!=="web.read" || bound.effect!=="none" || bound.validationOutcome)throw new ConflictError("会话端口仅允许合法的冻结web.read调用");
      if(calls.filter(row=>row.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合不能读写网站登录态");
      const {url:raw}=z.object({url:z.string().min(1)}).parse(bound.input);
      const url=new URL(raw);
      if(!["http:","https:"].includes(url.protocol) || url.username || url.password)throw new ConflictError("浏览器请求URL不合法");
      const domain=assertSafeWebDomain(webDomainFromUrl(raw));
      return action({tx,context,domain,url});
    });
  }
  async function findState(context:import("@creatoros/contract").RequestContext,domain:string,tx:Transaction){
    for(const key of webSessionLookupDomains(domain)){
      const record=await deps.sessions.getStateVersioned(context,key,tx);
      // 损坏/不可解密记录也有revision，不能穿过它读取旧alias或当作空记录覆盖。
      if(record.revision!==null)return {key,...record};
    }
    return {key:domain,stateJson:null,revision:null};
  }
  return {
    async read(ref:ExecutionRef,raw:unknown){const {callId}=readSchema.parse(raw);return scoped(ref,callId,async({tx,context,domain,url})=>{
      const record=await findState(context,domain,tx);
      if(record.stateJson!==null)validateBrowserStorageState(record.stateJson,url,domain);
      return {domain,stateJson:record.stateJson,revision:record.revision};
    });},
    async save(ref:ExecutionRef,raw:unknown){const request=saveSchema.parse(raw);return scoped(ref,request.callId,async({tx,context,domain,url})=>{
      validateBrowserStorageState(request.stateJson,url,domain);
      const record=await findState(context,domain,tx);
      if(record.revision!==request.revision || (record.revision!==null && record.stateJson===null))return {saved:false,revision:record.revision};
      return deps.sessions.saveStateVersioned(context,record.key,request.stateJson,request.revision,tx);
    });},
  };
}
