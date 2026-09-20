import "server-only";
import {randomUUID} from "node:crypto";
import type {Db} from "@creatoros/backend";
import {createExecutionLeaseService,createWorkbenchBrowserAdmissionService} from "@creatoros/backend/modules/execution";
import type {ChatProductionCompositionDeps} from "@creatoros/backend/modules/ai-runtime";
import {workbenchCapabilitySchema,workbenchHostCallSchema,workbenchResultSchema,type WorkbenchResult} from "@creatoros/contract/agent-workbench";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import {BrowserSocketError,exchangeBrowserSocket,resolveManagedBrowserProfile,type ManagedBrowserMode} from "./workbench-browser-client";

type Host=NonNullable<ChatProductionCompositionDeps["workbenchHost"]>;
const browserTools=["browser.open","browser.status","browser.navigate","browser.observe","browser.extract",
 "browser.screenshot","browser.act","browser.close"] as const;
type BrowserTool=typeof browserTools[number];
type BrowserInput={laneId:string;mode?:ManagedBrowserMode;domain?:string;browserEpoch?:number;url?:string;
 action?:string;input?:Record<string,unknown>;targetId?:string;frameId?:string;refGeneration?:number};
function validId(value:unknown){return typeof value==="string"&&value.length>0&&value.length<=128&&!/[\x00-\x1f]/.test(value);}
function validEpoch(value:unknown){return Number.isSafeInteger(value)&&Number(value)>0;}
function parseInput(name:BrowserTool,raw:unknown):BrowserInput|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const input=raw as Record<string,unknown>;
 if(!validId(input.laneId))return null;
 const allowed=name==="browser.open"?["laneId","mode","domain"]:name==="browser.status"?["laneId"]:
  name==="browser.navigate"?["laneId","browserEpoch","url"]:name==="browser.act"?
   ["laneId","browserEpoch","action","input","targetId","frameId","refGeneration"]:["laneId","browserEpoch"];
 if(Object.keys(input).some(key=>!allowed.includes(key)))return null;
 if(name==="browser.open"){
  if(!["primary","anonymous"].includes(String(input.mode))||typeof input.domain!=="string"||!input.domain||input.domain.length>253)return null;
 }else if(name!=="browser.status"&&!validEpoch(input.browserEpoch))return null;
 if(name==="browser.navigate"&&(typeof input.url!=="string"||!input.url||input.url.length>4096))return null;
 if(name==="browser.act"){
  if(!["click","hover","type","set_value","select_option","press_key","scroll"].includes(String(input.action))||
    !input.input||typeof input.input!=="object"||Array.isArray(input.input)||
    (input.targetId!==undefined&&!validId(input.targetId))||(input.frameId!==undefined&&!validId(input.frameId))||
    (input.refGeneration!==undefined&&(!Number.isSafeInteger(input.refGeneration)||Number(input.refGeneration)<0)))return null;
 }
 return input as BrowserInput;
}
const description:Record<BrowserTool,string>={
 "browser.open":"为当前任务打开受控浏览器 Lane。仅支持已验证的主身份或独立匿名身份。",
 "browser.status":"查看当前任务浏览器 Lane 的状态。",
 "browser.navigate":"在已授权站点域内导航当前 Lane。",
 "browser.observe":"读取当前 Lane 的页面结构并取得新元素引用。",
 "browser.extract":"从当前 Lane 提取页面文本。",
 "browser.screenshot":"截取当前 Lane 的页面画面。",
 "browser.act":"在当前 Lane 操作页面元素；重要外部操作仍受工具效果门控。",
 "browser.close":"关闭当前任务的指定 Lane。",
};
const properties={laneId:{type:"string",minLength:1,maxLength:128},browserEpoch:{type:"integer",minimum:1}};
const inputSchema:Record<BrowserTool,Record<string,unknown>>={
 "browser.open":{type:"object",properties:{laneId:properties.laneId,mode:{type:"string",enum:["primary","anonymous"]},domain:{type:"string",minLength:1,maxLength:253}},required:["laneId","mode","domain"],additionalProperties:false},
 "browser.status":{type:"object",properties:{laneId:properties.laneId},required:["laneId"],additionalProperties:false},
 "browser.navigate":{type:"object",properties:{...properties,url:{type:"string",format:"uri",maxLength:4096}},required:["laneId","browserEpoch","url"],additionalProperties:false},
 "browser.observe":{type:"object",properties,required:["laneId","browserEpoch"],additionalProperties:false},
 "browser.extract":{type:"object",properties,required:["laneId","browserEpoch"],additionalProperties:false},
 "browser.screenshot":{type:"object",properties,required:["laneId","browserEpoch"],additionalProperties:false},
 "browser.act":{type:"object",properties:{...properties,action:{type:"string",enum:["click","hover","type","set_value","select_option","press_key","scroll"]},input:{type:"object"},targetId:properties.laneId,frameId:properties.laneId,refGeneration:{type:"integer",minimum:0}},required:["laneId","browserEpoch","action","input"],additionalProperties:false},
 "browser.close":{type:"object",properties,required:["laneId","browserEpoch"],additionalProperties:false},
};
const catalog=browserTools.map(name=>workbenchCapabilitySchema.parse({name,schemaVersion:1,
 description:description[name],inputSchema:inputSchema[name],resultSchema:{type:"object"},
 effects:[name==="browser.act"?"external_write":name==="browser.open"||name==="browser.close"?"process":"read"],
 requiredCapabilities:["task.browser"],platforms:["macos"]}));

type Receipt=Awaited<ReturnType<ReturnType<typeof createWorkbenchBrowserAdmissionService>["acquire"]>>;
type NativeAdmission={userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string;domain:string;
 profileKey:string;profileLeaseId:string;laneName:string;expiresAtMs:number};
type Session={ref:ExecutionRef;receipt:Receipt;mode:ManagedBrowserMode;admission:NativeAdmission};
function result(operationId:string,value:unknown):WorkbenchResult{return workbenchResultSchema.parse({operationId,status:"succeeded",
 artifactRefs:[],progressCursor:null,content:[{type:"text",text:JSON.stringify(value??null)}]});}
function failed(operationId:string,code:string,dispatched=false):WorkbenchResult{
 const unknown=dispatched && code==="BROWSER_RESULT_UNKNOWN";
 return workbenchResultSchema.parse({operationId,status:unknown?"unknown":"failed",artifactRefs:[],progressCursor:null,
  error:{code:code.toLowerCase().slice(0,160),dispatched,retryable:false,
   nextAction:dispatched?"reconcile":code==="BROWSER_PROFILE_BUSY"?"wait":"fix_input"}});
}
function sameRef(a:ExecutionRef,b:ExecutionRef){return a.executionTaskId===b.executionTaskId&&a.attempt===b.attempt&&a.fenceToken===b.fenceToken;}
function withinDomain(url:string,domain:string){
 try {const parsed=new URL(url);return (parsed.protocol==="https:"||parsed.protocol==="http:")&&
  !parsed.username&&!parsed.password&&(!parsed.port||parsed.port==="443"||parsed.port==="80")&&
  (parsed.hostname===domain||parsed.hostname.endsWith(`.${domain}`));}catch{return false;}
}

/** 浏览器能力仅在真正有 Mac 私有 socket 时装配；不从模型输入接受账号、目录或 profileKey。 */
export function createWorkbenchBrowserHost(db:Db,options:{platform?:NodeJS.Platform;desktop?:boolean;socketPath?:string;
 now?:()=>string}={}):Host|undefined{
 const platform=options.platform??process.platform,desktop=options.desktop??process.env.CREATOROS_DESKTOP==="1";
 const socketPath=options.socketPath??process.env.CREATOROS_WORKBENCH_BROWSER_SOCKET;
 if(platform!=="darwin"||!desktop||!socketPath)return undefined;
 const leases=createExecutionLeaseService(db,{now:options.now});
 const sessions=new Map<string,Session>(),held=new Map<string,Session>();
 const admission=createWorkbenchBrowserAdmissionService(db,{now:options.now,
  async resolveProfile(context,request,ref,signal){
   if(!context.accountId || (request.mode!=="primary"&&request.mode!=="anonymous"))throw new BrowserSocketError("INVALID_BROWSER_MODE",false);
   const location=await resolveManagedBrowserProfile(socketPath,{userId:context.userId,accountId:context.accountId,
    taskId:ref.executionTaskId},request.mode,signal);
   return {accountId:context.accountId,domain:request.domain,profileKey:location.profileKey};
  },
  async verifyProfileStopped(scope){
   const session=held.get(scope.leaseId);
   if(!session||!sameRef(session.ref,scope.ref)||session.receipt.profileKey!==scope.profileKey)return false;
   try {const operationId=randomUUID();const proof=await exchangeBrowserSocket(socketPath,{operationId,
    admission:session.admission,identityMode:session.mode,action:{kind:"stop_proof"}},operationId) as Record<string,unknown>;
    return proof.profileStopped===true&&proof.profileKey===scope.profileKey&&proof.profileLeaseId===scope.leaseId;
   }catch{return false;}
  },
 });
 const key=(taskId:string,laneId:string)=>`${taskId}\0${laneId}`;
 return {catalog,platform:"macos",capabilities:["task.browser"],
  async dispatch(rawCall,{signal}){
   signal.throwIfAborted();const call=workbenchHostCallSchema.parse(rawCall);
   const name=call.invocation.name as BrowserTool;
   if(!browserTools.includes(name))return failed(call.context.operationId,"BROWSER_CAPABILITY_UNAVAILABLE");
   const input=parseInput(name,call.invocation.input);
   if(!input)return failed(call.context.operationId,"INVALID_BROWSER_INPUT");
   const ref={executionTaskId:call.context.taskId,attempt:call.context.attempt,fenceToken:call.context.fenceToken};
   try {await leases.withLease(ref,"admission",async({context,task})=>{
    if(context.userId!==call.context.userId||context.accountId!==call.context.accountId||
      task.leaseOwner!==call.context.leaseId||!context.accountId)throw new BrowserSocketError("STALE_LEASE",false);
   });}catch{return failed(call.context.operationId,"STALE_LEASE");}
   let session:Session|undefined;
   if(name!=="browser.open"){
    session=sessions.get(key(ref.executionTaskId,input.laneId));
    if(!session||!sameRef(session.ref,ref))return failed(call.context.operationId,"LANE_NOT_FOUND");
   }
   if(name==="browser.navigate"&&!withinDomain(input.url!,session!.receipt.domain))
    return failed(call.context.operationId,"DOMAIN_NOT_ALLOWED");
   try {
    const receipt=await admission.acquire(ref,{laneId:session?.receipt.laneId??input.laneId,
     mode:session?.mode??input.mode,domain:session?.receipt.domain??input.domain},signal);
    if(session&&receipt.leaseId!==session.receipt.leaseId)return failed(call.context.operationId,"STALE_BROWSER_PROFILE_LEASE");
    const native=await leases.withLease(ref,"admission",async({context,task})=>{
     if(context.userId!==call.context.userId||context.accountId!==call.context.accountId||
       task.leaseOwner!==call.context.leaseId||!task.fenceToken||!context.accountId)
      throw new BrowserSocketError("STALE_LEASE",false);
     const nativeAdmission:NativeAdmission={userId:context.userId,accountId:context.accountId,taskId:task.id,
      attempt:task.attempt,fenceToken:task.fenceToken,domain:receipt.domain,profileKey:receipt.profileKey,
      profileLeaseId:receipt.leaseId,laneName:session?.admission.laneName??input.laneId,expiresAtMs:Date.now()+30_000};
     const bound:Session={ref,receipt,mode:session?.mode??input.mode!,admission:nativeAdmission};held.set(receipt.leaseId,bound);
     const action=name==="browser.open"?{kind:"open"}:name==="browser.status"?{kind:"status",laneId:input.laneId}
      :name==="browser.close"?{kind:"close",laneId:input.laneId,expectedBrowserEpoch:input.browserEpoch}
      :{kind:"execute",laneId:input.laneId,expectedBrowserEpoch:input.browserEpoch,
       action:name==="browser.navigate"?"navigate":name==="browser.observe"?"observe":name==="browser.extract"?"extract":
        name==="browser.screenshot"?"screenshot":input.action,
       input:name==="browser.navigate"?{url:input.url}:name==="browser.act"?input.input:{},
       ...(input.targetId?{targetId:input.targetId}:{}),...(input.frameId?{frameId:input.frameId}:{}),
       ...(input.refGeneration!==undefined?{refGeneration:input.refGeneration}:{})};
     return {value:await exchangeBrowserSocket(socketPath,{operationId:call.context.operationId,
      admission:nativeAdmission,identityMode:bound.mode,action},call.context.operationId,signal),bound};
    });
    if(name==="browser.open"){
     const value=native.value as {lane?:{lane_id?:unknown;browser_epoch?:unknown}};
     const laneId=value?.lane?.lane_id;
     if(typeof laneId!=="string"||!laneId||!Number.isSafeInteger(value?.lane?.browser_epoch))
      return failed(call.context.operationId,"INVALID_BROWSER_REPLY",true);
     sessions.set(key(ref.executionTaskId,laneId),native.bound);
    }
    if(name==="browser.close"){
     sessions.delete(key(ref.executionTaskId,input.laneId));
     const proof=(native.value as {stopProof?:{profileStopped?:boolean}})?.stopProof;
     if(proof?.profileStopped===true){
      try {if(await admission.releaseAfterProfileStopped(ref,receipt.leaseId))held.delete(receipt.leaseId);}
      catch {/* 宿主停止证明不充分时保留租约，后续对账。 */}
     }
    }
    return result(call.context.operationId,native.value);
   }catch(error){if(signal.aborted)throw error;
    if(error instanceof BrowserSocketError)return failed(call.context.operationId,error.code,error.dispatched);
    const code=error&&typeof error==="object"&&"code" in error?String((error as {code:unknown}).code):"BROWSER_ADMISSION_FAILED";
    return failed(call.context.operationId,code);
   }
  },
 };
}
