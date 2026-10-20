"use client";
import {useCreationClient,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";

import * as React from "react";
import type {WorkEditorTarget} from "@creatoros/contract";
import {useDraftChatRequest,editorDigest,editorCanonical,editorCandidateOutputId,derivedEditorDraft,matchesDerivedCandidate,type EditorSaveCandidate,type DraftEditorPort} from "@/features/draft-workbench/draft-chat-request";
import {saveWorkEditorCandidate} from "@/features/copilot/chat-work-editor-card";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CreativeResult, GraphicPostDocument, GraphicPostResource } from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeUserError } from "@/lib/ai-error-humanize";
import {inheritGraphicScript,reorganizePrompt} from "./script-first-content";
import { GraphicPostResults } from "./graphic-post-results";
import {NoteRelayEditor} from "@/features/reference-editors/noterelay/noterelay-editor";
import {LazyDisclosure} from "@/features/reference-editors/noterelay/lazy-disclosure";
import {graphicDeliveryImages} from "./graphic-series-document";
import {zipSync,strToU8} from "fflate";

import { PublicationResultActions } from "./publication-result-actions";

type WorkbenchProps = {
  projectId: string;
  projectTitle: string;
  accountId:string|null;
  initial: GraphicPostResource;
  initialStartStatus?: string;
};
export function GraphicPostWorkbench(props:WorkbenchProps){const workspaceSelection=useCreationScope();return <GraphicPostWorkbenchSession key={`${creationScopeKey(workspaceSelection)}:${props.initial.outputId}`} {...props}/>;}
function GraphicPostWorkbenchSession({projectId,accountId,initial,initialStartStatus}:WorkbenchProps) {
 const client=useCreationClient(),scope=useCreationScope();

  const router = useRouter();
  const [selectedCardId,setSelectedCardId]=React.useState<string|null>(initial.current.cardBriefs?.[0]?.cardId??null);
  const [selectedCardIds,setSelectedCardIds]=React.useState<string[]>(initial.current.cardBriefs?.map(card=>card.cardId)??[]);
  const [exportBusy,setExportBusy]=React.useState(false);
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [state, setState] = React.useState(initial);
  const [draft, setDraftState] = React.useState<GraphicPostDocument>(()=>inheritGraphicScript(initial.current,initial.scriptContext));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [startStatus, setStartStatus] = React.useState(initialStartStatus);
  const [startResolutionMessage, setStartResolutionMessage] = React.useState<string | null>(null);
  const [directorImageRequest,setDirectorImageRequest]=React.useState<{cardId:string;visualRequirements:string}|null>(null);
  const startResolved = React.useRef(false);
  const [preview, setPreview] = React.useState<{ versionId: string; document: GraphicPostDocument } | null>(null);
  const graphicSaveIntent=React.useRef<{body:{expectedCurrentVersionId:string;document:GraphicPostDocument;clientRequestId:string};draftDigest:string}|null>(null);
  const saveStorageKey=`creatoros:graphic:request:${creationScopeKey(useCreationScope())}:${initial.outputId}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.current);
  const draftRef=React.useRef(draft);
  const stateRef=React.useRef(state);
  React.useLayoutEffect(()=>{draftRef.current=draft;stateRef.current=state;},[draft,state]);
  const chat=useDraftChatRequest(),generationRef=React.useRef(0),targetRef=React.useRef<WorkEditorTarget|null>(null),portRef=React.useRef<DraftEditorPort|null>(null),savePromiseRef=React.useRef<Promise<boolean>|null>(null);
  const [firstDerived]=React.useState(()=>derivedEditorDraft({scopeKey:creationScopeKey(scope),projectId,outputId:initial.outputId,owner:"graphic_post",artifactId:initial.artifactId,currentVersionId:initial.currentVersionId,current:initial.current,draft,generation:generationRef.current,scriptContext:initial.scriptContext}));
  const derivedRef=React.useRef(firstDerived);
  const admittedRef=React.useRef<{candidate:string;proof:NonNullable<ReturnType<typeof derivedEditorDraft>>}|null>(null);
  const selectionRef=React.useRef<Extract<WorkEditorTarget,{owner:"graphic_post"}>["selection"]>({kind:"graphic_post",cardIds:[]});
  const setDraft=React.useCallback((value:React.SetStateAction<GraphicPostDocument>)=>{const next=typeof value==='function'?value(draftRef.current):value;if(editorCanonical(next)!==editorCanonical(draftRef.current)){derivedRef.current=null;admittedRef.current=null;generationRef.current++;draftRef.current=next;selectionRef.current={kind:"graphic_post",cardIds:[]};chat.notifyEditorChanged();}setDraftState(next);},[chat.notifyEditorChanged]);
  function save():Promise<boolean>{derivedRef.current=null;admittedRef.current=null;if(savePromiseRef.current)return savePromiseRef.current;const work=saveCore();savePromiseRef.current=work;return work.finally(()=>{if(savePromiseRef.current===work)savePromiseRef.current=null;});}

  const pageIds=draft.cardBriefs?.map(card=>card.cardId)??[];
  const activeCardId=selectedCardId&&pageIds.includes(selectedCardId)?selectedCardId:pageIds[0]??null;
  const activeCardIds=selectedCardIds.filter(id=>pageIds.includes(id));

  const onResultListResolved = React.useCallback((bodyResult: CreativeResult | null) => {
    if (initialStartStatus !== "unknown" || startResolved.current) return;
    startResolved.current = true;
    setStartStatus(undefined);
    if (!bodyResult) setStartResolutionMessage("未读到自动首稿任务。请在脚本保存原稿，再点击“重新组织内容”。");
    const url = new URL(window.location.href);
    url.searchParams.delete("start");
    window.history.replaceState(window.history.state, "", url);
  }, [initialStartStatus]);

  async function refreshPost(expectedDraft?:string) {
    derivedRef.current=null;admittedRef.current=null;
    const snapshot=JSON.stringify(draftRef.current);
    const replaceDraft=expectedDraft!==undefined?snapshot===expectedDraft:snapshot===JSON.stringify(stateRef.current.current);
    const latest = await client.getGraphicPost({ params: { outputId: state.outputId }, query: undefined, body: undefined });
    if(!mounted.current)return;
    setState(latest);
    if(replaceDraft&&JSON.stringify(draftRef.current)===snapshot){setDraft(structuredClone(latest.current));}
    else setMessage("作品已读回，期间新增的输入已保留；请审阅后保存。");
    router.refresh();
  }

  async function saveCore(): Promise<boolean> {
    if(busy)return false;
    const frozenDraft=editorCanonical(draftRef.current),current=stateRef.current;
    if(!graphicSaveIntent.current){const stored=sessionStorage.getItem(saveStorageKey);if(stored){try{graphicSaveIntent.current=JSON.parse(stored);}catch{throw Error("原保存记录无法读取，请保留当前稿并核对。");}}}
    if(!graphicSaveIntent.current&&frozenDraft===editorCanonical(current.current))return true;
    if(!graphicSaveIntent.current){graphicSaveIntent.current={body:{expectedCurrentVersionId:current.currentVersionId,document:structuredClone(draftRef.current),clientRequestId:crypto.randomUUID()},draftDigest:frozenDraft};sessionStorage.setItem(saveStorageKey,JSON.stringify(graphicSaveIntent.current));}
    const intent=graphicSaveIntent.current;setBusy(true);setError(null);setMessage(null);
    try{
      const receipt=await client.createGraphicPostVersion({params:{outputId:current.outputId},query:undefined,body:intent.body});
      const exact=await client.getGraphicPostVersion({params:{outputId:current.outputId,versionId:receipt.versionId},query:undefined,body:undefined});
      if(exact.versionId!==receipt.versionId||editorCanonical(exact.document)!==editorCanonical(intent.body.document))throw Error("指定版本读回与保存内容不一致，原请求保留。");
      const latest=await client.getGraphicPost({params:{outputId:current.outputId},query:undefined,body:undefined});if(!mounted.current)return false;
      const changed=editorCanonical(draftRef.current)!==frozenDraft,recovered=intent.draftDigest!==frozenDraft;
      stateRef.current=latest;setState(latest);graphicSaveIntent.current=null;sessionStorage.removeItem(saveStorageKey);
      if(latest.currentVersionId!==receipt.versionId||editorCanonical(latest.current)!==editorCanonical(exact.document)){setMessage("此请求已保存，但当前作品已有更新，当前输入保留。");return false;}
      if(changed||recovered){setMessage("原请求已保存，期间的新输入已保留，请再次保存当前修改。");return false;}
      setDraft(structuredClone(latest.current));setMessage("作品已保存。");return true;
    }catch(reason){if(mounted.current)setError(describeUserError(reason,"保存未确认，当前输入和原请求已保留，请恢复原请求。"));return false;}
    finally{if(mounted.current)setBusy(false);}
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

  const derivedCurrent=(proof:NonNullable<ReturnType<typeof derivedEditorDraft>>)=>Boolean(mounted.current&&derivedRef.current===proof&&
    stateRef.current.outputId===proof.outputId&&stateRef.current.artifactId===proof.artifactId&&stateRef.current.currentVersionId===proof.currentVersionId&&
    creationScopeKey(scope)===proof.scopeKey&&projectId===proof.projectId&&generationRef.current===proof.generation&&
    editorCanonical(stateRef.current.current)===proof.baseFingerprint&&editorCanonical(draftRef.current)===proof.draftFingerprint&&
    editorCanonical(stateRef.current.scriptContext?.scriptRef)===proof.scriptFingerprint&&stateRef.current.scriptContext?.scriptText===proof.scriptText);
  React.useLayoutEffect(()=>{portRef.current={admitCandidate:async(candidate)=>{
   const proof=derivedRef.current;if(!proof||!derivedCurrent(proof)||!await matchesDerivedCandidate(proof,candidate)||await proof.scriptTextDigest!==await editorDigest(proof.scriptText))return null;
   const latest=await client.getGraphicPost({params:{outputId:proof.outputId},query:undefined,body:undefined});
   const exact=await client.getGraphicPostVersion({params:{outputId:proof.outputId,versionId:proof.currentVersionId},query:undefined,body:undefined});
   if(!derivedCurrent(proof)||latest.projectId!==proof.projectId||latest.artifactId!==proof.artifactId||latest.currentVersionId!==proof.currentVersionId||exact.versionId!==proof.currentVersionId||editorCanonical(exact.document)!==proof.baseFingerprint||editorCanonical(latest.current)!==proof.baseFingerprint)return null;
   admittedRef.current={candidate:editorCanonical(candidate),proof};return {isCurrent:()=>derivedCurrent(proof)};
  },readState:()=>({target:targetRef.current,outputId:stateRef.current?.outputId,generation:generationRef.current,dirty:Boolean(stateRef.current&&draftRef.current&&editorCanonical(draftRef.current)!==editorCanonical(stateRef.current.current)),preparation:stateRef.current&&draftRef.current?{scopeKey:creationScopeKey(scope),projectId,outputId:stateRef.current.outputId,owner:"graphic_post",versionId:stateRef.current.currentVersionId,documentFingerprint:editorCanonical(draftRef.current),selection:selectionRef.current}:undefined}),prepareForTurn:async(options)=>{
   if(savePromiseRef.current)await savePromiseRef.current;
   const initial=stateRef.current;if(!initial||!draftRef.current)throw Error("当前稿件尚未准备好。");
   if((graphicSaveIntent.current||sessionStorage.getItem(saveStorageKey)||editorCanonical(draftRef.current)!==editorCanonical(initial.current))&&!(await save()))throw Error("请先确认保存当前修改，原请求已保留。");
   const current=stateRef.current!;const latest=await client.getGraphicPost({params:{outputId:current.outputId},query:undefined,body:undefined});

   if(options?.requireScript&&(latest.scriptContext?.state!=="ready"||!latest.scriptContext.scriptRef||!latest.scriptContext.scriptText.trim()))throw Error("请先在脚本中保存原稿，再重新组织内容。");
   const exact=await client.getGraphicPostVersion({params:{outputId:current.outputId,versionId:latest.currentVersionId},query:undefined,body:undefined});
   if(latest.currentVersionId!==current.currentVersionId||editorCanonical(exact.document)!==editorCanonical(latest.current)||editorCanonical(draftRef.current)!==editorCanonical(exact.document))throw Error("当前作品已改变，请核对保存版本后重试。");
   const target:WorkEditorTarget={schemaVersion:1,projectId,outputId:latest.outputId,owner:"graphic_post",contentType:"image",savedBase:{kind:"artifact",artifactId:latest.artifactId,versionId:latest.currentVersionId},documentDigest:await editorDigest(exact.document),selection:selectionRef.current};targetRef.current=target;return target;
  },previewCandidate:async()=>null,adoptCandidate:async(result:EditorSaveCandidate,requestId:string,isCurrent?:()=>boolean)=>{
   const initial=stateRef.current;if(!initial||initial.outputId!==editorCandidateOutputId(result))throw Error("当前作品已改变。");
   const frozen=editorCanonical(draftRef.current),generation=generationRef.current;
   const saved=await saveWorkEditorCandidate(client,result,requestId);
   if(isCurrent&&!isCurrent())return {status:"saved-not-synced",versionId:saved.receipt.versionId};
   const sync=(editorCanonical(initial.current)===frozen||Boolean(admittedRef.current&&admittedRef.current.candidate===editorCanonical(result)&&derivedCurrent(admittedRef.current.proof)))&&generation===generationRef.current&&editorCanonical(draftRef.current)===frozen&&saved.currentMatches;
   let syncedGeneration:number|undefined;
   if(mounted.current&&stateRef.current?.outputId===initial.outputId){stateRef.current=saved.current;setState(saved.current);if(sync){setDraft(structuredClone(saved.current.current));if(editorCanonical(draftRef.current)===editorCanonical(saved.current.current))syncedGeneration=generationRef.current;if(result.kind!=='work.creation.member'&&result.imageRequest){setDirectorImageRequest(result.imageRequest);setSelectedCardId(result.imageRequest.cardId);setSelectedCardIds([result.imageRequest.cardId]);setMessage("文字已采用。请按编导要求生成所选页图片，预览后再采用；旧图继续保留。");}}else setMessage("已保存，当前稿有新修改，未覆盖输入。");}
   return {status:syncedGeneration!==undefined?"adopted":"saved-not-synced",versionId:saved.receipt.versionId,...(syncedGeneration!==undefined?{syncedGeneration}:{})};
  }};});
  React.useEffect(()=>chat.registerEditor({admitCandidate:c=>portRef.current!.admitCandidate!(c),readState:()=>portRef.current!.readState(),prepareForTurn:options=>portRef.current!.prepareForTurn(options),previewCandidate:c=>portRef.current!.previewCandidate(c),adoptCandidate:(c,id,isCurrent)=>portRef.current!.adoptCandidate(c,id,isCurrent)}),[chat.registerEditor,state.outputId]);
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
  const [reorganizing,setReorganizing]=React.useState(false);
  const reorganizationInFlight=React.useRef(false);
  async function reorganize(){
    if(reorganizationInFlight.current||busy)return;
    reorganizationInFlight.current=true;setReorganizing(true);setError(null);
    try{
      const preparedEditorTurn=await chat.prepareEditorRequest(creationScopeKey(scope));
      if(!preparedEditorTurn)await portRef.current!.prepareForTurn({requireScript:true});
      if(mounted.current)chat.openChat({prefill:reorganizePrompt("rednote"),autoSend:true,preparedEditorTurn});
      else chat.discardPreparedEditorTurn(preparedEditorTurn);
    }catch(reason){if(mounted.current)setError(describeUserError(reason,"重新组织尚未开始，当前稿件已保留。"));}
    finally{reorganizationInFlight.current=false;if(mounted.current)setReorganizing(false);}
  }
  return <main data-page="graphic-post-workbench" data-studio-layout="document" className="mx-auto w-full max-w-[1200px] @container space-y-4 px-5 py-4 text-sm md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4 py-2">
      <div><h1 className="text-lg font-semibold">图文成稿</h1></div>
      <Button className="min-h-11 px-5" disabled={busy||reorganizing||!state.scriptContext?.scriptText.trim()||state.scriptContext.state!=="ready"} onClick={()=>void reorganize()}>{reorganizing?"正在准备…":"重新组织内容"}</Button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{dirty?"已承接脚本，开始对话或导出时保存":"当前成稿已保存"}</span><Link className="underline underline-offset-4" href={`/projects/${projectId}`}>{state.scriptContext?.state==="ready"?"查看脚本原稿":"前往脚本撰写原稿"}</Link></div>
    {error&&<div role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">{error}<Button variant="outline" className="ml-3" disabled={busy} onClick={()=>void save()}>恢复保存并核对</Button></div>}
    {message&&<p role="status" className="text-sm text-success">{message}</p>}
    {state.scriptContext?.message&&<p role="status" className="text-sm text-muted-foreground">{state.scriptContext.message}</p>}
    {startStatus==="unknown"&&<p role="status" className="text-muted-foreground">正在核对原首稿任务，原请求保留。</p>}
    {startResolutionMessage&&<p role="status" className="text-muted-foreground">{startResolutionMessage}</p>}
    <NoteRelayEditor simplified prepareDelivery={save} projectId={projectId} accountId={accountId} outputId={state.outputId} sourceVersionId={state.currentVersionId} platform="rednote" value={draft} disabled={busy} onLayoutChange={layout=>setDraft(current=>({...current,nativeLayout:layout}))}
      extraDelivery={<Button variant="ghost" disabled={busy||exportBusy} onClick={()=>void exportGroup()}>{exportBusy?"导出中…":"导出原图与配文"}</Button>}/>
    <GraphicPostResults resultsOnly key={`${accountId}:${state.outputId}`} accountId={accountId} outputId={state.outputId} targetPlatform={state.targetPlatform} currentVersionId={state.currentVersionId} manualDraftDirty={dirty} prepareGeneration={save} onAdopt={()=>refreshPost()} onResultListResolved={onResultListResolved} scriptDerived imageRequest={directorImageRequest} series={{cards:draft.cardBriefs??[],selectedCardId:activeCardId,selectedCardIds:activeCardIds}}/>
    <LazyDisclosure label="发布与交付">{()=> <PublicationResultActions accountId={accountId} outputId={state.outputId} outputType="image" platform={state.targetPlatform==='xiaohongshu'?'xiaohongshu':null} dirty={dirty}/>}</LazyDisclosure>
    <details id="graphic-history" className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer text-sm font-medium">历史版本</summary><ol className="mt-3 space-y-2 text-sm">{state.versions.map(version=><li key={version.id}><button type="button" onClick={()=>void openVersion(version.id)} className="text-left text-primary hover:underline">v{version.versionNumber} · {version.createdAt.slice(0,16).replace("T"," ")}</button></li>)}</ol></details>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>历史版本预览</DialogTitle></DialogHeader>

    {preview && <><p className="font-medium">{preview.document.title || "未命名"}</p><p className="whitespace-pre-wrap text-sm">{preview.document.body}</p>
          {preview.document.cardBriefs?.map((card,index)=><section key={card.cardId} className="space-y-1 rounded-md border border-border p-3"><h3 className="font-medium">第 {index+1} 页 · {card.title || "未填写标题"}</h3><p className="whitespace-pre-wrap text-sm">{card.body}</p></section>)}<p className="text-xs text-muted-foreground">此版本含 {preview.document.imageUses.length} 张图片、{preview.document.tags.length} 个标签。</p></>}
      </DialogContent>
    </Dialog>
  </main>;
}
