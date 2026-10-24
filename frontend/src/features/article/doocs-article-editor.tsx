"use client";

import * as React from "react";
import DOMPurify from "dompurify";
import { zipSync, strToU8 } from "fflate";
import { articleDocument } from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import {useCreationWorkspace,creationScopeKey} from "@/lib/creation-workspace-scope";
import {useNativeWorkspace} from "@/features/reference-editors/use-native-account";
import {NativeEditorSurface,type NativeEditorHandle} from "@/features/reference-editors/native-editor-surface";
import {uploadEditorMedia} from "@/features/reference-editors/reference-editor-media";
import { parseArticleMarkdown, serializeArticleMarkdown, type MarkdownSection } from "./doocs-markdown";

type ArticleDocument = import("@creatoros/contract").ArticleDocument;
type Props = {
  deliveryOnly?: boolean;
  showPreview?: boolean;
  prepareDelivery?:()=>Promise<{versionId:string;document:ArticleDocument}|null>;
  accountId:string|null;
  projectId:string;
  outputId: string;
  sourceVersionId: string;
  value: ArticleDocument;
  savedDocument: ArticleDocument;
  onChange: (document: ArticleDocument) => void;
  onSave: (document: ArticleDocument) => Promise<boolean>;
};
type EditorValue = {markdown?: string; layout?: unknown; html?: string; error?: string; bindings?: Array<{key: string; url: string}>};
type StoredCheckpoint = {accountId:string|null;groupId?:string|null; outputId: string; sourceVersionId: string; updatedAt: number; document: ArticleDocument; markdown: string; layout?: ArticleDocument["nativeLayout"] };

function sessionId(): string { return crypto.randomUUID(); }
function checkpointKey(accountId: string, outputId: string): string { return `creatoros:article:draft:${accountId}:${outputId}`; }
function sectionsForEditor(document: ArticleDocument): MarkdownSection[] {
  return document.sections.map((section) => ({ ...section, headingLevel: section.headingLevel ?? 2,
    body: [section.body, ...document.imageUses.filter((image) => image.sectionId === section.sectionId)
      .filter((image) => !section.body.includes(`creatoros-asset:${image.assetId}:${image.assetFileId}`))
      .map((image) => `<img src="creatoros-asset:${image.assetId}:${image.assetFileId}" alt="文章配图" />`)].filter(Boolean).join("\n\n"),
  }));
}


function editorInput(document:ArticleDocument){return {title:document.title,markdown:serializeArticleMarkdown(sectionsForEditor(document)),layout:document.nativeLayout?.editor==='doocs-md'?document.nativeLayout:null};}
function editorFingerprint(document:ArticleDocument){return JSON.stringify(editorInput(document));}
function documentFromSnapshot(document:ArticleDocument,snapshot:EditorValue,registered:Map<string,{assetId:string;assetFileId:string}>){
 if(typeof snapshot.markdown!=='string')throw new Error('编辑器没有确认当前正文，请保留输入后重试。');
 const parsed=parseArticleMarkdown(snapshot.markdown,sectionsForEditor(document));
 return articleDocument.parse({...document,sections:parsed.sections,imageUses:parsed.imageRefs.map(image=>{
  const found=document.imageUses.find(item=>item.sectionId===image.sectionId&&item.assetId===image.assetId&&item.assetFileId===image.assetFileId);if(found)return found;
  const known=registered.get(`${image.assetId}:${image.assetFileId}`);if(!known)throw new Error('正文引用的素材已变化；请从 CreatorOS 素材库重新插入图片。');
  return {...known,sectionId:image.sectionId,sourceKind:'existing' as const,reviewState:'selected' as const};
 }),nativeLayout:snapshot.layout??undefined});
}

export function DoocsArticleEditor(props:Props){const scope=useNativeWorkspace();return <DoocsEditorSession key={`${creationScopeKey(scope)}:${props.outputId}`} {...props}/>;}
function DoocsEditorSession({deliveryOnly=false,showPreview=false,prepareDelivery,accountId,projectId,outputId, sourceVersionId, value, savedDocument, onChange, onSave }: Props) {
  const scope=useNativeWorkspace(),workspace=useCreationWorkspace(scope),assetClient=workspace.client;
  const lazyDelivery=deliveryOnly&&!showPreview;
  const [nativeRequested,setNativeRequested]=React.useState(!lazyDelivery);
  const nativeWaiter=React.useRef<{resolve:(handle:NativeEditorHandle)=>void;reject:(reason:Error)=>void}|null>(null);
  const deliveryPending=React.useRef(false);
  const [mountVersion]=React.useState(sourceVersionId);
  const storageOwner=scope.groupId?creationScopeKey(scope):scope.accountId??accountId??"missing";
  const editorRef = React.useRef<NativeEditorHandle>(null);
  const alive=React.useRef(true),loadSequence=React.useRef(0),controller=React.useRef<AbortController|null>(null);
  const imported=React.useRef(new Map<string,{assetId:string;assetFileId:string}>());
  const session = React.useRef(sessionId());
  const [editorReady, setEditorReady] = React.useState(false);
  const [draftMarkdown, setDraftMarkdown] = React.useState(() => serializeArticleMarkdown(sectionsForEditor(value)));
  const [draftLayout, setDraftLayout] = React.useState<ArticleDocument["nativeLayout"]>(value.nativeLayout?.editor==="doocs-md"?value.nativeLayout:undefined);
  const [checkpoint, setCheckpoint] = React.useState<StoredCheckpoint | null>(null);
  const [checkpointConflict, setCheckpointConflict] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewHtml,setPreviewHtml]=React.useState('');
  const [status, setStatus] = React.useState("正在打开公众号排版编辑器。");
  const contentFingerprint=editorFingerprint(value);
  const [acknowledged,setAcknowledged]=React.useState(''),[nativeEcho,setNativeEcho]=React.useState<string|null>(null);
  const loadingFingerprint=React.useRef<string|null>(null);
  const baseLayout=React.useRef<ArticleDocument['nativeLayout']>(undefined);
  const syncing=contentFingerprint!==acknowledged&&contentFingerprint!==nativeEcho;
  const currentDocuments=React.useRef({value,savedDocument});
  React.useLayoutEffect(()=>{currentDocuments.current={value,savedDocument};});

  function readCheckpoint() {
    const raw = sessionStorage.getItem(checkpointKey(storageOwner,outputId));
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredCheckpoint;
      if ((saved.groupId??null)!==scope.groupId||!scope.groupId&&saved.accountId!==accountId || saved.outputId !== outputId || Date.now() - saved.updatedAt > 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(checkpointKey(storageOwner,outputId)); return;
      }
      const parsed = articleDocument.safeParse(saved.document);
      if (!parsed.success) { sessionStorage.removeItem(checkpointKey(storageOwner,outputId)); return; }
      setCheckpoint({ ...saved, document: parsed.data, markdown: typeof saved.markdown === "string" ? saved.markdown : serializeArticleMarkdown(sectionsForEditor(parsed.data)) });
      const stale = saved.sourceVersionId !== sourceVersionId;
      if (!stale && typeof saved.markdown === "string") setDraftMarkdown(saved.markdown);
      if (!stale) setDraftLayout(saved.layout);
      setCheckpointConflict(stale);
    } catch { sessionStorage.removeItem(checkpointKey(storageOwner,outputId)); }
  }


  const initializeEditor=React.useCallback(async(target?:ArticleDocument,markdownOverride?:string)=>{
    const active=editorRef.current;if(!active||!alive.current)return;
    const document=target??currentDocuments.current.value, fingerprint=editorFingerprint(document);
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const generation=++loadSequence.current;
    loadingFingerprint.current=fingerprint;
    const input=editorInput(document);if(markdownOverride!==undefined)input.markdown=markdownOverride;
    try{
      const result=await active.request<EditorValue>('load',{document:input},{signal:abort.signal});
      abort.signal.throwIfAborted();if(generation!==loadSequence.current||!alive.current||editorRef.current!==active)return;
      setDraftMarkdown(typeof result.markdown==='string'?result.markdown:input.markdown);setDraftLayout((result.layout as ArticleDocument['nativeLayout'])??(document.nativeLayout?.editor==='doocs-md'?document.nativeLayout:undefined));
      baseLayout.current=result.layout as ArticleDocument['nativeLayout'];
      const failures:string[]=[];
      for(const image of document.imageUses){
        try{
          const link=await assetClient.getAssetFileDownloadUrl({params:{assetId:image.assetId,assetFileId:image.assetFileId},query:undefined,body:undefined});abort.signal.throwIfAborted();
          const response=await fetch(link.url,{credentials:'omit',signal:abort.signal});const contentType=response.headers.get('content-type')??'';const length=Number(response.headers.get('content-length')??0);
          if(!response.ok||!contentType.startsWith('image/')||length>25*1024*1024)throw new Error('素材图片无法安全读取。');
          const blob=await response.blob();abort.signal.throwIfAborted();if(!blob.type.startsWith('image/')||blob.size>25*1024*1024)throw new Error('素材图片超过25 MiB或不是图片文件。');
          if(generation!==loadSequence.current||!alive.current||editorRef.current!==active)return;
          await active.request('asset',{assetId:image.assetId,assetFileId:image.assetFileId,blob},{signal:abort.signal});
        }catch(reason){abort.signal.throwIfAborted();failures.push(reason instanceof Error?reason.message:'素材图片预览不可用。');}
      }
      if(generation!==loadSequence.current||!alive.current||editorRef.current!==active)return;
      if(showPreview){const rendered=await active.request<EditorValue>('export-html',undefined,{signal:abort.signal});abort.signal.throwIfAborted();if(generation!==loadSequence.current||!alive.current||editorRef.current!==active)return;if(typeof rendered.html!=='string')throw new Error('原版式预览未完成，请重新读取。');setPreviewHtml(DOMPurify.sanitize(rendered.html,{FORBID_TAGS:['style','iframe','object','embed','form','input','button','textarea']}));}
      if(failures.length)setError(`${failures.length}张图片预览不可用；正文与原引用已保留。`);
      setAcknowledged(fingerprint);setNativeEcho(null);if(showPreview)setStatus('保留原稿版式，在对话中调整内容。');
    }finally{if(generation===loadSequence.current)loadingFingerprint.current=null;}
  },[]);

  function receiveChanged(eventValue:unknown){
    if(deliveryOnly||!alive.current||loadingFingerprint.current!==null||!eventValue||typeof eventValue!=='object')return;
    const message=eventValue as EditorValue;
    if(typeof message.markdown==='string'){
      setDraftMarkdown(message.markdown);setDraftLayout(message.layout as typeof draftLayout);
      try{const next=documentFromSnapshot(value,message,imported.current);setNativeEcho(editorFingerprint(next));onChange(next);setError(null);setStatus('修改已在本标签页暂存，尚未保存为正式版本。');}
      catch(reason){setError(reason instanceof Error?reason.message:'文章正文无法安全解析。');}
    }
  }

  React.useEffect(() => {
    if (deliveryOnly||!editorReady||checkpoint) return;
    const timer = window.setTimeout(() => {
      try { sessionStorage.setItem(checkpointKey(storageOwner,outputId), JSON.stringify({groupId:scope.groupId,accountId:scope.accountId,outputId,sourceVersionId, updatedAt: Date.now(), document: value, markdown: draftMarkdown, layout: draftLayout } satisfies StoredCheckpoint)); }
      catch { setStatus("未保存草稿仍在编辑器内存中；浏览器刷新后无法恢复。"); }
    }, 500);
    return () => clearTimeout(timer);
  }, [accountId, outputId, sourceVersionId, value, draftMarkdown, draftLayout, editorReady,checkpoint]);

  React.useEffect(()=>{const imports=imported.current;const sequence=loadSequence;alive.current=true;return()=>{alive.current=false;session.current=sessionId();sequence.current++;controller.current?.abort();nativeWaiter.current?.reject(new Error('已离开当前稿件'));nativeWaiter.current=null;imports.clear();};},[]);

  React.useEffect(()=>{
    if(lazyDelivery||!editorReady||contentFingerprint===acknowledged||contentFingerprint===nativeEcho||loadingFingerprint.current===contentFingerprint)return;
    void initializeEditor().catch(reason=>{if(alive.current&&reason?.name!=='AbortError')setError(reason.message);});
  },[contentFingerprint,acknowledged,nativeEcho,editorReady,initializeEditor,lazyDelivery]);

  function nativeReady(){
    setEditorReady(true);
    if(lazyDelivery){const active=editorRef.current;if(active)nativeWaiter.current?.resolve(active);nativeWaiter.current=null;return;}
    readCheckpoint();void initializeEditor().catch(reason=>{if(alive.current)setError(reason.message);});
  }
  function nativeError(message:string){
    setError(message);
    if(lazyDelivery){nativeWaiter.current?.reject(new Error(message));nativeWaiter.current=null;setEditorReady(false);setNativeRequested(false);}
  }
  function requireNativeEditor():Promise<NativeEditorHandle>{
    if(editorReady&&editorRef.current)return Promise.resolve(editorRef.current);
    return new Promise((resolve,reject)=>{nativeWaiter.current={resolve,reject};setNativeRequested(true);});
  }

  function restoreCheckpoint(){
    if(!checkpoint||checkpointConflict||busy)return;
    const target=checkpoint;onChange(target.document);setNativeEcho(editorFingerprint(target.document));setCheckpoint(null);
    void initializeEditor(target.document,target.markdown).catch(reason=>{if(alive.current)setError(reason.message);});
  }

  async function saveEditorDraft(){
    if(busy||!editorReady||checkpointConflict||syncing)return;
    const active=editorRef.current;if(!active)return;const before=editorFingerprint(currentDocuments.current.value);
    setBusy(true);setError(null);
    try{
      const snapshot=await active.request<EditorValue>('snapshot');
      if(!alive.current||editorRef.current!==active||before!==editorFingerprint(currentDocuments.current.value))throw new Error('当前稿件已改变，请核对后再次保存。');
      const next=documentFromSnapshot(currentDocuments.current.value,snapshot,imported.current);
      setDraftMarkdown(snapshot.markdown!);setDraftLayout(next.nativeLayout);setNativeEcho(editorFingerprint(next));onChange(next);
      if(await onSave(next)){if(!alive.current)return;sessionStorage.removeItem(checkpointKey(storageOwner,outputId));setCheckpoint(null);setStatus('正文与排版已保存并读回正式版本。');}
    }catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'文章保存未完成。');}
    finally{if(alive.current)setBusy(false);}
  }

  async function exportFormalVersion(action:'zip'|'copy-html'='zip') {
    if(deliveryPending.current)return;
    if (busy || (!lazyDelivery&&(!editorReady||syncing)) || (!deliveryOnly&&JSON.stringify(value) !== JSON.stringify(savedDocument))) {
      setError("请先保存并读回当前稿件，再导出公众号物料。"); return;
    }
    deliveryPending.current=true;setBusy(true); setError(null);
    const requestedDocument=JSON.stringify(currentDocuments.current.value);
    try {
      const prepared=deliveryOnly&&prepareDelivery?await prepareDelivery():null;
      if(!alive.current||requestedDocument!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      if(deliveryOnly&&!prepared)throw new Error("保存尚未确认，请恢复原请求后再导出。");
      const savedDocument=prepared?.document??currentDocuments.current.savedDocument;
      const deliveryVersionId=prepared?.versionId??sourceVersionId;
      const frozen=JSON.stringify(savedDocument);
      const active=lazyDelivery?await requireNativeEditor():editorRef.current;if(!active)throw new Error('编辑器尚未准备好');
      if(!alive.current||editorRef.current!==active||requestedDocument!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      if(lazyDelivery)await initializeEditor(savedDocument);
      if(!alive.current||editorRef.current!==active||requestedDocument!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      const snapshot=await active.request<EditorValue>('snapshot');
      if(!alive.current||editorRef.current!==active||frozen!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      const actual=documentFromSnapshot(savedDocument,snapshot,imported.current);
      const expected={...savedDocument,nativeLayout:savedDocument.nativeLayout?.editor==='doocs-md'?savedDocument.nativeLayout:baseLayout.current};
      if(editorFingerprint(actual)!==editorFingerprint(expected))throw new Error('编辑器中有尚未保存的正文或排版，请先保存再导出。');
      const rendered=await active.request<EditorValue>('export-html');
      if(!alive.current||editorRef.current!==active||frozen!==JSON.stringify(currentDocuments.current.savedDocument)||frozen!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      if (rendered.error) throw new Error(rendered.error);
      if (typeof rendered.html !== "string" || !Array.isArray(rendered.bindings)) throw new Error("编辑器没有返回可导出的 HTML。");
      if(action==='copy-html'){
        if(typeof ClipboardItem==='undefined'||!navigator.clipboard?.write)throw new Error('当前环境不支持富文本复制，请导出 HTML + 图片 ZIP。');
        await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([rendered.html],{type:'text/html'}),'text/plain':new Blob([savedDocument.sections.map(section=>section.body).join('\n\n')],{type:'text/plain'})})]);
        if(alive.current)setStatus('公众号文章已按原版式复制。');return;
      }
      const files: Record<string, Uint8Array> = {};
      const bindingPaths = new Map<string, string>();
      for (const [index, image] of savedDocument.imageUses.entries()) {
        const bindingKey = `${image.assetId}:${image.assetFileId}`;
        const binding = rendered.bindings.find((item) => item.key === bindingKey);
        if (!binding) throw new Error(`缺少段落 ${image.sectionId} 的图片绑定，导出已停止。`);
        const download = await assetClient.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined });
        const imageResponse = await fetch(download.url, { credentials: "omit" });
        const contentType = imageResponse.headers.get("content-type") ?? "";
        if (!imageResponse.ok || !contentType.startsWith("image/")) throw new Error(`无法下载公众号正文图片「${download.fileName}」，导出未生成。`);
        const imageBlob = await imageResponse.blob();
        if (!imageBlob.type.startsWith("image/") || imageBlob.size > 25 * 1024 * 1024) throw new Error("导出图片不是受支持的图片文件或超过 25 MiB。");
        const ext = download.fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? (imageBlob.type === "image/jpeg" ? "jpg" : "png");
        const relativePath = `assets/image-${String(index + 1).padStart(2, "0")}.${ext}`;
        bindingPaths.set(binding.url, relativePath);
        files[relativePath] = new Uint8Array(await imageBlob.arrayBuffer());
      }
      const safeTitle = savedDocument.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "公众号文章";
      const content = rendered.html.replace(/src=(['"])(blob:[^'"]+)\1/g, (_match, quote: string, url: string) => {
        const path = bindingPaths.get(url);
        if (!path) throw new Error("公众号预览存在未绑定图片，导出已停止。");
        return `src=${quote}${path}${quote}`;
      });
      files["index.html"] = strToU8(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body><article>${content}</article></body></html>`);
      files["manifest.json"] = strToU8(JSON.stringify({ outputId, versionId: deliveryVersionId, title: safeTitle, imageOrder: [...bindingPaths.values()], layout: savedDocument.nativeLayout ? "saved" : "base-theme", generatedAt: new Date().toISOString() }, null, 2));
      if(!alive.current||frozen!==JSON.stringify(currentDocuments.current.savedDocument)||frozen!==JSON.stringify(currentDocuments.current.value))throw new Error('稿件已改变，请重新导出');
      const archive = zipSync(files, { level: 6 });
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive).buffer as ArrayBuffer], { type: "application/zip" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${safeTitle}-公众号物料.zip`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("已导出当前正式版本的 HTML 与图片 ZIP；请解压后用相对路径检查图片。");
    } catch (reason) { if(alive.current)setError(reason instanceof Error ? reason.message : "公众号导出未完成。"); }
    finally { deliveryPending.current=false;if(alive.current)setBusy(false); }
  }

  return <section className={deliveryOnly&&!showPreview?"contents":"min-w-0 space-y-3 rounded-xl border p-2 sm:p-4"}>
    <div className="flex flex-wrap items-center justify-between gap-3">{(!deliveryOnly||showPreview)&&<div className="min-w-0"><h3 className="text-[13.5px] font-semibold">{showPreview?"成稿预览":"公众号排版编辑器"}</h3><p className="text-xs text-muted-foreground">{syncing?"正在同步当前正文与排版…":status}</p></div>}
      <div className="flex min-w-0 w-full flex-wrap gap-2 sm:w-auto">{showPreview&&<Button variant="outline" disabled={busy||!editorReady||syncing} onClick={()=>void exportFormalVersion('copy-html')}>复制公众号文章</Button>}<Button className="h-auto min-h-8 w-full max-w-full whitespace-normal sm:h-8 sm:w-auto sm:whitespace-nowrap" variant="outline" onClick={() => void exportFormalVersion()} disabled={busy || (!lazyDelivery&&(!editorReady||syncing)) || (!deliveryOnly&&JSON.stringify(value) !== JSON.stringify(savedDocument))}>导出 HTML + 图片 ZIP</Button>
        {!deliveryOnly&&<Button className="h-auto min-h-8 w-full max-w-full whitespace-normal sm:h-8 sm:w-auto sm:whitespace-nowrap" onClick={() => void saveEditorDraft()} disabled={busy || !editorReady || syncing || checkpointConflict}>{busy ? "处理中…" : "保存正文与排版"}</Button>}</div></div>
    {lazyDelivery&&busy&&<p role="status" className="text-xs text-muted-foreground">正在准备导出，完成后将自动下载。</p>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}{!lazyDelivery&&syncing&&<Button className="ml-2" size="sm" variant="outline" disabled={busy} onClick={()=>void initializeEditor().catch(reason=>{if(alive.current)setError(reason.message);})}>重新读取当前稿</Button>}</p>}
    {checkpoint && <div role="status" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
      {checkpointConflict ? <><span>标签页保存了旧版本草稿。当前正式稿已变化，请比较内容；旧草稿只读，不可直接覆盖当前版本。</span>
        <details className="mt-2"><summary className="cursor-pointer">查看旧草稿</summary><p className="mt-2 font-medium">{checkpoint.document.title}</p><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-surface p-2">{checkpoint.markdown}</pre></details></> : "发现此标签页上次未保存的草稿。"}
      {!checkpointConflict && <Button className="ml-3" size="sm" variant="outline" onClick={restoreCheckpoint}>恢复未保存草稿</Button>}
      <Button className="ml-2" size="sm" variant="ghost" onClick={() => { sessionStorage.removeItem(checkpointKey(storageOwner,outputId)); setCheckpoint(null); setCheckpointConflict(false); }}>放弃旧草稿并继续当前稿</Button>
    </div>}
    {showPreview&&<div aria-label="原版式成稿预览" className="mx-auto max-w-[680px] overflow-auto rounded-md bg-white p-6 text-neutral-900" dangerouslySetInnerHTML={{__html:previewHtml}}/>}
    {nativeRequested&&<div aria-hidden={deliveryOnly||undefined} inert={deliveryOnly||undefined} style={deliveryOnly?{position:"fixed",left:-10000,top:0,width:800,height:700,visibility:"hidden"}:undefined} className="h-[700px] min-h-0 overflow-hidden rounded-md border bg-surface"><NativeEditorSurface ref={editorRef} editor="doocs-md" owner={{groupId:scope.groupId,accountId:scope.accountId,projectId,outputId,sourceVersionId:mountVersion}} disabled={busy||syncing} onReady={nativeReady} onChanged={receiveChanged} onError={nativeError} onImport={async file=>{
      const output=await workspace.client.getOutput({params:{outputId},query:undefined,body:undefined});if(!alive.current)throw new Error('已离开当前稿件');
      const ref=await uploadEditorMedia(output.projectId,outputId,file,workspace.capture());if(!alive.current)throw new Error('已离开当前稿件');
      imported.current.set(`${ref.assetId}:${ref.assetFileId}`,{assetId:ref.assetId,assetFileId:ref.assetFileId});
      return {mediaId:`creatoros-asset:${ref.assetId}:${ref.assetFileId}`};
    }}/></div>}
    {!deliveryOnly&&<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">开源来源与许可</summary><a className="underline" href="/reference-editors/sources/doocs-md/native-source.tar.gz" download>Doocs 对应源码与许可</a></details>}
  </section>;
}
