"use client";

import * as React from "react";
import type {WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {WorkbenchPreviewFrame} from "@/components/workbench-preview-frame";
import {isDesktopRuntimeClient} from "@/lib/desktop-updater";
import {exportWorkbenchArtifact} from "./workbench-artifact-export";

/** 仅显示已登记版本；预览始终进无同源权限的 sandbox，导出由用户点击触发。 */
export function WorkbenchArtifactCard({artifact,accountId}:{artifact:WorkbenchArtifact;accountId:string}){
 const scope=JSON.stringify([accountId,artifact.taskId,artifact.artifactId,artifact.version]);
 return <ArtifactCardSession key={scope} artifact={artifact} accountId={accountId}/>;
}

const subscribeDesktop=()=>()=>{};
const serverDesktop=()=>false;

function ArtifactCardSession({artifact,accountId}:{artifact:WorkbenchArtifact;accountId:string}){
 const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false);
 const desktop=React.useSyncExternalStore(subscribeDesktop,isDesktopRuntimeClient,serverDesktop);
 const [message,setMessage]=React.useState<string|null>(null);
 const exportController=React.useRef<AbortController|null>(null);
 const saving=React.useRef(false);
 React.useEffect(()=>()=>{exportController.current?.abort();exportController.current=null;saving.current=false;},[]);
 const base=`/api/v1/workbench-preview/${encodeURIComponent(artifact.taskId)}/${encodeURIComponent(artifact.artifactId)}/${artifact.version}`;
 const fileName=artifact.relativePath.split("/").at(-1)??"产物";
 const save=async(format:"raw"|"png"|"pdf")=>{
  if(!desktop||saving.current)return;
  saving.current=true;
  const controller=new AbortController();exportController.current=controller;
  setBusy(true);setMessage(null);
  try{
   const result=await exportWorkbenchArtifact(`${base}?format=${format}`,artifact,accountId,controller.signal);
   if(!controller.signal.aborted)setMessage(result==="saved"?"文件已保存":"已取消保存");
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"导出失败，请重试");}
  finally{if(exportController.current===controller){exportController.current=null;saving.current=false;}
   if(!controller.signal.aborted)setBusy(false);}
 };
 return <section aria-label={`产物 ${fileName} 第 ${artifact.version} 版`} className="rounded-xl border border-neutral-200 bg-white p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><strong>{fileName}</strong><span className="ml-2 text-sm text-neutral-500">第 {artifact.version} 版 · {artifact.size} B</span></div>
   <div className="flex gap-2">
    <button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?"收起预览":"预览"}</button>
    {desktop?<>
     <button type="button" onClick={()=>void save("raw")} disabled={busy}>{busy?"正在保存…":artifact.mime==="text/html"?"导出原文件":"导出文件"}</button>
     {artifact.mime==="text/html"?<>
      <button type="button" onClick={()=>void save("png")} disabled={busy}>导出 PNG</button>
      <button type="button" onClick={()=>void save("pdf")} disabled={busy}>导出 PDF</button>
     </>:null}
    </>:null}
   </div>
  </div>
  {message?<p role="status" className="mt-2 text-sm">{message}</p>:null}
  {open?<div className="mt-3 min-h-96 rounded border"><WorkbenchPreviewFrame taskId={artifact.taskId}
   artifactId={artifact.artifactId} version={artifact.version} accountId={accountId} title={`${fileName} 预览`}/></div>:null}
 </section>;
}
