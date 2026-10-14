import "server-only";
import {createConnection} from "node:net";
import {randomUUID} from "node:crypto";
import {isAbsolute} from "node:path";
import {completionWaitMs,executionTimeoutMs,MIN_EXECUTION_TIMEOUT_MS} from "@creatoros/contract/timeout-policy";

const MAX_REQUEST_BYTES=1_400_000;
const MAX_REPLY_BYTES=16_000_000;

export class BrowserSocketError extends Error {
 constructor(public readonly code:string,public readonly dispatched:boolean){super(code);this.name="BrowserSocketError";}
}

/** 仅供完成后端 admission 短事务核验的宿主适配器调用；身份、profile 和 Lane 不从模型输入拼接。 */
export function exchangeBrowserSocket(socketPath:string,request:object,operationId:string,signal?:AbortSignal):Promise<unknown>{
 if(signal?.aborted)return Promise.reject(new BrowserSocketError("BROWSER_ABORTED",false));
 if(!socketPath || !operationId || operationId.length>160 || /[\x00-\x1f/\\]/.test(operationId) ||
    (request as {operationId?:unknown}).operationId!==operationId)
  return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));
 let encoded:string;
 try {encoded=`${JSON.stringify(request)}\n`;}catch{return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));}
 if(Buffer.byteLength(encoded,"utf8")>MAX_REQUEST_BYTES)return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));
 // 原host已经验证的更长原动作等待只扩大本次观察，不修改action/admission或任务deadline。
 const action=(request as {action?:{kind?:unknown;input?:{timeout_ms?:unknown}}}).action;
 const requested=action?.kind==='execute'?action.input?.timeout_ms:undefined;
 let waitMs:number;
 try{
  // 未指定/原SDK的0值不改action语义；本次RPC仍有独立有限观察。只保留已知正值的更长槽。
  const responseMs=typeof requested==='number'&&Number.isSafeInteger(requested)&&requested>0
   ?Math.max(125_000,executionTimeoutMs(requested,125_000)):125_000;
  waitMs=completionWaitMs([MIN_EXECUTION_TIMEOUT_MS,responseMs,MIN_EXECUTION_TIMEOUT_MS],60_000);
 }catch{return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));}
 return new Promise((resolve,reject)=>{
  let dispatched=false,settled=false,body="";
  const socket=createConnection({path:socketPath});
  socket.setTimeout(waitMs);
  // 一次完整墙钟期限，不在connect/data/partial reply时重建。
  const timer=setTimeout(()=>fail(dispatched?"BROWSER_RESULT_UNKNOWN":"BROWSER_UNAVAILABLE"),waitMs);
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener("abort",onAbort);socket.destroy();};
  const fail=(code:string)=>{if(settled)return;settled=true;cleanup();reject(new BrowserSocketError(code,dispatched));};
  const onAbort=()=>fail(dispatched?"BROWSER_RESULT_UNKNOWN":"BROWSER_ABORTED");
  signal?.addEventListener("abort",onAbort,{once:true});
  socket.once("connect",()=>{
   if(signal?.aborted){onAbort();return;}
   dispatched=true;
   socket.write(encoded);
  });
  socket.on("data",chunk=>{
   if(settled)return;
   body+=chunk.toString("utf8");
   if(Buffer.byteLength(body,"utf8")>MAX_REPLY_BYTES){fail("BROWSER_RESULT_UNKNOWN");return;}
   const end=body.indexOf("\n");if(end<0)return;
   let reply:unknown;
   try {reply=JSON.parse(body.slice(0,end));}catch{fail("BROWSER_RESULT_UNKNOWN");return;}
   if(!reply || typeof reply!=="object"){fail("BROWSER_RESULT_UNKNOWN");return;}
   const result=reply as {ok?:unknown;operationId?:unknown;value?:unknown;code?:unknown};
   if(result.operationId!==operationId){fail("BROWSER_RESULT_UNKNOWN");return;}
   if(result.ok===true){settled=true;cleanup();resolve(result.value);return;}
   if(result.ok===false && typeof result.code==="string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(result.code)){
    fail(result.code);return;
   }
   fail("BROWSER_RESULT_UNKNOWN");
  });
  socket.once("timeout",()=>fail("BROWSER_RESULT_UNKNOWN"));
  socket.once("error",()=>fail(dispatched?"BROWSER_RESULT_UNKNOWN":"BROWSER_UNAVAILABLE"));
  socket.once("close",()=>fail(dispatched?"BROWSER_RESULT_UNKNOWN":"BROWSER_UNAVAILABLE"));
 });
}

export type ManagedBrowserMode="primary"|"anonymous";
export type ManagedBrowserLocation={profileKey:string;managedProfileRoot:string;identityMode:ManagedBrowserMode;
 legacyIdentityImported:boolean;primaryLoginState:string};

/** Rust 只返回它真实将打开的物理目录摘要；调用方仍须从后端 execution lease 取得 scope。 */
export async function resolveManagedBrowserProfile(socketPath:string,
 scope:{userId:string;accountId:string;taskId:string},mode:ManagedBrowserMode,signal?:AbortSignal):Promise<ManagedBrowserLocation>{
 if(![scope.userId,scope.accountId,scope.taskId].every(value=>value && value.length<=160 && !/[\x00-\x1f]/.test(value)))
  throw new BrowserSocketError("INVALID_BROWSER_PROFILE_LOCATION",false);
 const operationId=randomUUID();
 const raw=await exchangeBrowserSocket(socketPath,{operationId,action:{kind:"profile_location",userId:scope.userId,
  accountId:scope.accountId,taskId:scope.taskId,identityMode:mode}},operationId,signal);
 if(!raw || typeof raw!=="object" || Array.isArray(raw))
  throw new BrowserSocketError("INVALID_BROWSER_PROFILE_LOCATION",true);
 const location=raw as Record<string,unknown>;
 if(typeof location.profileKey!=="string" || !/^[a-f0-9]{64}$/.test(location.profileKey) ||
    typeof location.managedProfileRoot!=="string" || !isAbsolute(location.managedProfileRoot) ||
    location.identityMode!==mode || typeof location.legacyIdentityImported!=="boolean" ||
    typeof location.primaryLoginState!=="string")
  throw new BrowserSocketError("INVALID_BROWSER_PROFILE_LOCATION",true);
 return location as ManagedBrowserLocation;
}
