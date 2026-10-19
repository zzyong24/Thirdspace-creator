"use client";
import * as React from "react";
import {ENDPOINTS,createClient,type Transport} from "@creatoros/contract";
import {CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY,readCurrentAccountId,readCurrentGroupId,fetchCreatorApi,HttpTransportError,type FrozenWorkspaceScope} from "./http-transport";

export type CreationClient = ReturnType<typeof createClient<typeof ENDPOINTS>>;
export type CreationScope = Readonly<{groupId:string|null;accountId:string|null}>;
export type CreationOperation = {
  readonly scope:CreationScope;
  readonly epoch:number;
  readonly signal:AbortSignal;
  readonly client:CreationClient;
  assertCurrent():void;
};
export function readCreationScope():CreationScope {
  const groupId=readCurrentGroupId();
  // 平台筛选不是组内共享稿的归属；旧账号入口仍保留真实账号。
  return Object.freeze({groupId,accountId:groupId?null:readCurrentAccountId()});
}
export function creationScopeKey(scope:FrozenWorkspaceScope):string {
  return scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??"missing"}`;
}
export class CreationScopeChangedError extends Error {
  constructor(){super("工作区已切换，原操作停止；原输入和回执已保留，请回原工作区核对。");this.name="AbortError";}
}
function sameCurrent(scope:CreationScope):boolean {
  return scope.groupId?readCurrentGroupId()===scope.groupId:
    !readCurrentGroupId()&&readCurrentAccountId()===scope.accountId;
}

/** 冻结范围只表达调用意图；真正授权、父根与CAS仍由原backend执行。 */
export function createCreationWorkspace(scope:CreationScope,options?:{isCurrent?:(scope:CreationScope)=>boolean;fetchApi?:typeof fetchCreatorApi}) {
  const frozen=Object.freeze({...scope});
  const isCurrent=()=>options?.isCurrent?options.isCurrent(frozen):sameCurrent(frozen);
  let controller=new AbortController(),epoch=0,unsubscribe:(()=>void)|null=null;
  function assertCurrent(expected=epoch){
    if(controller.signal.aborted||expected!==epoch||!isCurrent())throw new CreationScopeChangedError();
    if(!frozen.groupId&&!frozen.accountId)throw Error("请先选择一个账号组或原创作账号。");
  }
  function cancel(){epoch++;controller.abort();}
  function activate(){
    if(controller.signal.aborted)controller=new AbortController();
    if(unsubscribe||typeof window==="undefined")return;
    const changed=()=>{if(!isCurrent())cancel();};
    const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CURRENT_GROUP_KEY||event.key===CURRENT_ACCOUNT_KEY)changed();};
    window.addEventListener("creatoros:accounts-changed",changed);
    window.addEventListener("storage",storage);
    unsubscribe=()=>{window.removeEventListener("creatoros:accounts-changed",changed);window.removeEventListener("storage",storage);};
  }
  function dispose(){unsubscribe?.();unsubscribe=null;cancel();}
  function capture():CreationOperation {
    const expected=epoch,signal=controller.signal;
    const check=()=>{signal.throwIfAborted();assertCurrent(expected);};
    const transport:Transport={async request(endpoint,input){
      check();
      const response=await (options?.fetchApi??fetchCreatorApi)("/api/v1/dispatch",{
        method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",signal,
        body:JSON.stringify({id:endpoint.id,input}),
      },frozen);
      check();
      const envelope=await response.json();check();
      if(!response.ok){
        const error=envelope&&typeof envelope==="object"?envelope.error:undefined;
        const structured=error&&typeof error==="object"?error:null;
        throw new HttpTransportError(typeof structured?.message==="string"?structured.message:typeof error==="string"?error:`请求未完成（${response.status}）`,{
          status:response.status,code:typeof structured?.code==="string"?structured.code:null,
          details:structured?.details&&typeof structured.details==="object"?structured.details:{},
        });
      }
      return envelope;
    }};
    return Object.freeze({scope:frozen,epoch:expected,signal,client:createClient(ENDPOINTS,transport),assertCurrent:check});
  }
  const client=new Proxy({} as CreationClient,{get(_target,key){return (input:unknown)=>{const operation=capture();const method=operation.client[key as keyof CreationClient];return (method as (value:unknown)=>Promise<unknown>)(input);};}});
  return {scope:frozen,activate,dispose,cancel,capture,assertCurrent,client,get signal(){return controller.signal;},get epoch(){return epoch;}};
}
export type CreationWorkspace = ReturnType<typeof createCreationWorkspace>;
export function useCreationWorkspace(scope:CreationScope){
  const groupId=scope.groupId,accountId=scope.groupId?null:scope.accountId;
  const workspace=React.useMemo(()=>createCreationWorkspace({groupId,accountId}),[groupId,accountId]);
  React.useEffect(()=>{workspace.activate();return()=>workspace.dispose();},[workspace]);
  return workspace;
}

export function useCreationScope():CreationScope {
 const snapshot=React.useSyncExternalStore(React.useCallback((listener:()=>void)=>{const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CURRENT_GROUP_KEY||event.key===CURRENT_ACCOUNT_KEY)listener();};window.addEventListener('creatoros:accounts-changed',listener);window.addEventListener('storage',storage);return()=>{window.removeEventListener('creatoros:accounts-changed',listener);window.removeEventListener('storage',storage);};},[]),()=>creationScopeKey(readCreationScope()),()=>"account:missing");
 return React.useMemo(()=>snapshot.startsWith('group:')?{groupId:snapshot.slice(6),accountId:null}:{groupId:null,accountId:snapshot.slice(8)==='missing'?null:snapshot.slice(8)},[snapshot]);
}
export function useCreationClient(){return useCreationWorkspace(useCreationScope()).client;}
