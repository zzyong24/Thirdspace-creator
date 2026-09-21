import "server-only";
import {randomUUID} from "node:crypto";
import {PNG} from "pngjs";
import type {Db} from "@creatoros/backend";
import {BrowserProfileBusyError,createExecutionBrowserProfileLeaseService,createExecutionLeaseService,
 createWorkbenchBrowserAdmissionService} from "@creatoros/backend/modules/execution";
import type {ChatProductionCompositionDeps} from "@creatoros/backend/modules/ai-runtime";
import {WORKBENCH_SCREENSHOT_MAX_BYTES,isCanonicalBase64,workbenchCapabilitySchema,workbenchHostCallSchema,workbenchResultSchema,type WorkbenchResult} from "@creatoros/contract/agent-workbench";
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
 "browser.open":"为当前任务打开受控浏览器 Lane。主身份使用当前账号的独立档案，登录状态须实际验证。",
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
function result(operationId:string,value:unknown,dataRef?:string):WorkbenchResult{return workbenchResultSchema.parse({operationId,status:"succeeded",
 artifactRefs:[],progressCursor:null,content:[{type:"text",text:JSON.stringify(value??null)},...(dataRef?[{type:"image" as const,mediaType:"image/png",dataRef}]:[])]});}
function failed(operationId:string,code:string,dispatched=false):WorkbenchResult{
 const unknown=dispatched && code==="BROWSER_RESULT_UNKNOWN";
 return workbenchResultSchema.parse({operationId,status:unknown?"unknown":"failed",artifactRefs:[],progressCursor:null,
  error:{code:code.toLowerCase().slice(0,160),dispatched,retryable:false,
   nextAction:dispatched?"reconcile":code==="BROWSER_PROFILE_BUSY"?"wait":"fix_input"}});
}
function sameRef(a:ExecutionRef,b:ExecutionRef){return a.executionTaskId===b.executionTaskId&&a.attempt===b.attempt&&a.fenceToken===b.fenceToken;}
function visibleLane(raw:unknown){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const lane=raw as Record<string,unknown>,laneId=lane.lane_id,epoch=lane.browser_epoch;
 if(typeof laneId!=="string"||!validId(laneId)||!Number.isSafeInteger(epoch)||Number(epoch)<0)return null;
 const states=["queued","starting","running","frozen","stopping","failed"];
 const queue=lane.queue&&typeof lane.queue==="object"&&!Array.isArray(lane.queue)?lane.queue as Record<string,unknown>:null;
 const position=lane.queue_position??queue?.position;
 return {lane_id:laneId,browser_epoch:epoch,
  ...(typeof lane.lifecycle_state==="string"&&states.includes(lane.lifecycle_state)?{lifecycle_state:lane.lifecycle_state}:{}),
  ...("queue" in lane||"queue_position" in lane?{queue_position:Number.isSafeInteger(position)&&Number(position)>=0?position:null}:{})};
}
function withinDomain(url:string,domain:string,mode:ManagedBrowserMode){
 try {const parsed=new URL(url),authority=url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
  return (parsed.protocol==="https:"||(mode==="anonymous"&&parsed.protocol==="http:"))&&
  !!authority&&!authority.includes(":")&&!parsed.username&&!parsed.password&&!parsed.port&&
  (parsed.hostname===domain||parsed.hostname.endsWith(`.${domain}`));}catch{return false;}
}

/** 浏览器能力仅在真正有 Mac 私有 socket 时装配；不从模型输入接受账号、目录或 profileKey。 */
export function createWorkbenchBrowserHost(db:Db,options:{platform?:NodeJS.Platform;desktop?:boolean;socketPath?:string;
 now?:()=>string;media?:{submit(ref:ExecutionRef,operationId:string,bytes:Uint8Array):Promise<string>}}={}):(Host&{reconcileStoppedProfiles():Promise<void>;dispose():Promise<void>})|undefined{
 const platform=options.platform??process.platform,desktop=options.desktop??process.env.CREATOROS_DESKTOP==="1";
 const socketPath=options.socketPath??process.env.CREATOROS_WORKBENCH_BROWSER_SOCKET;
 if(platform!=="darwin"||!desktop||!socketPath)return undefined;
 const trustedSocketPath=socketPath;
 const leases=createExecutionLeaseService(db,{now:options.now});
 const profiles=createExecutionBrowserProfileLeaseService(db,{now:options.now});
 const sessions=new Map<string,Session>(),held=new Map<string,Session>();
 let timer:NodeJS.Timeout|undefined,reconciling:Promise<void>|undefined,disposed=false;
 function scheduleReconciliation(){
  if(disposed||timer||!held.size)return;
  timer=setTimeout(()=>{
   timer=undefined;
   void reconcileStoppedProfiles().catch(()=>{/* 数据库或原生宿主暂不可用时保留物理租约，下次重试。 */});
  },5_000);
  timer.unref();
 }
 function forgetLease(leaseId:string){
  held.delete(leaseId);
  for(const [laneId,session] of sessions)if(session.receipt.leaseId===leaseId)sessions.delete(laneId);
  if(!held.size&&timer){clearTimeout(timer);timer=undefined;}
 }
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
 async function recoverStoppedProfile(profileKey:string):Promise<boolean>{
  const old=await profiles.getRecoverableWorkerProfile(profileKey);
  if(!old)return false;
  let mode:ManagedBrowserMode|undefined;
  for(const choice of ["primary","anonymous"] as const){
   try {const location=await resolveManagedBrowserProfile(trustedSocketPath,{userId:old.userId,
    accountId:old.accountId,taskId:old.ref.executionTaskId},choice,AbortSignal.timeout(10_000));
    if(location.profileKey===old.profileKey){mode=choice;break;}
   }catch {/* 不能解析旧物理目录时保留占用。 */}
  }
  if(!mode)return false;
  const operationId=randomUUID();
  const nativeAdmission:NativeAdmission={userId:old.userId,accountId:old.accountId,
   taskId:old.ref.executionTaskId,attempt:old.ref.attempt,fenceToken:old.ref.fenceToken,
   domain:old.domain,profileKey:old.profileKey,profileLeaseId:old.leaseId,
   laneName:"recovery",expiresAtMs:Date.now()+30_000};
  let proof:Record<string,unknown>;
  try {proof=await exchangeBrowserSocket(trustedSocketPath,{operationId,admission:nativeAdmission,
   identityMode:mode,action:{kind:"cleanup"}},operationId,AbortSignal.timeout(15_000)) as Record<string,unknown>;
  }catch{return false;}
  if(proof?.profileStopped!==true||proof.profileKey!==old.profileKey||proof.profileLeaseId!==old.leaseId)return false;
  const fresh=await profiles.getRecoverableWorkerProfile(profileKey);
  if(!fresh||fresh.leaseId!==old.leaseId||!sameRef(fresh.ref,old.ref))return false;
  try {const released=await profiles.releaseAfterWorkerStopped(old.ref,old.leaseId);
   if(released)forgetLease(old.leaseId);
   return released;}
  catch {return false;}
 }
 async function reconcileStoppedProfiles():Promise<void>{
  if(reconciling)return reconciling;
  const work=(async()=>{
   for(const [leaseId,session] of [...held]){
    const candidate=await profiles.getRecoverableWorkerProfile(session.receipt.profileKey);
    if(!candidate||candidate.leaseId!==leaseId||!sameRef(candidate.ref,session.ref))continue;
    const stopped=["cancel_requested","cancelled","pause_requested","paused","succeeded","failed","partial"].includes(candidate.taskStatus);
    if(!stopped&&candidate.currentAttempt)continue;
    await recoverStoppedProfile(session.receipt.profileKey);
   }
  })();
  reconciling=work;
  try {await work;}finally{reconciling=undefined;scheduleReconciliation();}
 }
 const key=(taskId:string,laneId:string)=>`${taskId}\0${laneId}`;
 return {catalog:options.media?catalog:catalog.filter(tool=>tool.name!=="browser.screenshot"),platform:"macos",capabilities:["task.browser"],reconcileStoppedProfiles,
  async dispose(){disposed=true;if(timer){clearTimeout(timer);timer=undefined;}
   // 数据库关闭前等本轮可能正在写入的租约对账结算；失败时原租约仍保留。
   await reconciling?.catch(()=>{});
  },
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
   if(name==="browser.navigate"&&!withinDomain(input.url!,session!.receipt.domain,session!.mode))
    return failed(call.context.operationId,"DOMAIN_NOT_ALLOWED");
   let acquired:Receipt|undefined;
   try {
    const request={laneId:session?.receipt.laneId??input.laneId,
     mode:session?.mode??input.mode,domain:session?.receipt.domain??input.domain};
    let receipt:Receipt;
    try {receipt=await admission.acquire(ref,request,signal);}
    catch(error){
     if(!(error instanceof BrowserProfileBusyError)||name!=="browser.open")throw error;
     const location=await resolveManagedBrowserProfile(socketPath,{userId:call.context.userId,
      accountId:call.context.accountId!,taskId:ref.executionTaskId},input.mode!,signal);
     if(!await recoverStoppedProfile(location.profileKey))throw error;
     receipt=await admission.acquire(ref,request,signal);
    }
    acquired=receipt;
    if(session&&receipt.leaseId!==session.receipt.leaseId)return failed(call.context.operationId,"STALE_BROWSER_PROFILE_LEASE");
    const prepared=await leases.withLease(ref,"admission",async({context,task})=>{
     if(context.userId!==call.context.userId||context.accountId!==call.context.accountId||
       task.leaseOwner!==call.context.leaseId||!task.fenceToken||!context.accountId)
      throw new BrowserSocketError("STALE_LEASE",false);
     const nativeAdmission:NativeAdmission={userId:context.userId,accountId:context.accountId,taskId:task.id,
      attempt:task.attempt,fenceToken:task.fenceToken,domain:receipt.domain,profileKey:receipt.profileKey,
      profileLeaseId:receipt.leaseId,laneName:session?.admission.laneName??input.laneId,expiresAtMs:Date.now()+30_000};
     const bound:Session={ref,receipt,mode:session?.mode??input.mode!,admission:nativeAdmission};held.set(receipt.leaseId,bound);
     scheduleReconciliation();
     const action=name==="browser.open"?{kind:"open"}:name==="browser.status"?{kind:"status",laneId:input.laneId}
      :name==="browser.close"?{kind:"close",laneId:input.laneId,expectedBrowserEpoch:input.browserEpoch}
      :{kind:"execute",laneId:input.laneId,expectedBrowserEpoch:input.browserEpoch,
       action:name==="browser.navigate"?"navigate":name==="browser.observe"?"observe":name==="browser.extract"?"extract":
        name==="browser.screenshot"?"screenshot":input.action,
       input:name==="browser.navigate"?{url:input.url}:name==="browser.act"?input.input:{},
       ...(input.targetId?{targetId:input.targetId}:{}),...(input.frameId?{frameId:input.frameId}:{}),
       ...(input.refGeneration!==undefined?{refGeneration:input.refGeneration}:{})};
     return {nativeAdmission,bound,action};
    });
    // Chromium may navigate or wait for a page for minutes. Keep that I/O out
    // of PGlite's single transaction channel so status, heartbeat and cancel
    // requests remain live.
    const value=await exchangeBrowserSocket(socketPath,{operationId:call.context.operationId,
      admission:prepared.nativeAdmission,identityMode:prepared.bound.mode,action:prepared.action},call.context.operationId,signal);
    await leases.withLease(ref,"admission",async({context,task})=>{
      if(context.userId!==call.context.userId||context.accountId!==call.context.accountId||
        task.leaseOwner!==call.context.leaseId||task.fenceToken!==ref.fenceToken)
        throw new BrowserSocketError("BROWSER_RESULT_UNKNOWN",true);
    });
    const native={value,bound:prepared.bound};
    if(name==="browser.open"){
     const value=native.value as {lane?:unknown};
     const lane=visibleLane(value?.lane);
     if(!lane)
      return failed(call.context.operationId,"INVALID_BROWSER_REPLY",true);
     sessions.set(key(ref.executionTaskId,lane.lane_id),native.bound);
     return result(call.context.operationId,{lane});
    }
    if(name==="browser.status"){
     const lane=visibleLane(native.value);
     return lane?result(call.context.operationId,lane):failed(call.context.operationId,"INVALID_BROWSER_REPLY",true);
    }
    if(name==="browser.close"){
     sessions.delete(key(ref.executionTaskId,input.laneId));
     const sameProfileLane=[...sessions.values()].some(other=>sameRef(other.ref,ref)&&
      other.receipt.leaseId===receipt.leaseId);
     let profileStopped=false;
     if(!sameProfileLane){
      // Chromium 关窗后的子进程/文件句柄可能比 close 回复晚一点消失。
      // 数据库释放仍逐次要求 Rust 的新停止证明；最后一条 Lane 未证实时回 unknown。
      let released=false;
      for(let attempt=0;attempt<4;attempt++){
       try {if(await admission.releaseAfterProfileStopped(ref,receipt.leaseId)){
        forgetLease(receipt.leaseId);released=true;break;
       }}catch {/* 未证明停止时仍持有物理租约。 */}
       if(attempt<3)await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
      }
      if(!released)return failed(call.context.operationId,"BROWSER_RESULT_UNKNOWN",true);
      profileStopped=true;
     }
     return result(call.context.operationId,{laneId:input.laneId,closed:true,profileStopped});
    }
    if(name==="browser.screenshot"){
     if(!options.media)return failed(call.context.operationId,"SCREENSHOT_MEDIA_UNAVAILABLE");
     const value=native.value as {result?:{output?:{media_type?:unknown;data?:unknown}}};
     const output=value?.result?.output;
     if(output?.media_type!=="image/png"||typeof output.data!=="string"||
       output.data.length>Math.ceil(WORKBENCH_SCREENSHOT_MAX_BYTES/3)*4||
       !isCanonicalBase64(output.data))
      return failed(call.context.operationId,"SCREENSHOT_MEDIA_INVALID",true);
     const bytes=Buffer.from(output.data,"base64");
     try {const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      if(bytes.byteLength<45||bytes.byteLength>WORKBENCH_SCREENSHOT_MAX_BYTES||width<1||height<1||width*height>20_000_000||
        PNG.sync.read(bytes).width!==width)
      return failed(call.context.operationId,"SCREENSHOT_MEDIA_INVALID",true);}
     catch {return failed(call.context.operationId,"SCREENSHOT_MEDIA_INVALID",true);}
     let dataRef:string;
     try {dataRef=await options.media.submit(ref,call.context.operationId,bytes);}
     catch {return failed(call.context.operationId,"SCREENSHOT_MEDIA_RESULT_UNKNOWN",true);}
     // 原生原始字节不能进入 JSON 工具回执；稳定引用由服务端原任务/原调用解析。
     return result(call.context.operationId,{...value,result:{...value.result,output:{media_type:"image/png",dataRef}}},dataRef);
    }
    return result(call.context.operationId,native.value);
   }catch(error){
    if(acquired){
     // Open 可能已拿到数据库租约，却在原生宿主启动前失败。仅实际停机证明可释放。
     try {if(await admission.releaseAfterProfileStopped(ref,acquired.leaseId))forgetLease(acquired.leaseId);}
     catch {/* 原生状态不明时保留占用，禁止下一个持有者抢占。 */}
    }
    if(signal.aborted)throw error;
    if(error instanceof BrowserSocketError)return failed(call.context.operationId,error.code,error.dispatched);
    const code=error&&typeof error==="object"&&"code" in error?String((error as {code:unknown}).code):"BROWSER_ADMISSION_FAILED";
    return failed(call.context.operationId,code);
   }
  },
 };
}
