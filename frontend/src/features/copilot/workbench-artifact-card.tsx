"use client";

import * as React from "react";
import type {WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {exportWorkbenchArtifact} from "./workbench-artifact-export";

function safeUrl(value:string):string|null{
 try{
  const url=new URL(value,window.location.href);
  return url.origin===window.location.origin&&url.pathname.startsWith("/api/v1/workbench-preview/")?url.href:null;
 }catch{return null;}
}

/** 仅显示已登记版本；预览始终进无同源权限的 sandbox，导出由用户点击触发。 */
export function WorkbenchArtifactCard({artifact,previewUrl,rawUrl}:{artifact:WorkbenchArtifact;previewUrl:string;rawUrl:string}){
 const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false);
 const [message,setMessage]=React.useState<string|null>(null);
 const preview=safeUrl(previewUrl),raw=safeUrl(rawUrl);
 const fileName=artifact.relativePath.split("/").at(-1)??"产物";
 const save=async()=>{
  if(!raw||busy)return;
  setBusy(true);setMessage(null);
  try{
   const result=await exportWorkbenchArtifact(raw,artifact);
   setMessage(result==="saved"?"文件已保存":"已取消保存");
  }catch(error){setMessage(error instanceof Error?error.message:"导出失败，请重试");}
  finally{setBusy(false);}
 };
 return <section aria-label={`产物 ${fileName} 第 ${artifact.version} 版`} className="rounded-xl border border-neutral-200 bg-white p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><strong>{fileName}</strong><span className="ml-2 text-sm text-neutral-500">第 {artifact.version} 版 · {artifact.size} B</span></div>
   <div className="flex gap-2">
    {preview?<button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?"收起预览":"预览"}</button>:null}
    {raw?<button type="button" onClick={()=>void save()} disabled={busy}>{busy?"正在保存…":"导出文件"}</button>:null}
   </div>
  </div>
  {message?<p role="status" className="mt-2 text-sm">{message}</p>:null}
  {open&&preview?<iframe title={`${fileName} 预览`} src={preview} sandbox="" referrerPolicy="no-referrer"
   loading="lazy" className="mt-3 h-96 w-full rounded border"/>:null}
 </section>;
}
