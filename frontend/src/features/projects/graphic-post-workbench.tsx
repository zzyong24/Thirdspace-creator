"use client";
import {useCreationClient,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import type { CreativeResult, GraphicPostDocument, GraphicPostResource } from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import {fillScriptMetadata} from "./script-derived-metadata";
import { GraphicPostResults } from "./graphic-post-results";
import {NoteRelayEditor} from "@/features/reference-editors/noterelay/noterelay-editor";
import {LazyDisclosure} from "@/features/reference-editors/noterelay/lazy-disclosure";
import {GraphicSeriesPanel} from "./graphic-series-panel";
import {graphicDeliveryImages,setGraphicCover,normalizeGraphicImages} from "./graphic-series-document";
import {openGraphicPageCanvas} from "@/features/creative-canvas/graphic-page-context";
import {zipSync,strToU8} from "fflate";
import { OutputConversionPanel } from "./output-conversion-panel";
import {GraphicDesignWorkbench} from "@/features/reference-editors/graphic-design-workbench";
import type {ReferenceEditorMedia} from "@creatoros/contract";
import { PublicationResultActions } from "./publication-result-actions";

type ImageUse = GraphicPostDocument["imageUses"][number];
type ImageAsset = { id: string; name: string; assetType: string; status: string; currentFileId: string | null };

function normalizeImages(images: ImageUse[]): ImageUse[] {
  return images.map((image, order) => ({ ...image, order }));
}

function ImagePreview({ image }: { image: ImageUse }) {
 const client=useCreationClient();

  const [url, setUrl] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void client.getAssetFileDownloadUrl({ params: { assetId: image.assetId, assetFileId: image.assetFileId }, query: undefined, body: undefined })
      .then((result) => { if (active) setUrl(result.url); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [image.assetId, image.assetFileId]);
  return url
    ? <Image src={url} alt={image.role === "cover" ? "已选封面" : "已选图卡"} width={512} height={256} unoptimized className="h-32 w-full rounded-md object-contain bg-surface-subtle" />
    : <div className="flex h-32 items-center justify-center rounded-md bg-surface-subtle text-xs text-muted-foreground">{unavailable ? "图片版本暂不可读取" : "读取图片中…"}</div>;
}

type WorkbenchProps = {
  projectId: string;
  projectTitle: string;
  accountId:string|null;
  initial: GraphicPostResource;
  initialStartStatus?: string;
};
export function GraphicPostWorkbench(props:WorkbenchProps){const workspaceSelection=useCreationScope();return <GraphicPostWorkbenchSession key={`${creationScopeKey(workspaceSelection)}:${props.initial.outputId}`} {...props}/>;}
function GraphicPostWorkbenchSession({projectId,projectTitle,accountId,initial,initialStartStatus}:WorkbenchProps) {
 const client=useCreationClient();

  const router = useRouter();
  const [selectedCardId,setSelectedCardId]=React.useState<string|null>(initial.current.cardBriefs?.[0]?.cardId??null);
  const [selectedCardIds,setSelectedCardIds]=React.useState<string[]>(initial.current.cardBriefs?.map(card=>card.cardId)??[]);
  const [exportBusy,setExportBusy]=React.useState(false);
  const [canvasBusy,setCanvasBusy]=React.useState(false);
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [designTarget,setDesignTarget]=React.useState<{kind:"cover"}|{kind:"card";cardId:string}|null>(null);
  const [state, setState] = React.useState(initial);
  const [draft, setDraft] = React.useState<GraphicPostDocument>(()=>fillScriptMetadata(initial.current,initial.scriptContext));
  const [tagsInput, setTagsInput] = React.useState(()=>fillScriptMetadata(initial.current,initial.scriptContext).tags.join("、"));
  const [assets, setAssets] = React.useState<ImageAsset[]>([]);
  const [assetPage, setAssetPage] = React.useState(1);
  const [hasMoreAssets, setHasMoreAssets] = React.useState(true);
  const [assetId, setAssetId] = React.useState("");
  const [assetBusy, setAssetBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [startStatus, setStartStatus] = React.useState(initialStartStatus);
  const [startResolutionMessage, setStartResolutionMessage] = React.useState<string | null>(null);
  const startResolved = React.useRef(false);
  const [preview, setPreview] = React.useState<{ versionId: string; document: GraphicPostDocument } | null>(null);
  const designSaveRequest=React.useRef<{digest:string;input:Parameters<typeof client.createGraphicPostVersion>[0]["body"]}|null>(null);
  const saveRequest = React.useRef({ id: crypto.randomUUID(), digest: "" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.current);
  const draftRef=React.useRef(draft);
  const stateRef=React.useRef(state);
  React.useLayoutEffect(()=>{draftRef.current=draft;stateRef.current=state;},[draft,state]);
  const pageIds=draft.cardBriefs?.map(card=>card.cardId)??[];
  const activeCardId=selectedCardId&&pageIds.includes(selectedCardId)?selectedCardId:pageIds[0]??null;
  const activeCardIds=selectedCardIds.filter(id=>pageIds.includes(id));

  const onResultListResolved = React.useCallback((bodyResult: CreativeResult | null) => {
    if (initialStartStatus !== "unknown" || startResolved.current) return;
    startResolved.current = true;
    setStartStatus(undefined);
    if (!bodyResult) setStartResolutionMessage("未读到自动首稿任务。你可以直接写正文，或使用下方的生成正文入口。");
    const url = new URL(window.location.href);
    url.searchParams.delete("start");
    window.history.replaceState(window.history.state, "", url);
  }, [initialStartStatus]);

  async function refreshPost(expectedDraft?:string) {
    const snapshot=JSON.stringify(draftRef.current);
    const replaceDraft=expectedDraft!==undefined?snapshot===expectedDraft:snapshot===JSON.stringify(stateRef.current.current);
    const latest = await client.getGraphicPost({ params: { outputId: state.outputId }, query: undefined, body: undefined });
    if(!mounted.current)return;
    setState(latest);
    if(replaceDraft&&JSON.stringify(draftRef.current)===snapshot){setDraft(structuredClone(latest.current));setTagsInput(latest.current.tags.join("、"));}
    else setMessage("作品已读回，期间新增的输入已保留；请审阅后保存。");
    router.refresh();
  }

  const loadAssets = React.useCallback(async (page: number) => {
    setAssetBusy(true);
    try {
      const rows = await client.listAssets({ params: undefined, query: { page, pageSize: 50, status: "active" }, body: undefined }) as unknown as ImageAsset[];
      if(!mounted.current)return;
      const imageRows = rows.filter((asset) => asset.assetType === "image" && asset.currentFileId);
      setAssets((previous) => page === 1 ? imageRows : [...previous, ...imageRows]);
      setHasMoreAssets(rows.length === 50);
      setAssetPage(page);
      setError(null);
    } catch (reason) {
      if(!mounted.current)return;
      setError(describeUserError(reason, "图片素材暂未读取到，请重试。"));
    } finally {
      if(mounted.current)setAssetBusy(false);
    }
  }, []);
  React.useEffect(() => { void Promise.resolve().then(() => loadAssets(1)); }, [loadAssets]);

  function addImage() {
    const asset = assets.find((item) => item.id === assetId && item.currentFileId);
    if (!asset?.currentFileId) return;
    if (draft.imageUses.some((image) => image.assetId === asset.id && image.assetFileId === asset.currentFileId)) return;
    setDraft((current) => ({ ...current, imageUses: normalizeImages([...current.imageUses, {
      assetId: asset.id, assetFileId: asset.currentFileId!, order: current.imageUses.length,
      role: current.imageUses.some((image) => image.role === "cover") ? "card" : "cover",
    }]) }));
    setAssetId("");
  }
  function editLegacyImages(next:ImageUse[]){setDraft(current=>normalizeGraphicImages({...current,imageUses:[...next,...current.imageUses.filter(image=>image.role==="card"&&image.cardId)]}));}
  const legacyImages=draft.imageUses.filter(image=>image.role==="cover"||!image.cardId);
  async function save(): Promise<boolean> {
    if (busy) return false;
    if (!dirty) return true;
    const digest = JSON.stringify({ outputId: state.outputId, versionId: state.currentVersionId, document: draft });
    if (saveRequest.current.digest !== digest) saveRequest.current = { id: crypto.randomUUID(), digest };
    setBusy(true); setError(null); setMessage(null);
    try {
      await client.createGraphicPostVersion({
        params: { outputId: state.outputId }, query: undefined,
        body: { expectedCurrentVersionId: state.currentVersionId, document: draft, clientRequestId: saveRequest.current.id },
      });
      if(!mounted.current)return false;
      await refreshPost(JSON.stringify(draft));
      saveRequest.current = { id: crypto.randomUUID(), digest: "" };
      setMessage("作品已保存。");
      return true;
    } catch (reason) {
      if(!mounted.current)return false;
      setError(describeUserError(reason, "保存未完成。当前输入已保留，请检查后重试。"));
      return false;
    } finally {
      if(mounted.current)setBusy(false);
    }
  }
  async function openVersion(versionId: string) {
    try {
      const next = await client.getGraphicPostVersion({ params: { outputId: state.outputId, versionId }, query: undefined, body: undefined });
      if(!mounted.current)return;
      setPreview(next);
      setError(null);
    } catch (reason) {
      if(mounted.current)setError(describeUserError(reason, "历史版本暂不可读取。"));
    }
  }

  const currentDesign=designTarget?draft.designs?.find(design=>design.target.kind===designTarget.kind&&(design.target.kind==='cover'||(designTarget.kind==='card'&&design.target.cardId===designTarget.cardId)))??{target:designTarget,document:{editor:'kuaitu' as const,revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',nativeDocument:{},mediaRefs:[]}}:null;
  async function saveDesign(design:NonNullable<GraphicPostDocument['designs']>[number],image?:ReferenceEditorMedia){
    const designs=[...(draft.designs??[]).filter(old=>old.target.kind!==design.target.kind||(old.target.kind==='card'&&design.target.kind==='card'&&old.target.cardId!==design.target.cardId)),design];
    const images=image?[...draft.imageUses.filter(old=>design.target.kind==='cover'?old.role!=='cover':!(old.role==='card'&&old.cardId===(design.target as {cardId:string}).cardId)),{assetId:image.assetId,assetFileId:image.assetFileId,role:design.target.kind==='cover'?'cover' as const:'card' as const,...(design.target.kind==='card'?{cardId:design.target.cardId}:{}),order:0}]:draft.imageUses;
    const next={...draft,designs,imageUses:normalizeImages(images)};
    const digest=JSON.stringify({version:state.currentVersionId,document:next});
    if(!designSaveRequest.current||designSaveRequest.current.digest!==digest)designSaveRequest.current={digest,input:{expectedCurrentVersionId:state.currentVersionId,document:next,clientRequestId:crypto.randomUUID()}};
    const input=designSaveRequest.current.input;
    await client.createGraphicPostVersion({params:{outputId:state.outputId},query:undefined,body:input});
    await refreshPost(JSON.stringify(draft));
    designSaveRequest.current=null;
  }
  async function enterCanvas(cardId:string){
    if(canvasBusy)return;setCanvasBusy(true);setError(null);
    try{if(!(await save())||!mounted.current)return;const snapshot=JSON.stringify(draftRef.current);const path=await openGraphicPageCanvas({accountId,projectId,outputId:state.outputId,cardId});if(mounted.current){if(JSON.stringify(draftRef.current)!==snapshot){setMessage("画布已准备好。期间新增的输入已保留，请保存后再次进入。");return;}router.push(path);}}
    catch(reason){if(mounted.current)setError(describeUserError(reason,"进入画布未完成，当前作品和输入保留。"));}
    finally{if(mounted.current)setCanvasBusy(false);}
  }
  async function exportGroup(){
    if(exportBusy)return;setExportBusy(true);setError(null);
    try{
      if(!(await save())||!mounted.current)return;
      const latest=await client.getGraphicPost({params:{outputId:state.outputId},query:undefined,body:undefined});
      if(!mounted.current)return;
      const images=graphicDeliveryImages(latest.current),files:Record<string,Uint8Array>={};
      const manifest:{order:number;assetId:string;assetFileId:string;file:string}[]=[];
      for(const [index,image] of images.entries()){
        const target=await client.getAssetFileDownloadUrl({params:{assetId:image.assetId,assetFileId:image.assetFileId},query:undefined,body:undefined});
        const response=await fetch(target.url);if(!response.ok)throw new Error('图片版本暂不可读取，请稍后重新导出。');
        const blob=await response.blob(),extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':blob.type==='image/gif'?'gif':'png';
        const name=`${String(index+1).padStart(2,'0')}.${extension}`;files[name]=new Uint8Array(await blob.arrayBuffer());manifest.push({order:index+1,assetId:image.assetId,assetFileId:image.assetFileId,file:name});
      }
      files['配文.txt']=new Uint8Array(strToU8([latest.current.title,latest.current.body,latest.current.summary,latest.current.tags.map(tag=>`#${tag}`).join(' ')].filter(Boolean).join('\n\n')));
      files['图片顺序.json']=new Uint8Array(strToU8(JSON.stringify(manifest,null,2)));
      if(!mounted.current)return;
      const blob=new Blob([zipSync(files) as BlobPart],{type:'application/zip'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=url;anchor.download='图文作品.zip';anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      setMessage(`已导出 ${images.length} 张精确图片和配文，封面相同文件只导出一次。`);
    }catch(reason){if(mounted.current)setError(describeUserError(reason,'导出未完成，作品已保留，请重试。'));}
    finally{if(mounted.current)setExportBusy(false);}
  }
  return <main data-page="graphic-post-workbench" className="mx-auto w-full max-w-[1600px] space-y-4 px-5 py-4 text-sm md:px-8">
    <div className="flex flex-wrap justify-end gap-3" aria-label="图文操作">
      <Button variant="outline" disabled={busy||exportBusy} onClick={()=>void exportGroup()}>{exportBusy?"导出中…":"导出整组"}</Button>
      <Button className="min-h-11 px-5 text-sm" title={busy ? "正在保存…" : dirty ? "有未保存的修改" : "修改已保存"} onClick={() => void save()} disabled={busy || !dirty}>{busy ? "保存中…" : "保存作品"}</Button>
    </div>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{message}</p>}
    {startStatus === "unavailable" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建。当前无法自动生成首稿，可以直接在下方写正文并保存。</p>}
    {startStatus === "source-unavailable" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建，但所选来源正文暂不可读取。请在下方输入主题或正文，仍可继续保存。</p>}
    {startStatus === "unknown" && <p className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">作品已创建。首稿提交状态暂未确认；下方候选列表会从服务端读取，手写也可继续。</p>}
    {startResolutionMessage && <p role="status" className="rounded-md bg-surface-subtle p-3 text-sm text-muted-foreground">{startResolutionMessage}</p>}
    {currentDesign&&<GraphicDesignWorkbench key={currentDesign.target.kind==='cover'?'cover':currentDesign.target.cardId} accountId={accountId} sourceVersionId={state.currentVersionId} projectId={projectId} outputId={state.outputId} title={currentDesign.target.kind==='cover'?`${draft.title||projectTitle} · 封面`:draft.cardBriefs?.find(card=>currentDesign.target.kind==='card'&&card.cardId===currentDesign.target.cardId)?.title||'图卡'} design={currentDesign} onSave={saveDesign} onReload={async()=>{await refreshPost();if(mounted.current)designSaveRequest.current=null;}} onClose={()=>setDesignTarget(null)}/>}


    {state.scriptContext?.message && <p className="text-sm text-muted-foreground">{state.scriptContext.message}</p>}
    {draft.imageMatchWarnings?.map((warning,index)=><p key={index} role="status" className="text-sm text-muted-foreground">{warning}</p>)}
    <GraphicPostResults key={`${accountId}:${state.outputId}`} accountId={accountId} outputId={state.outputId} targetPlatform={state.targetPlatform} currentVersionId={state.currentVersionId} manualDraftDirty={dirty} prepareGeneration={save} onAdopt={()=>refreshPost()} onResultListResolved={onResultListResolved} scriptDerived
      series={{cards:draft.cardBriefs??[],selectedCardId:activeCardId,selectedCardIds:activeCardIds}}/>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,1fr)]">
      <fieldset disabled={busy} aria-busy={busy} aria-label="编辑图文作品" className="min-w-0 space-y-4">
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-label="图文稿件"><h2 className="text-[13.5px] font-semibold">当前稿件</h2>
          <label className="block text-sm font-medium">标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3" placeholder="输入作品标题" /></label>

          <label className="block text-sm font-medium">简介或摘要<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className="mt-2 min-h-24 w-full rounded-md border border-border bg-background p-3" placeholder="可选" /></label>
          <label className="block text-sm font-medium">标签<input value={tagsInput} onChange={(event) => { setTagsInput(event.target.value); setDraft({ ...draft, tags: event.target.value.split(/[、,，\n]+/).map((tag) => tag.trim()).filter(Boolean) }); }} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3" placeholder="多个标签用顿号分隔" /></label>
          <label className="block text-sm font-medium">正文<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className="mt-2 min-h-96 w-full rounded-md border border-border bg-background p-4 text-sm leading-relaxed" placeholder="直接写正文，或粘贴已经准备好的文案" /></label>
        </section>

        <details className="rounded-xl border border-border bg-surface p-5" aria-label="图文图片"><summary className="cursor-pointer text-sm font-medium">手动选图与封面</summary><div className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">封面与原照片</h2><p className="mt-1 text-sm text-muted-foreground">没有绑定页的原照片可以继续使用。封面保留独立用途，不会取消原页绑定。</p></div><Link href="/assets" className="text-sm text-primary hover:underline">上传图片素材 →</Link></div>
          <div className="mt-4 flex gap-2"><select aria-label="选择图片素材" value={assetId} onChange={(event) => setAssetId(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm"><option value="">选择已有图片</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><Button variant="outline" disabled={!assetId} onClick={addImage}>添加图片</Button></div>
          {hasMoreAssets && <Button variant="ghost" size="sm" disabled={assetBusy} onClick={() => void loadAssets(assetPage + 1)} className="mt-2">{assetBusy ? "读取中…" : "加载更多图片"}</Button>}
          {draft.imageUses.some(image=>image.role==="cover"||!image.cardId) ? <ol className="mt-4 grid gap-3 sm:grid-cols-2">{legacyImages.map((image, index) => <li key={`${image.role}:${image.cardId??"unbound"}:${image.assetId}:${image.assetFileId}`} className="rounded-lg border border-border p-3"><ImagePreview image={image} /><div className="mt-2 flex items-center justify-between text-xs"><span>{image.role === "cover" ? "封面" : `原照片 ${index + 1}`}</span><span>{index + 1} / {legacyImages.length}</span></div><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={index === 0||image.role==="cover"||legacyImages[index-1]?.role==="cover"} onClick={() => { const next = [...legacyImages]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; editLegacyImages(next); }}>上移</Button><Button size="sm" variant="outline" disabled={index === legacyImages.length - 1||image.role==="cover"} onClick={() => { const next = [...legacyImages]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; editLegacyImages(next); }}>下移</Button><Button size="sm" variant="outline" disabled={image.role === "cover"} onClick={() => setDraft(current=>setGraphicCover(current,image))}>设为封面</Button><Button size="sm" variant="ghost" onClick={() => editLegacyImages(legacyImages.filter((_, position) => position !== index))}>移除</Button></div></li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">暂无图片。文字可先保存，图片稍后补充。</p>}
        </div></details>
      </fieldset>
      <aside className="min-w-0 space-y-4">    <NoteRelayEditor projectId={projectId} accountId={accountId} outputId={state.outputId} sourceVersionId={state.currentVersionId} platform="rednote" value={draft} disabled={busy} onLayoutChange={layout=>setDraft(current=>({...current,nativeLayout:layout}))}/><details id="graphic-history" className="scroll-mt-48 rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer text-sm font-medium">历史版本</summary><ol className="mt-3 space-y-2 text-sm">{state.versions.map((version) => <li key={version.id}><button type="button" onClick={() => void openVersion(version.id)} className="text-left text-primary hover:underline">v{version.versionNumber} · {version.createdAt.slice(0, 16).replace("T", " ")}</button></li>)}</ol></details></aside>
    </div>
    <details aria-label="发布内容" className="rounded-xl border border-border bg-surface"><summary className="cursor-pointer px-5 py-4 text-sm font-medium">首图、简介、话题与审核</summary><div className="border-t border-border p-4"><Button size="sm" variant="outline" disabled={busy} onClick={()=>setDesignTarget({kind:'cover'})}>快图细调封面</Button><PublicationResultActions accountId={accountId} outputId={state.outputId} outputType="image" platform={state.targetPlatform==='xiaohongshu'?'xiaohongshu':null} dirty={dirty}/></div></details>

        <LazyDisclosure label="逐页创作与 AI 辅助">{()=> <>
    <OutputConversionPanel key={`${accountId}:${state.outputId}`} accountId={accountId} projectId={projectId} outputId={state.outputId} sourceType="image" versionId={state.currentVersionId} dirty={dirty} fields={{title:state.current.title,body:state.current.body,summary:state.current.summary,tags:state.current.tags}} images={state.current.imageUses}/>
    <GraphicSeriesPanel document={draft} onChange={setDraft} selectedCardId={activeCardId} selectedCardIds={activeCardIds} onSelect={setSelectedCardId} onSelectionChange={setSelectedCardIds} assets={assets} disabled={busy||canvasBusy}
      onOpenCanvas={cardId=>void enterCanvas(cardId)} onOpenDesign={cardId=>setDesignTarget({kind:'card',cardId})}>

    </GraphicSeriesPanel>    </>}</LazyDisclosure>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>历史版本预览</DialogTitle></DialogHeader>

    {preview && <><p className="font-medium">{preview.document.title || "未命名"}</p><p className="whitespace-pre-wrap text-sm">{preview.document.body}</p>
          {preview.document.cardBriefs?.map((card,index)=><section key={card.cardId} className="space-y-1 rounded-md border border-border p-3"><h3 className="font-medium">第 {index+1} 页 · {card.title || "未填写标题"}</h3><p className="whitespace-pre-wrap text-sm">{card.body}</p></section>)}<p className="text-xs text-muted-foreground">此版本含 {preview.document.imageUses.length} 张图片、{preview.document.tags.length} 个标签。</p></>}
      </DialogContent>
    </Dialog>
  </main>;
}
