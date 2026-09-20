import "server-only";
import {createConnection} from "node:net";

const MAX_REQUEST_BYTES=1_400_000;
const MAX_REPLY_BYTES=16_000_000;

export class BrowserSocketError extends Error {
 constructor(public readonly code:string,public readonly dispatched:boolean){super(code);this.name="BrowserSocketError";}
}

/** 仅供持有后端 admission 行锁的宿主适配器调用；身份、profile 和 Lane 不从模型输入拼接。 */
export function exchangeBrowserSocket(socketPath:string,request:object,operationId:string,signal?:AbortSignal):Promise<unknown>{
 if(signal?.aborted)return Promise.reject(new BrowserSocketError("BROWSER_ABORTED",false));
 if(!socketPath || !operationId || operationId.length>160 || /[\x00-\x1f/\\]/.test(operationId) ||
    (request as {operationId?:unknown}).operationId!==operationId)
  return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));
 let encoded:string;
 try {encoded=`${JSON.stringify(request)}\n`;}catch{return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));}
 if(Buffer.byteLength(encoded,"utf8")>MAX_REQUEST_BYTES)return Promise.reject(new BrowserSocketError("INVALID_BROWSER_REQUEST",false));
 return new Promise((resolve,reject)=>{
  let dispatched=false,settled=false,body="";
  const socket=createConnection({path:socketPath});
  socket.setTimeout(125_000);
  const cleanup=()=>{signal?.removeEventListener("abort",onAbort);socket.destroy();};
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
