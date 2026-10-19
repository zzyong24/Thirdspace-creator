"use client";

import * as React from "react";
import {workbenchArtifactSchema,type WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {handshakeHeaders} from "@/lib/handshake-client";
import {WorkbenchArtifactCard} from "./workbench-artifact-card";

type Listed=WorkbenchArtifact&{status:string};
type Lineage={artifactId:string;currentVersion:number;status:string;pendingOperationId:string|null;lastErrorCode:string|null;migrationReason:string|null};

/** 从服务端正式谱系恢复被历史截窗隐藏的版本卡；已有消息卡由 ref 去重。 */
export function WorkbenchArtifactHistory({conversationId,accountId,excludeRefs}:{conversationId:string|null;accountId:string;excludeRefs:ReadonlySet<string>}){
 const scope=conversationId&&accountId?JSON.stringify([conversationId,accountId]):null;
 const [result,setResult]=React.useState<{scope:string;items:Listed[];lineages:Lineage[];unavailable:boolean}|null>(null),[refresh,setRefresh]=React.useState(0),[checking,setChecking]=React.useState<string|null>(null);
 React.useEffect(()=>{
  if(!conversationId||!accountId||!scope)return;
  const controller=new AbortController(),requestScope=scope;
  void (async()=>{
   const parsed:Listed[]=[],statuses=new Map<string,Lineage>();let cursor:string|null=null,pages=0;
   do{
    const query=new URLSearchParams({conversationId,limit:"50",...(cursor?{cursor}:{})}),response=await fetch(`/api/v1/workbench-artifacts?${query}`,{credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{...handshakeHeaders(),"x-account-id":accountId}});
    if(!response.ok)throw new Error("LIST_FAILED");
    const body=await response.json() as {items?:unknown[];legacyItems?:unknown[];lineages?:unknown[];nextCursor?:unknown};
    for(const raw of [...(body.items??[]),...(body.legacyItems??[])]){
     if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
     const {status,...metadata}=raw as Record<string,unknown>,checked=workbenchArtifactSchema.safeParse(metadata);
     if(checked.success&&typeof status==="string")parsed.push({...checked.data,status});
    }
    for(const raw of body.lineages??[]){if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;const row=raw as Record<string,unknown>;
     if(typeof row.artifactId==="string"&&Number.isSafeInteger(row.currentVersion)&&typeof row.status==="string")statuses.set(row.artifactId,{artifactId:row.artifactId,currentVersion:Number(row.currentVersion),status:row.status,
      pendingOperationId:typeof row.pendingOperationId==="string"?row.pendingOperationId:null,lastErrorCode:typeof row.lastErrorCode==="string"?row.lastErrorCode:null,migrationReason:typeof row.migrationReason==="string"?row.migrationReason:null});}
   cursor=typeof body.nextCursor==="string"?body.nextCursor:null;pages++;
   }while(cursor&&pages<20&&!controller.signal.aborted);
   if(cursor&&!controller.signal.aborted)throw new Error("LIST_LIMIT");
   if(!controller.signal.aborted)setResult({scope:requestScope,items:[...new Map(parsed.map(item=>[`${item.artifactId}@${item.version}:${item.taskId}`,item])).values()],lineages:[...statuses.values()],unavailable:false});
  })().catch(()=>{if(!controller.signal.aborted)setResult({scope:requestScope,items:[],lineages:[],unavailable:true});});
  return()=>controller.abort();
 },[conversationId,accountId,scope,refresh]);
 const reconcile=async(operationId:string)=>{
  if(!conversationId||checking)return;setChecking(operationId);
  try{await fetch("/api/v1/workbench-artifacts",{method:"POST",credentials:"same-origin",headers:{...handshakeHeaders(),"x-account-id":accountId,"content-type":"application/json"},body:JSON.stringify({conversationId,operationId})});}
  finally{setChecking(null);setRefresh(value=>value+1);}
 };
 const active=result?.scope===scope?result:null,items=active?.items??[],lineages=active?.lineages??[],unavailable=active?.unavailable??false;
 const restored=items.filter(item=>!excludeRefs.has(`${item.artifactId}@${item.version}`));
 const attention=lineages.filter(item=>["pending","reconciling","unknown","failed_confirmed","migration_blocked"].includes(item.status));
 if(!restored.length&&!unavailable&&!attention.length)return null;
 return <section aria-label="对话历史产物" className="space-y-2">
  {unavailable?<p role="status" className="text-sm text-muted-foreground">版本列表暂时不可用，当前消息中的产物仍可继续使用。</p>:null}
  {attention.map(item=><div key={`${item.artifactId}:${item.status}`} role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
   {item.status==="migration_blocked"?"旧版产物只读：原调用回执尚未通过核对。":item.status==="failed_confirmed"?"上次修订确认未提交，可以重新发起修订。":"产物版本正在核对，旧版仍可使用。"}
   {item.pendingOperationId&&["pending","reconciling","unknown"].includes(item.status)?<button type="button" className="ml-3 underline" disabled={checking===item.pendingOperationId} onClick={()=>void reconcile(item.pendingOperationId!)}>{checking===item.pendingOperationId?"正在核对…":"重新核对"}</button>:null}
  </div>)}
  {restored.map(item=><div key={`${item.artifactId}@${item.version}:${item.taskId}`} className="space-y-1">
   {item.status==="legacyReadOnly"?<p className="text-xs text-amber-700">旧版只读，修订功能等待原调用核对。</p>:null}
   <WorkbenchArtifactCard artifact={item} accountId={accountId}/>
  </div>) }
 </section>;
}
