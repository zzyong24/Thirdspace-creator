"use client";
import * as React from 'react';
import type {GraphicPostDocument,ReferenceEditorMedia} from '@creatoros/contract';
import {referenceEditorDocument} from '@creatoros/contract';
import {NativeEditorSurface,type NativeEditorHandle,type EditorSnapshot,type EditorExport} from './native-editor-surface';
import {uploadEditorMedia,hydrateGraphicDocument,freezeGraphicDocument,downloadEditorExport} from './reference-editor-media';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
type Design=NonNullable<GraphicPostDocument['designs']>[number];
// SEMANTIC_BOUNDARY_ALLOW: 只比较全部持久化图层字段，不决定内容与布局。
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value);}
export function GraphicDesignWorkbench({accountId,sourceVersionId,projectId,outputId,title,design,onSave,onClose,onReload}:{accountId:string;sourceVersionId:string;projectId:string;outputId:string;title:string;design:Design;onSave:(design:Design,image?:ReferenceEditorMedia)=>Promise<void>;onClose:()=>void;onReload?:()=>Promise<void>}){
 const [mountVersion]=React.useState(sourceVersionId);
 const [savePending,setSavePending]=React.useState(false);
 const pendingSave=React.useRef<{design:Design;image?:ReferenceEditorMedia;result?:EditorExport}|null>(null);
 const conflictAttempt=React.useRef<typeof pendingSave.current>(null);const [conflict,setConflict]=React.useState(false);
 const frame=React.useRef<NativeEditorHandle>(null),media=React.useRef<ReferenceEditorMedia[]>(design.document.mediaRefs),alive=React.useRef(true);
 const [busy,setBusy]=React.useState(false),[ready,setReady]=React.useState(false),[dirty,setDirty]=React.useState(false),[error,setError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null);
 const [closeConfirm,setCloseConfirm]=React.useState(false);const controller=React.useRef(new AbortController()),revoke=React.useRef<(()=>void)|null>(null);
 React.useEffect(()=>{alive.current=true;const abort=new AbortController();controller.current=abort;return()=>{alive.current=false;abort.abort();revoke.current?.();};},[]);
 async function load(){setBusy(true);try{const hydration=Object.keys(design.document.nativeDocument).length?await hydrateGraphicDocument(design.document,controller.current.signal):{document:null,revoke:()=>{}};if(!alive.current){hydration.revoke();return;}revoke.current?.();revoke.current=hydration.revoke;await frame.current!.request('load',{document:hydration.document,title});if(alive.current){setReady(true);setDirty(false);}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'原稿加载失败，请保留稿件后重试');}finally{if(alive.current)setBusy(false);}}
 async function save(exportImage:boolean){if(busy||!ready||conflict)return;setBusy(true);setError(null);try{
  // 保存回执未知时沿用同一份冻结稿和已上传文件，避免再导出/上传改变请求。
  if(!pendingSave.current){
   if(exportImage){const result=await frame.current!.request<EditorExport>('export',{format:'png'});if(!alive.current)return;if(!(result.blob instanceof Blob)||!result.blob.size||!result.document)throw Error('图片导出没有返回有效文件与对应图层');const document=referenceEditorDocument.parse(freezeGraphicDocument(result.document,media.current));pendingSave.current={design:{...design,document},result};downloadEditorExport(result.blob,result.fileName);}
   else{const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');if(!alive.current)return;const document=referenceEditorDocument.parse(freezeGraphicDocument(snapshot.document,media.current));pendingSave.current={design:{...design,document}};}
  }
  setSavePending(true);const pending=pendingSave.current;
  if(pending.result&&!pending.image)pending.image=await uploadEditorMedia(projectId,outputId,new File([pending.result.blob],pending.result.fileName,{type:'image/png'}));
  if(!alive.current)return;await onSave(pending.design,pending.image);if(!alive.current)return;pendingSave.current=null;
  // 保存回执只证明冻结稿已落库；在途的合法图片导入仍可能产生后续图层。
  let changed=true;try{const live=await frame.current!.request<EditorSnapshot>('snapshot');changed=canonical(freezeGraphicDocument(live.document,media.current))!==canonical(pending.design.document);}catch{/* 无法核对时保留未保存提示，已确认的服务回执不再重发。 */}
  if(alive.current){setSavePending(false);setDirty(changed);setMessage(changed?'冻结图层已保存，之后完成的修改仍在当前画布，请继续保存。':pending.result?'图片已采用到当前稿件，图层也已保存。':'图层已保存，可以继续编辑。');}
 }catch(e){if(alive.current){if((e as {status?:number}|null)?.status===409){conflictAttempt.current=pendingSave.current;pendingSave.current=null;setSavePending(false);setConflict(true);setDirty(true);}setError(e instanceof Error?e.message:'保存未完成，当前图层已保留');}}finally{if(alive.current)setBusy(false);}}
 async function backupAndReload(){if(busy||!ready)return;setBusy(true);try{const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');if(!alive.current)return;const local={...design,document:referenceEditorDocument.parse(freezeGraphicDocument(snapshot.document,media.current))};const backup={kind:'creatoros.native-design-backup',accountId,projectId,outputId,sourceVersionId:mountVersion,design:local,frozenAttempt:conflictAttempt.current?{design:conflictAttempt.current.design,image:conflictAttempt.current.image}:null};downloadEditorExport(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),'图层稿本地备份.json');if(onReload){await onReload();if(alive.current)onClose();}else if(alive.current)setMessage('本地图层与素材引用已下载备份，可以继续编辑或返回核对稿件。');}catch(e){if(alive.current)setError(e instanceof Error?e.message:'备份或读取未完成，当前画布仍保留');}finally{if(alive.current)setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy&&!savePending){if(dirty)setCloseConfirm(true);else onClose();}}}><DialogContent showCloseButton={false} aria-describedby={undefined} className="left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><DialogTitle className="truncate font-semibold">{title}</DialogTitle><p className="text-xs text-muted-foreground">{dirty?'有未保存修改':'文字、图片和图层均可直接编辑'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!ready||busy||conflict} onClick={()=>void save(false)}>保存设计</Button><Button disabled={!ready||busy||conflict} onClick={()=>void save(true)}>{busy?'处理中…':'导出并采用图片'}</Button><Button variant="ghost" disabled={busy||!!savePending} onClick={()=>dirty?setCloseConfirm(true):onClose()}>返回稿件</Button></div></header>
  {conflict&&<div className="flex flex-wrap items-center gap-3 border-b p-3 text-sm"><p>当前稿件已有新版本，本地图层仍保留。先备份，再回到稿件核对当前版本。</p><Button variant="outline" disabled={busy||!ready} onClick={()=>void backupAndReload()}>{onReload?'备份本地稿并读取当前版本':'备份本地稿'}</Button></div>}
  {error&&<p role="alert" className="border-b p-3 text-sm text-destructive">{error}<button className="ml-3 underline" disabled={busy||!!savePending||conflict} onClick={()=>void load()}>重新读取原稿</button></p>}{message&&<p role="status" className="p-2 text-sm">{message}</p>}
  {closeConfirm&&<div className="flex flex-wrap items-center gap-3 border-b bg-surface-subtle p-3"><p>设计尚未保存。保存后可继续回到这张图。</p><Button disabled={busy||conflict} onClick={()=>void save(false).then(()=>{if(alive.current)setCloseConfirm(false);})}>先保存设计</Button><Button variant="outline" onClick={()=>setCloseConfirm(false)}>继续编辑</Button><Button variant="ghost" disabled={busy||!!savePending} onClick={onClose}>放弃本次修改并返回</Button></div>}
  <details className="border-b px-4 py-2 text-xs text-muted-foreground"><summary className="cursor-pointer">开源来源与许可</summary><a href="/reference-editors/NOTICE.html" className="underline" target="_blank" rel="noreferrer">快图来源与许可</a></details>
  <div className="min-h-0 flex-1 overflow-hidden"><NativeEditorSurface ref={frame} editor="kuaitu" owner={{accountId,outputId,sourceVersionId:mountVersion}} disabled={busy||!!savePending} onReady={()=>void load()} onChanged={()=>{if(ready&&!busy)setDirty(true);}} onError={setError} onImport={async file=>{const ref=await uploadEditorMedia(projectId,outputId,file);if(!alive.current)throw Error('已离开当前稿件');media.current=[...media.current,ref];return{mediaId:ref.mediaId};}}/></div>
 </DialogContent></Dialog>;
}
