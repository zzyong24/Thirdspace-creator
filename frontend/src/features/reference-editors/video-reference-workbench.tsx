"use client";
import type {VideoLeaveControl,VideoSessionIdentity} from "./project-video-session-registry";
import {creationScopeKey} from "@/lib/creation-workspace-scope";
import {AssetPicker} from "@/components/media/asset-picker";
import {assetChoice} from "@/components/media/asset-picker.types";
import * as React from 'react';
import {productionReferencePlan,type ProductionEditorDocument,type ReferenceEditorMedia,type ReferenceEditorDocument,type ProductionEditorVersion,projectProductionRoughPlan,readProductionNativeScene,sourceNativeTickExact} from '@creatoros/contract';
import {useCreationWorkspace,useCreationScope,type CreationScope} from '@/lib/creation-workspace-scope';
import {useDraftChatRequest,type DraftEditorPort} from '@/features/draft-workbench/draft-chat-request';
import type {WorkEditorTarget,WorkEditorCandidate} from '@creatoros/contract';
import type {NativePreviewSceneRequest,NativePreviewSceneResult} from './native-editor-contract';
import {isNativeContextEvent} from './native-editor-contract';
import {resolveGapAudioBinding,type OriginalAudioRange} from '@/features/production/native-gap-audio-player';
import type {ProductionPauseGap} from '@creatoros/contract';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {NativeEditorSurface,type NativeEditorHandle,type EditorSnapshot,type EditorExport} from './native-editor-surface';
import {uploadEditorMedia,readEditorMedia,downloadEditorExport,type EditorUploadIntent,type EditorUploadStage} from './reference-editor-media';
import {useProductionDelivery} from '@/features/production/use-production-delivery';
import {readVideoDurationViaElement,type WireProduction} from '@/features/production/production-resource-operations';
import {statusStepsTo,type ProductionStatus} from '@/features/production/production-flow';
import {useStageChatDock} from '@/features/draft-workbench/stage-chat-dock';
import {ProductionScriptMarkdownPanel,type ScriptMirrorState} from '@/features/production/production-script-markdown-panel';
import type {ScriptTranscriptToken,ScriptTranscriptLocation} from '@/features/production/production-script-transcript';
import {ProductionTranscriptPanel} from '@/features/production/production-transcript-panel';
import {ProductionRoughCandidatePanel} from '@/features/production/production-rough-candidate-panel';
import {NativeSourcePanel} from './native-source-panel';
import {isKnownNativeConflict,type SavedNativeAction,type NativeRoughScope} from './native-rough-view';
import {useNativeWorkspace} from './use-native-account';
type NativeContext=EditorSnapshot&{contextEpoch?:number;outputId:string;sceneId:string;trackId:string;selectedElements:Array<{trackId:string;elementId:string}>};
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value);}
// SEMANTIC_BOUNDARY_ALLOW: 仅比较完整持久化JSON，忽略OpenCut已明示的项目/场景自动保存updatedAt；未知editable字段不省略。
function nativeContent(plan:ReturnType<typeof productionReferencePlan.parse>){const value=structuredClone(plan),doc=value.referenceEditor.nativeDocument;if(doc.metadata&&typeof doc.metadata==='object'&&!Array.isArray(doc.metadata))delete doc.metadata.updatedAt;if(Array.isArray(doc.scenes))for(const scene of doc.scenes)if(scene&&typeof scene==='object'&&!Array.isArray(scene))delete scene.updatedAt;return value;}
async function digest(value:unknown){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return `sha256:${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;}
const SOURCE='cf5e79e919144200294fb9fed22a222592a0aeea';
type WorkbenchProps={sessionIdentity?:VideoSessionIdentity;scopeOverride?:CreationScope;visible?:boolean;onLeaveControl?:(control:VideoLeaveControl|null)=>void;initial:ProductionEditorDocument;title:string;onOriginal:()=>void;onSaved:(document:ProductionEditorDocument)=>void};
export function VideoReferenceWorkbench(props:WorkbenchProps){
 const currentScope=useNativeWorkspace(),scope=props.scopeOverride??currentScope;
 return <VideoReferenceWorkbenchSession key={`${scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??'missing'}`}:${props.initial.outputId}`} {...props} scope={scope}/>;
}
function VideoReferenceWorkbenchSession({initial,title,onOriginal,onSaved,scope,visible=true,onLeaveControl,sessionIdentity}:WorkbenchProps&{scope:CreationScope}){
 const {groupId,accountId}=scope,workspace=useCreationWorkspace(scope),client=workspace.client;
 const liveScope=useCreationScope();React.useEffect(()=>{if(creationScopeKey(liveScope)===creationScopeKey(scope)&&workspace.signal.aborted)workspace.activate();},[creationScopeKey(liveScope),workspace]);
 const [contextEpoch,setContextEpoch]=React.useState(0),contextEpochRef=React.useRef(0);
 const audioLifetime=React.useRef(new AbortController());
 const audioController=React.useRef<AbortController|null>(null),nativeContextEpoch=React.useRef<number|null>(null);
 function invalidateAudio(){audioLifetime.current.abort();audioLifetime.current=new AbortController();contextEpochRef.current++;audioController.current?.abort();audioController.current=null;setContextEpoch(contextEpochRef.current);}
 const [mountVersion]=React.useState(String(initial.revision));
 const frame=React.useRef<NativeEditorHandle>(null),alive=React.useRef(true),controller=React.useRef(new AbortController());
 const [owner,setOwner]=React.useState(initial),[ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[dirty,setDirty]=React.useState(false),[error,setError]=React.useState<string|null>(null),[notice,setNotice]=React.useState<string|null>(null),[replaceConfirmed,setReplaceConfirmed]=React.useState(false);
 const historyOpener=React.useRef<HTMLButtonElement>(null),historyInFlight=React.useRef(false);
 const [historyLoading,setHistoryLoading]=React.useState(false),[historyError,setHistoryError]=React.useState<string|null>(null);
 const [previewTarget,setPreviewTarget]=React.useState<HTMLElement|null>(null);
 const mountPreview=React.useCallback((mount:HTMLElement)=>{setPreviewTarget(mount);return()=>setPreviewTarget(current=>current===mount?null:current);},[]);
 const [scriptCandidatePending,setScriptCandidatePending]=React.useState(false);
 const scriptMirror=React.useRef<ScriptMirrorState|null>(null),scriptStateChanged=React.useCallback((value:ScriptMirrorState)=>{scriptMirror.current=value;setScriptCandidatePending(Boolean(value.candidate?.apply));},[]);
 const ownerRef=React.useRef(owner);const busyRef=React.useRef(false);const dirtyRef=React.useRef(dirty);React.useLayoutEffect(()=>{ownerRef.current=owner;dirtyRef.current=dirty;},[owner,dirty]);
 const [aiOpen,setAiOpen]=React.useState(false),[aiBusy,setAiBusy]=React.useState(false),[context,setContext]=React.useState<NativeContext|null>(null),[conflict,setConflict]=React.useState(false);
 const native=initial.plan?.editorVersion===3?productionReferencePlan.parse(initial.plan).referenceEditor:null;
 const media=React.useRef<ReferenceEditorMedia[]>(native?.mediaRefs??[]),saveRequest=React.useRef<{digest:string;body:Parameters<typeof client.saveProductionEditor>[0]['body']}|null>(null);
 const nativeImports=React.useRef(0);const [nativeImportCount,setNativeImportCount]=React.useState(0);
 const imports=React.useRef(0),localFiles=React.useRef(new Map<string,File>());
 const exactFiles=React.useRef(new Map<string,File>());
 const exactFileKey=(ref:ReferenceEditorMedia)=>JSON.stringify([ref.mediaId,ref.assetId,ref.assetFileId]);
 const uploadIntents=React.useRef(new Map<File,EditorUploadIntent>());
 const insertIntents=React.useRef(new Map<string,{ref:ReferenceEditorMedia;file?:File;linked?:boolean;requestId:string}>());
 const [importRows,setImportRows]=React.useState<Array<{file:File;intent:EditorUploadIntent;stage:EditorUploadStage;started:number;elapsed:number;error:string|null}>>([]);
 React.useEffect(()=>{if(!importRows.some(row=>row.intent.running))return;const timer=setInterval(()=>setImportRows(rows=>rows.map(row=>row.intent.running?{...row,elapsed:Math.max(0,performance.now()-row.started)}:row)),1000);return()=>clearInterval(timer);},[importRows.some(row=>row.intent.running)]);
 function markDirty(){dirtyRef.current=true;if(alive.current){setDirty(true);setExported(null);}}
 async function importFile(file:File,options?:{signal?:AbortSignal}){
  const operation=workspace.capture();operation.assertCurrent();
  let intent=uploadIntents.current.get(file);if(!intent){intent={mediaId:crypto.randomUUID()};uploadIntents.current.set(file,intent);}
  if(intent.running)throw Error('原上传仍在确认，请等待完成');
  const frozen=intent;localFiles.current.set(frozen.mediaId!,file);imports.current++;markDirty();const started=performance.now();
  const update=(stage:EditorUploadStage,error:string|null=null)=>{if(alive.current)setImportRows(rows=>[...rows.filter(row=>row.file!==file),{file,intent:frozen,stage,started,elapsed:performance.now()-started,error}]);};
  try{
   const ref=await uploadEditorMedia(ownerRef.current.projectId,ownerRef.current.outputId,file,operation,{intent:frozen,signal:options?.signal,onProgress:stage=>update(stage)});
   if(!alive.current)throw Error('已离开当前作品');
   if(!media.current.some(row=>row.mediaId===ref.mediaId))media.current.push(ref);
   localFiles.current.set(ref.mediaId,file);exactFiles.current.set(exactFileKey(ref),file);setMediaForView([...media.current]);markDirty();return {mediaId:ref.mediaId};
  }catch(cause){update(frozen.stage??'creating',cause instanceof Error?cause.message:'导入未完成，原文件已保留');throw cause;}
  finally{imports.current--;markDirty();}
 }
 async function retryImport(file:File){
  if(busyRef.current||busy||aiBusy)return;
  setBusy(true);setError(null);
  try{const ref=await importFile(file,{signal:controller.current.signal});await frame.current!.request('insert-media',{file,mediaId:ref.mediaId},{requestId:`import:${ref.mediaId}`});markDirty();}
  catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'原素材导入尚未完成');}
  finally{if(alive.current)setBusy(false);}
 }
 const missingMedia=React.useRef<Array<Record<string,unknown>>>([]),pendingApply=React.useRef<{requestId:string;payload:Record<string,unknown>;version:ProductionEditorVersion}|null>(null);
 const pendingExport=React.useRef<EditorExport|null>(null);
 const [savePending,setSavePending]=React.useState(false),[applyPending,setApplyPending]=React.useState(false),[exportPending,setExportPending]=React.useState(false),[mediaForView,setMediaForView]=React.useState<ReferenceEditorMedia[]>(native?.mediaRefs??[]);
 function rememberSave(value:typeof saveRequest.current){saveRequest.current=value;if(alive.current)setSavePending(value!==null);}
 function rememberApply(value:typeof pendingApply.current){pendingApply.current=value;if(alive.current)setApplyPending(value!==null);}
 function rememberExport(value:typeof pendingExport.current){pendingExport.current=value;if(alive.current)setExportPending(value!==null);}
 const [exported,setExported]=React.useState<EditorExport|null>(null),[status,setStatus]=React.useState<string|null>(null),[finalVideoAssetId,setFinalVideoAssetId]=React.useState<string|null>(null),[history,setHistory]=React.useState<Array<{revision:number;createdAt:string}>>([]),[historyOpen,setHistoryOpen]=React.useState(false);
 const [assetOptions,setAssetOptions]=React.useState<Array<{id:string;name:string;currentFileId:string|null;assetType:string}>>([]),[selectedAsset,setSelectedAsset]=React.useState('');
 const originalExists=!!owner.plan&&owner.plan.editorVersion!==3;
 React.useEffect(()=>{alive.current=true;const abort=new AbortController();controller.current=abort;return()=>{alive.current=false;abort.abort();audioLifetime.current.abort();audioController.current?.abort();};},[]);
 const ensureOutputId=React.useCallback(async()=>owner.outputId,[owner.outputId]);
 const advanceStatus=React.useCallback(async(target:ProductionStatus)=>{const prod=await client.getOutputProduction({params:{outputId:owner.outputId},query:undefined,body:undefined}) as unknown as WireProduction;let current=prod.status;for(const step of statusStepsTo(current,target)){const row=await client.putOutputProduction({params:{outputId:owner.outputId},query:undefined,body:step==='recording'?{status:step,productionMode:'studio'}:{status:step}}) as unknown as WireProduction;current=row.status;}if(alive.current)setStatus(current);return prod.id;},[owner.outputId]);
 const canvas=(exported?.document.settings as {canvasSize?:{width:number;height:number}}|undefined)?.canvasSize;
 const renderDimensions=canvas&&Number.isInteger(canvas.width)&&canvas.width>0&&Number.isInteger(canvas.height)&&canvas.height>0?canvas:undefined;
 const delivery=useProductionDelivery({renderDimensions,projectId:owner.projectId,outputId:owner.outputId,status,finalVideoAssetId,renderOrientation:'landscape',readVideoDuration:readVideoDurationViaElement,ensureOutputId,advanceStatus,setFinalVideoAssetId});
 React.useEffect(()=>{let cancelled=false;void client.getOutput({params:{outputId:owner.outputId},query:undefined,body:undefined}).then(output=>{if(!cancelled)setFinalVideoAssetId(output.primaryAssetId??null);}).catch(()=>{});return()=>{cancelled=true;};},[owner.outputId]);
 function acceptOwner(next:ProductionEditorDocument){invalidateAudio();ownerRef.current=next;setOwner(next);onSaved(next);}
 async function load(next=ownerRef.current){nativeContextEpoch.current=null;invalidateAudio();setBusy(true);setError(null);try{
  const document=next.plan?.editorVersion===3?productionReferencePlan.parse(next.plan).referenceEditor:null;
  const metadata=(document?.nativeDocument.mediaMetadata??[]) as Array<Record<string,unknown>>;
  media.current=document?.mediaRefs??[];
  // SEMANTIC_BOUNDARY_ALLOW: 下载原asset bytes后还原原File描述符mtime，不把重新下载时间当作用户编辑。
  const rows=await Promise.allSettled(media.current.map(async ref=>{const descriptor=metadata.find(row=>row.mediaId===ref.mediaId);let file=exactFiles.current.get(exactFileKey(ref))??await readEditorMedia(ref,controller.current.signal,workspace.capture());if(typeof descriptor?.lastModified==='number'&&Number.isSafeInteger(descriptor.lastModified)&&file.lastModified!==descriptor.lastModified)file=new File([file],file.name,{type:file.type,lastModified:descriptor.lastModified});exactFiles.current.set(exactFileKey(ref),file);return {...descriptor,mediaId:ref.mediaId,assetId:ref.assetId,assetFileId:ref.assetFileId,file};}));
  const files=rows.flatMap(row=>row.status==='fulfilled'?[row.value]:[]);missingMedia.current=rows.flatMap((row,index)=>row.status==='rejected'?[metadata.find(m=>m.mediaId===media.current[index].mediaId)??{mediaId:media.current[index].mediaId}]:[]);
  if(!alive.current)return;await frame.current!.request('load',{document:document?.nativeDocument??null,title,outputId:next.outputId,media:files});
  if(alive.current){setMediaForView([...media.current]);setReady(true);if(next.plan?.editorVersion===3&&productionReferencePlan.parse(next.plan).nativeSources?.length)void frame.current?.request('open-addon',{panel:'transcript'}).catch(cause=>setError(cause.message));setDirty(false);dirtyRef.current=false;if(missingMedia.current.length)setNotice(`${missingMedia.current.length} 个素材暂未读到，其余素材可继续编辑；原片引用和时间轴已保留。`);}
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'工程读取失败，原稿已保留');}finally{if(alive.current)setBusy(false);}}
 function planFor(result:EditorSnapshot){const current=ownerRef.current.plan?.editorVersion===3?productionReferencePlan.parse(ownerRef.current.plan):null;const metadata=[...(result.mediaMetadata??[])];for(const row of missingMedia.current)if(!metadata.some(m=>m.mediaId===row.mediaId))metadata.push(row);
  const doc:ReferenceEditorDocument={editor:'opencut-classic',revision:SOURCE,nativeDocument:JSON.parse(JSON.stringify({...result.document,mediaMetadata:metadata})),mediaRefs:media.current.filter(ref=>metadata.some(item=>item.mediaId===ref.mediaId))};
  return productionReferencePlan.parse({editorVersion:3,referenceEditor:doc,...(current?.revision!==undefined?{revision:current.revision}:{}),...(current?.nativeSources!==undefined?{nativeSources:current.nativeSources}:{}),...(current?.sourceTranscripts!==undefined?{sourceTranscripts:current.sourceTranscripts}:{})});
 }
 async function save(frozen?:EditorSnapshot):Promise<ProductionEditorDocument|null>{
  if(!ready||busyRef.current)return null;busyRef.current=true;setBusy(true);setError(null);
  try{const current=ownerRef.current;if(!saveRequest.current){const snapshot=frozen??await frame.current!.request<EditorSnapshot>('snapshot');if(!alive.current)return null;const plan=planFor(snapshot);rememberSave({digest:canonical(plan),body:{plan,expectedRevision:current.revision,requestId:crypto.randomUUID(),source:'manual',...(current.plan&&current.plan.editorVersion!==3?{replaceEditor:true}:{})}});}
   const request=saveRequest.current!;const saved=await client.saveProductionEditor({params:{outputId:current.outputId},query:undefined,body:request.body});
   if(!alive.current)return null;const next={...current,revision:saved.revision,productionId:saved.productionId,state:'editable' as const,plan:saved.plan,unsupportedFields:[]};acceptOwner(next);rememberSave(null);
   let changed=true;try{const live=planFor(await frame.current!.request<EditorSnapshot>('snapshot'));changed=imports.current>0||nativeImports.current>0||canonical(nativeContent(live))!==canonical(nativeContent(productionReferencePlan.parse(saved.plan)));}catch{/* 回执已确认；当前稿无法核对时继续提示未保存，不重发已成功保存。 */}
   if(!alive.current)return null;setDirty(changed);dirtyRef.current=changed;setConflict(false);setNotice(changed?'冻结剪辑稿已保存，之后完成的修改仍在时间轴，请继续保存。':'剪辑工程已保存，刷新后可继续编辑。');return next;
  }catch(e){if(alive.current){if(isKnownNativeConflict(e)){rememberSave(null);setConflict(true);}setError(e instanceof Error?e.message:'保存尚未确认，当前时间轴保留，请重试同一请求');}throw e;}finally{busyRef.current=false;if(alive.current)setBusy(false);}
 }
 async function prepareDocument(){if(ownerRef.current.plan&&ownerRef.current.plan.editorVersion!==3&&!replaceConfirmed)throw Error('请先确认保存这份新剪辑稿，原方案会保留在历史版本。');if(pendingApply.current)throw Error('原剪辑回执尚未确认，请先恢复原采纳或备份本地稿后读取当前版本。');const snapshot=await frame.current!.request<NativeContext>('context');if(!alive.current||snapshot.outputId!==ownerRef.current.outputId)throw Error('当前作品已改变。');const plan=planFor(snapshot),current=ownerRef.current;const stored=current.plan?.editorVersion===3?productionReferencePlan.parse(current.plan):null;
  // SEMANTIC_BOUNDARY_ALLOW: 只比较持久化 JSON，任何时间轴修改都先保存；不做内容判断。
  if(dirtyRef.current||!stored||canonical(nativeContent(plan))!==canonical(nativeContent(stored))||saveRequest.current){const saved=await save(snapshot);if(!saved)throw Error('工程尚未保存，请稍后恢复原保存请求。');return saved;}return current;
 }
 async function refreshContext(){
  const operation=workspace.capture(),outputId=ownerRef.current.outputId,projectId=ownerRef.current.projectId;
  const check=()=>{operation.assertCurrent();if(!alive.current||ownerRef.current.outputId!==outputId||ownerRef.current.projectId!==projectId)throw Error('当前作品已改变，请重新读取选区。');};
  const signal=AbortSignal.any([controller.current.signal,operation.signal]);setError(null);
  try{
   check();
   // 仅明确打开/刷新AI选区时暂停原预览；暂停推进native实际epoch，原声确认随真实事件清除。
   await frame.current!.request<NativeContext>('context',{pausePlayback:true},{signal});check();
   // 保存可能继续改变稿件或native epoch；最终context才作为下一次逐gap请求的实际身份。
   await prepareDocument();check();
   const value=await frame.current!.request<NativeContext>('context',undefined,{signal});check();
   if(value.outputId!==outputId||!Number.isSafeInteger(value.contextEpoch))throw Error('原生选区身份尚未确认，请重新读取。');
   nativeContextEpoch.current=value.contextEpoch!;setContext(value);setAiOpen(true);
  }catch(e){try{check();}catch{return;}setError(e instanceof Error?e.message:'选区未读到，当前稿保留。');}
 }
 async function acceptVersion(version:ProductionEditorVersion,action?:SavedNativeAction){const restoringReceipt=!!pendingApply.current;const current=ownerRef.current;if(version.productionId!==current.productionId)throw Error('采纳回执不属于当前作品。');const nextPlan=productionReferencePlan.parse(version.plan);const local=await frame.current!.request<NativeContext>('context');if(!alive.current)return;
  const afterScenes=(nextPlan.referenceEditor.nativeDocument.scenes??[]) as Array<{id:string;tracks:unknown}>;
  const base=action?await client.getProductionEditorVersion({params:{outputId:current.outputId,revision:action.expectedRevision},query:undefined,body:undefined}):null;if(!alive.current)return;
  const beforePlan=base?.plan??current.plan;const beforeScenes=beforePlan?.editorVersion===3?(productionReferencePlan.parse(beforePlan).referenceEditor.nativeDocument.scenes??[]) as Array<{id:string;tracks:unknown}>:[];
  const changed=afterScenes.filter(after=>{const before=beforeScenes.find(s=>s.id===after.id);return before&&canonical(before.tracks)!==canonical(after.tracks);});
  if(changed.length>1)throw Error('原采纳回执改变了多个场景，请备份本地稿后核对当前版本。');
  if(changed.length){const after=changed[0],before=beforeScenes.find(s=>s.id===after.id)!;const liveScene=((local.document.scenes??[]) as Array<{id:string;tracks:unknown}>).find(s=>s.id===after.id);
   if(pendingApply.current||canonical(liveScene?.tracks)!==canonical(after.tracks)){
    if(!pendingApply.current)rememberApply({requestId:`native-adopt:${action?.requestId??version.requestId??crypto.randomUUID()}`,payload:{outputId:current.outputId,sceneId:after.id,beforeTracks:before.tracks,afterTracks:after.tracks,expectedBeforeDigest:await digest(before.tracks),...((action as SavedNativeAction&{candidateDigest?:string})?.candidateDigest?{candidateDigest:(action as SavedNativeAction&{candidateDigest?:string}).candidateDigest}:{})},version});
    const pending=pendingApply.current!;if(pending.version.revision!==version.revision)throw Error('还有原剪辑回执等待确认，请先恢复。');
    try{await frame.current!.request('apply-tracks',pending.payload,{requestId:pending.requestId});}catch(e){if(isKnownNativeConflict(e)){setConflict(true);throw Object.assign(Error(e instanceof Error?e.message:'本地时间轴已有修改，未覆盖。'),{code:'NativeApplyConflictError',status:409});}throw e;}
    rememberApply(null);
   }
  }
  if(!alive.current)return;const next={...current,revision:version.revision,productionId:version.productionId,state:'editable' as const,plan:version.plan,unsupportedFields:[]};if(version.revision>=ownerRef.current.revision)acceptOwner(next);
  const now=await frame.current!.request<NativeContext>('context');if(!alive.current)return;setContext(now);const saved=productionReferencePlan.parse(ownerRef.current.plan);const stillChanged=canonical(nativeContent(planFor(now)))!==canonical(nativeContent(saved));setDirty(stillChanged);dirtyRef.current=stillChanged;setExported(null);setNotice(stillChanged?(restoringReceipt?'原采纳回执已确认，本地后续修改和撤销继续保留。':'已采用到当前时间轴，本地后续修改已保留，请继续核对并保存。'):'已采用到当前时间轴，可继续编辑或撤销。');
 }
 const chatDock=useStageChatDock();
 const mountDirector=React.useCallback((mount:HTMLElement)=>chatDock?.dock(mount,()=>{void frame.current?.request('open-addon',{panel:'director'}).catch(cause=>setError(cause.message));}),[chatDock?.dock]);
 const chat=useDraftChatRequest(),directorPort=React.useRef<DraftEditorPort|null>(null),directorTarget=React.useRef<WorkEditorTarget|null>(null),directorGeneration=React.useRef(0),directorSelection=React.useRef<string|null>(null),directorSaved=React.useRef(new Map<string,ProductionEditorVersion>()),directorApplied=React.useRef(new Set<string>());
 const scriptSelection=React.useRef<{sceneId:string;trackId:string;elementId:string;transcript?:{sourceId:string;transcriptId:string;tokenIds:string[]}}|null>(null);
 const scriptDraftPending=React.useRef<{requestId:string;payload:Record<string,unknown>}|null>(null);
 const [localSessionId]=React.useState(()=>crypto.randomUUID());
 const directorMountIdentity=`${sessionIdentity?String(sessionIdentity.generation)+':':''}${localSessionId}`;
 async function validateDirectorCandidate(result:WorkEditorCandidate){
  if(result.candidate?.kind!=='native_scene'||result.target.selection.kind!=='native_scene'||!result.candidateDigest)throw Error('当前候选不是可预览的视频场景。');
  if(!visible||!ready||imports.current||nativeImports.current||busyRef.current||busy||aiBusy||pendingApply.current||saveRequest.current)throw Error('请先完成或恢复当前素材与剪辑操作，再预览候选。');
  const operation=workspace.capture(),owner=ownerRef.current,handle=frame.current;
  const check=()=>{operation.assertCurrent();if(!alive.current||frame.current!==handle||ownerRef.current.outputId!==owner.outputId||ownerRef.current.revision!==owner.revision)throw Error('当前作品已改变，请重新预览。');};
  if(result.target.selection.transcript&&canonical(result.target.selection.transcript)!==canonical(scriptSelection.current?.transcript))throw Error('当前转写选区已改变，请重新生成候选。');
  if(result.target.outputId!==owner.outputId||result.target.projectId!==owner.projectId||result.target.savedBase.kind!=='production'||result.target.savedBase.productionId!==owner.productionId||result.target.savedBase.revision!==owner.revision)throw Error('候选基准工程已改变，请重新审阅。');
  const actual=await client.getProductionEditor({params:{outputId:owner.outputId},query:undefined,body:undefined});check();
  if(actual.productionId!==owner.productionId||actual.revision!==owner.revision||actual.plan?.editorVersion!==3||canonical(actual.plan)!==canonical(owner.plan)||await digest(actual.plan)!==result.target.documentDigest)throw Error('候选基准工程已改变，请重新审阅。');check();
  const current=await handle!.request<NativeContext>('context');check();
  // SEMANTIC_BOUNDARY_ALLOW: 刷新恢复只核真实旧base与完整前值；新mount不复用旧epoch，不改变候选或CAS基准。
  if(current.outputId!==owner.outputId||!Number.isSafeInteger(current.contextEpoch)||dirtyRef.current||canonical(nativeContent(planFor(current)))!==canonical(nativeContent(productionReferencePlan.parse(actual.plan)))||(result.target.selection.editorGeneration===directorMountIdentity&&current.contextEpoch!==result.target.selection.contextEpoch))throw Error('当前时间轴或选区已改变，请重新生成候选。');
  const sceneId=result.target.selection.sceneId;const scene=((current.document.scenes??[]) as Array<{id:string;tracks:Record<string,unknown>}>).find(scene=>scene.id===sceneId);if(!scene)throw Error('候选原场景已不可读取。');
  const edit=result.apply?.operation==='applyProductionEditor'?result.apply.body.edits.find(edit=>edit.sceneId===sceneId):null;
  if(!edit||result.candidate.document.id!==sceneId||await digest(scene.tracks)!==edit.expectedBeforeDigest)throw Error('当前时间轴前值已改变，请重新审阅候选。');check();
  return {scene,current,handle,check,candidate:result.candidate,candidateDigest:result.candidateDigest};
 }
 async function applyScriptDraft(result:WorkEditorCandidate,requestId:string){
  if(result.candidate?.kind!=='native_scene'||!result.apply||result.apply.operation!=='applyProductionEditor')throw Error('当前文字候选不可应用');
  if(!scriptDraftPending.current){
   let checked;try{checked=await validateDirectorCandidate(result);}catch(cause){throw Object.assign(cause instanceof Error?cause:Error('当前工程已改变'),{notSent:true});}
   scriptDraftPending.current={requestId:`script-draft:${requestId}`,payload:{outputId:ownerRef.current.outputId,sceneId:checked.scene.id,beforeTracks:checked.scene.tracks,afterTracks:result.candidate.document.tracks,expectedBeforeDigest:await digest(checked.scene.tracks),candidateDigest:result.candidateDigest}};
  }
  const pending=scriptDraftPending.current;if(pending.requestId!==`script-draft:${requestId}`)throw Error('还有原文字草稿操作待恢复');
  setAiBusy(true);try{try{await frame.current!.request('apply-tracks',pending.payload,{requestId:pending.requestId});}catch(cause){if(isKnownNativeConflict(cause)){scriptDraftPending.current=null;throw Object.assign(cause instanceof Error?cause:Error('当前草稿前值已改变'),{notSent:true,originalSettled:true});}throw cause;}scriptDraftPending.current=null;markDirty();scriptSelection.current=null;directorGeneration.current++;chat.notifyEditorChanged();}finally{if(alive.current)setAiBusy(false);}
 }
 // SEMANTIC_BOUNDARY_ALLOW: sN仅按源库顺序找到真实token，原source timebase精确换算；不按字数估计时间或选择词句。
 function resolveScriptToken(token:ScriptTranscriptToken){
  if(ownerRef.current.plan?.editorVersion!==3)return null;
  const plan=productionReferencePlan.parse(ownerRef.current.plan),binding=plan.nativeSources?.find(item=>item.mediaId===token.mediaId&&item.source.assetId===token.assetId);
  if(!binding)return null;let index=0;
  for(const transcript of plan.sourceTranscripts??[]){if(transcript.sourceId!==binding.source.sourceId||transcript.assetFileId!==binding.source.assetFileId||transcript.granularity==='text')continue;
   for(const item of transcript.tokens){index++;if(index!==token.segmentId)continue;const sourceTick=sourceNativeTickExact(item.startTicks,binding.source),end=sourceNativeTickExact(item.endTicks,binding.source);if(sourceTick===null||end===null||end<=sourceTick||sourceTick<token.sourceStart||end>token.sourceEnd)return null;const nativeTick=token.nativeStart+(sourceTick-token.sourceStart)/token.rate;if(!Number.isSafeInteger(nativeTick)||nativeTick<0)return null;return {sourceTick,nativeTick,tokenId:item.tokenId};}
  }return null;
 }
 function locateScriptToken(target:WorkEditorTarget,location:ScriptTranscriptLocation){
  if(target.owner!=='production'||target.selection.kind!=='native_scene'||ownerRef.current.plan?.editorVersion!==3||target.savedBase.revision!==ownerRef.current.revision){setError('原文字稿基准已变化，请保留文字并重新核对');return;}
  const plan=productionReferencePlan.parse(ownerRef.current.plan),scene=readProductionNativeScene(plan,target.selection.sceneId),track=scene&&[scene.tracks.main,...scene.tracks.overlay,...scene.tracks.audio].find(track=>track.elements.some(item=>item.id===location.elementId));if(!track)return;
  const element=track.elements.find(item=>item.id===location.elementId)!,binding=plan.nativeSources?.find(item=>item.mediaId===element.mediaId);
  const matches=location.tokenId&&binding?(plan.sourceTranscripts??[]).filter(transcript=>transcript.granularity!=='text'&&transcript.sourceId===binding.source.sourceId&&transcript.assetFileId===binding.source.assetFileId&&transcript.tokens.some(item=>item.tokenId===location.tokenId&&sourceNativeTickExact(item.startTicks,binding.source)===location.sourceTick)):[];
  scriptSelection.current={sceneId:scene!.id,trackId:track.id,elementId:element.id,...(matches.length===1?{transcript:{sourceId:matches[0].sourceId,transcriptId:matches[0].transcriptId,tokenIds:[location.tokenId!]}}:{})};directorGeneration.current++;chat.notifyEditorChanged();
  void frame.current?.request('seek',{outputId:ownerRef.current.outputId,sceneId:scene!.id,tick:location.nativeTick}).catch(cause=>setError(cause.message));
 }
 React.useLayoutEffect(()=>{directorPort.current={readState:()=>({target:directorTarget.current,outputId:ready&&visible?ownerRef.current.outputId:undefined,generation:directorGeneration.current,dirty:dirtyRef.current}),prepareForTurn:async()=>{
  if(!visible||!ready||imports.current||nativeImports.current||busyRef.current||busy||aiBusy)throw Error('请等待当前素材或剪辑操作完成。');
  if(pendingApply.current)await resumeNativeReceipt();if(pendingApply.current)throw Error('原时间轴回执尚未确认，请先恢复。');
  await frame.current!.request<NativeContext>('context',{pausePlayback:true});
  await prepareDocument();
  const current=ownerRef.current,actual=await client.getProductionEditor({params:{outputId:current.outputId},query:undefined,body:undefined});
  if(actual.revision!==current.revision||canonical(actual.plan)!==canonical(current.plan)||actual.plan?.editorVersion!==3||!actual.productionId)throw Error('已保存工程已改变，请重新读取后发送。');
  const native=await frame.current!.request<NativeContext&{playheadTick:number;ticksPerSecond:number}>('context');
  if(native.outputId!==current.outputId||native.ticksPerSecond!==120000||!Number.isSafeInteger(native.contextEpoch)||dirtyRef.current)throw Error('当前原生选区尚未确认，请重试。');
  const plan=planFor(native);if(canonical(nativeContent(plan))!==canonical(nativeContent(productionReferencePlan.parse(actual.plan))))throw Error('时间轴还有新修改，本次未发送。');
  nativeContextEpoch.current=native.contextEpoch!;directorSelection.current=canonical([native.sceneId,native.selectedElements]);setContext(native);
  const target:WorkEditorTarget={schemaVersion:1,projectId:actual.projectId,outputId:actual.outputId,owner:'production',contentType:'video',savedBase:{kind:'production',productionId:actual.productionId,revision:actual.revision},documentDigest:await digest(actual.plan),selection:{kind:'native_scene',sceneId:native.sceneId,elementRefs:scriptSelection.current?.sceneId===native.sceneId?[{trackId:scriptSelection.current.trackId,elementId:scriptSelection.current.elementId}]:native.selectedElements,...(scriptSelection.current?.transcript?{transcript:scriptSelection.current.transcript}:{}),playheadTick:native.playheadTick,contextEpoch:native.contextEpoch!,editorGeneration:directorMountIdentity}};
  directorTarget.current=target;return target;
 },previewCandidate:async(result:WorkEditorCandidate)=>{
  const {scene,current,handle,check,candidate,candidateDigest}=await validateDirectorCandidate(result);
  // SEMANTIC_BOUNDARY_ALLOW: 仅按候选场景真实mediaId读取文件，不让其它场景/未使用素材阻断当前预览。
  const tracks=candidate.document.tracks,usedMedia=new Set([tracks.main,...tracks.overlay,...tracks.audio].flatMap(track=>track.elements.flatMap(element=>typeof element.mediaId==='string'?[element.mediaId]:[])));
  const refs=media.current.filter(ref=>usedMedia.has(ref.mediaId));const descriptors=(current.mediaMetadata??[]);
  // 缺失文件不伪造为有效媒体。原生端按同轨/同ID/完整元素相等检查能否沿原渲染安全跳过；新增或修改引用仍拒绝。
  const reads=await Promise.all(refs.map(async ref=>{const metadata=descriptors.find(row=>row.mediaId===ref.mediaId)??missingMedia.current.find(row=>row.mediaId===ref.mediaId);const cached=exactFiles.current.get(exactFileKey(ref));let fresh:File;try{fresh=cached??await readEditorMedia(ref,controller.current.signal,workspace.capture());}catch(cause){check();controller.current.signal.throwIfAborted();if([404,410].includes((cause as {status?:number})?.status??0))return null;throw cause;}if(!metadata)throw Error('实际媒体信息尚未读到。');const file=cached??new File([fresh],String(metadata.name),{type:fresh.type,lastModified:Number(metadata.lastModified)});return {...metadata,mediaId:ref.mediaId,assetId:ref.assetId,assetFileId:ref.assetFileId,file};}));
  const files=reads.filter(row=>row!==null);
  const payload:NativePreviewSceneRequest={owner:{groupId,accountId,projectId:ownerRef.current.projectId,outputId:ownerRef.current.outputId,sourceVersionId:mountVersion},targetSceneId:scene.id,baseContextEpoch:current.contextEpoch!,beforeDigest:await digest(scene.tracks),candidateDigest,tracks:candidate.document.tracks,media:files as NativePreviewSceneRequest['media']};
  check();const output=await handle!.request<NativePreviewSceneResult>('preview-scene',payload);check();if(output.candidateDigest!==result.candidateDigest||output.sceneId!==scene.id||output.contextEpoch!==current.contextEpoch||!(output.blob instanceof Blob)||!output.blob.size)throw Error('预览回执与候选不一致。');if(output.warnings?.length)setNotice(output.warnings.map(warning=>warning.message).join('\n'));return {blob:output.blob,fileName:output.fileName,warnings:output.warnings?.map(warning=>warning.message)};
 },adoptCandidate:async(result,requestId:string)=>{
  if(result.kind==='work.creation.member')throw Error('文章或图文候选不能写入视频。');
  if(result.apply?.operation!=='applyProductionEditor'||result.candidate?.kind!=='native_scene')throw Error('当前候选不可用于视频采纳。');
  let prior=directorSaved.current.get(requestId)??await client.getProductionEditorReceipt({params:{outputId:result.target.outputId,requestId},query:undefined,body:undefined});
  if(!prior){const actual=await client.getProductionEditor({params:{outputId:result.target.outputId},query:undefined,body:undefined});if(actual.revision>result.apply.body.expectedRevision){prior=await client.getProductionEditorReceipt({params:{outputId:result.target.outputId,requestId},query:undefined,body:undefined});if(!prior){setConflict(true);throw Object.assign(Error('原请求基准已更新且无保存回执，不能再次写入；文字稿保留，请重新核对当前版本。'),{notSent:true,originalSettled:true});}}}
  if(!prior)try{await validateDirectorCandidate(result);}catch(cause){throw Object.assign(cause instanceof Error?cause:Error('当前选区已改变'),{notSent:true});}
  const saved=prior??await client.applyProductionEditor({params:{outputId:result.target.outputId},query:undefined,body:{...result.apply.body,requestId}});directorSaved.current.set(requestId,saved);
  const exact=await client.getProductionEditorVersion({params:{outputId:result.target.outputId,revision:saved.revision},query:undefined,body:undefined});if(canonical(exact.plan)!==canonical(saved.plan))throw Error('工程保存版本读回不符，原请求保留。');
  const latest=await client.getProductionEditor({params:{outputId:result.target.outputId},query:undefined,body:undefined});if(latest.revision!==saved.revision)return {status:'saved-not-synced',revision:saved.revision,message:'已保存，但当前工程有更新，未覆盖本地时间轴。'};
  try{if(!directorApplied.current.has(requestId))await acceptVersion(saved,{expectedRevision:result.apply.body.expectedRevision,requestId,candidateDigest:result.candidateDigest} as SavedNativeAction);const syncedGeneration=directorGeneration.current;const actual=await frame.current!.request<NativeContext>('context');const candidateSceneId=result.candidate.document.id;const scene=((actual.document.scenes??[]) as Array<{id:string;tracks:unknown}>).find(scene=>scene.id===candidateSceneId);if(!alive.current||directorGeneration.current!==syncedGeneration||dirtyRef.current||actual.sceneId!==candidateSceneId||canonical(scene?.tracks)!==canonical(result.candidate.document.tracks))return {status:'saved-not-synced',revision:saved.revision,message:'已保存，当前时间轴有新修改或撤销，未再次应用候选。'};directorApplied.current.add(requestId);return {status:'adopted',revision:saved.revision,syncedGeneration};}
  catch(cause){return {status:(cause as {status?:number})?.status===409?'saved-not-synced':'saved-native-unknown',revision:saved.revision,message:pendingApply.current?'已保存，时间轴响应尚未确认，请恢复原回执。':cause instanceof Error?cause.message:'已保存，当前时间轴有修改，请保留本地稿并核对。'};}
 }};});
 React.useEffect(()=>{if(!visible)return;return chat.registerEditor({readState:()=>directorPort.current!.readState(),prepareForTurn:()=>directorPort.current!.prepareForTurn(),previewCandidate:c=>directorPort.current!.previewCandidate(c),adoptCandidate:(c,id)=>directorPort.current!.adoptCandidate(c,id)});},[chat.registerEditor,visible,owner.outputId]);
 async function resumeNativeReceipt(){const pending=pendingApply.current;if(!pending||busyRef.current)return;setAiBusy(true);setError(null);try{await frame.current!.request('apply-tracks',pending.payload,{requestId:pending.requestId});if(!alive.current)return;rememberApply(null);const current=ownerRef.current,version=pending.version;if(version.revision>=current.revision)acceptOwner({...current,revision:version.revision,productionId:version.productionId,plan:version.plan,state:'editable',unsupportedFields:[]});const now=await frame.current!.request<NativeContext>('context');if(!alive.current)return;setContext(now);const saved=productionReferencePlan.parse(ownerRef.current.plan);const changed=canonical(nativeContent(planFor(now)))!==canonical(nativeContent(saved));setDirty(changed);dirtyRef.current=changed;setNotice(changed?'原剪辑回执已确认，本地后续修改或撤销已保留。':'已采用到当前时间轴，可继续编辑或撤销。');}catch(e){if(alive.current){if(isKnownNativeConflict(e))setConflict(true);setError(e instanceof Error?e.message:'原剪辑回执仍未确认，当前输入保留。');}}finally{if(alive.current)setAiBusy(false);}}
 async function recoverConflict(){const value=await client.getProductionEditor({params:{outputId:ownerRef.current.outputId},query:undefined,body:undefined});if(!alive.current)return;acceptOwner(value);rememberSave(null);setConflict(false);setDirty(true);dirtyRef.current=true;setNotice('当前已保存版本已重新核对，本地时间轴保留；请核对后保存或重新生成建议。');}
 async function reloadWithBackup(){const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');const backup={kind:'creatoros.native-edit-backup',outputId:ownerRef.current.outputId,projectId:ownerRef.current.projectId,baseRevision:ownerRef.current.revision,scriptDraftPending:scriptDraftPending.current,scriptMirror:scriptMirror.current,plan:planFor(snapshot)};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});downloadEditorExport(blob,'剪辑稿本地备份.json');const value=await client.getProductionEditor({params:{outputId:ownerRef.current.outputId},query:undefined,body:undefined});if(!alive.current)return;acceptOwner(value);rememberApply(null);rememberSave(null);rememberExport(null);setContext(null);setConflict(false);await load(value);setNotice('本地稿已下载备份，当前已保存版本已读回。');}
 React.useLayoutEffect(()=>{
  const handle:VideoLeaveControl={readState:()=>({dirty:dirtyRef.current||!!scriptMirror.current?.dirty,busy:busyRef.current||busy||aiBusy,pending:Boolean(scriptDraftPending.current||scriptMirror.current?.pending||saveRequest.current||pendingApply.current||pendingExport.current||insertIntents.current.size||[...uploadIntents.current.values()].some(intent=>intent.stage!=="ready")),imports:imports.current+nativeImports.current,ready}),saveForLeave:async()=>{if(scriptMirror.current?.dirty||scriptMirror.current?.pending)throw Error('文字稿仍有未采纳修改或原采纳待核对，请先处理或备份文字稿。');if(imports.current||nativeImports.current||busyRef.current||busy||aiBusy||!ready)return false;await save();return !dirtyRef.current&&!saveRequest.current&&!pendingApply.current&&!pendingExport.current&&!imports.current&&!nativeImports.current&&!insertIntents.current.size&&![...uploadIntents.current.values()].some(intent=>intent.stage!=="ready");},recoverOriginalReceipt:async()=>{if(pendingApply.current)await resumeNativeReceipt();if(saveRequest.current)await save();if(pendingExport.current)await exportVideo();},exportLocalBackup:async()=>{const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');downloadEditorExport(new Blob([JSON.stringify({kind:'creatoros.native-edit-backup',scope,projectId:ownerRef.current.projectId,outputId:ownerRef.current.outputId,baseRevision:ownerRef.current.revision,scriptDraftPending:scriptDraftPending.current,scriptMirror:scriptMirror.current,plan:planFor(snapshot),mediaRefs:media.current,pendingSave:saveRequest.current?.body??null,pendingApply:pendingApply.current,pendingImports:imports.current,nativePendingImports:nativeImports.current,pendingInserts:[...insertIntents.current.values()].map(intent=>({ref:intent.ref,requestId:intent.requestId,linked:intent.linked??false})),uploadIntents:[...uploadIntents.current.values()].map(intent=>({mediaId:intent.mediaId,uploadId:intent.upload?.uploadId??null,stage:intent.stage,createUnknown:intent.createUnknown??false,putConfirmed:intent.putConfirmed??false,ref:intent.ref??null,linked:intent.linked??false}))},null,2)],{type:'application/json'}),'剪辑稿本地备份.json');for(const [key,file] of localFiles.current)if(!(snapshot.mediaMetadata??[]).some(row=>row.mediaId===key))downloadEditorExport(file,file.name);},dispose:async()=>{await frame.current?.dispose();}};
  onLeaveControl?.(handle);return()=>onLeaveControl?.(null);
 },[onLeaveControl,ready,busy,aiBusy,dirty,savePending,applyPending,exportPending,nativeImportCount]);
 const view=owner.plan?.editorVersion===3?projectProductionRoughPlan(owner.plan,{sceneId:context?.sceneId}):null;const selectedScene=owner.plan?.editorVersion===3?readProductionNativeScene(owner.plan,context?.sceneId):null;const nativeScope:NativeRoughScope|undefined=selectedScene?{sceneId:selectedScene.id,trackId:selectedScene.tracks.main.id,scene:selectedScene,selectedClipIds:context?.selectedElements.filter(e=>e.trackId===selectedScene.tracks.main.id).map(e=>e.elementId)}:undefined;
 const metadata=(owner.plan?.editorVersion===3?productionReferencePlan.parse(owner.plan).referenceEditor.nativeDocument.mediaMetadata??[]:[]) as Array<Record<string,unknown>>;
 async function decodeGap(gap:ProductionPauseGap,signal:AbortSignal):Promise<OriginalAudioRange>{
  const operation=workspace.capture(),epoch=contextEpochRef.current,current=ownerRef.current;
  const bridgeEpoch=nativeContextEpoch.current;if(bridgeEpoch===null)return {status:"manual_review",reason:"此项尚未读取原生场景身份，请重新读取选区后核对原片。",chunks:[]};
  const sceneId=context?.sceneId;if(!sceneId)throw Error('请先读取当前场景选区。');
  const binding=resolveGapAudioBinding(current,gap,sceneId),nonce=crypto.randomUUID();
  audioController.current?.abort();const abort=new AbortController();audioController.current=abort;
  const combined=AbortSignal.any([signal,abort.signal,operation.signal,controller.current.signal]);
  const check=()=>{combined.throwIfAborted();operation.assertCurrent();if(epoch!==contextEpochRef.current||ownerRef.current.outputId!==current.outputId||ownerRef.current.revision!==current.revision)throw Error('场景或稿件已改变，请重新试听此项。');};
  try{check();const file=await readEditorMedia(binding.ref,combined,operation);check();
   const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());check();
   if(Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')!==binding.fileDigest)throw Error('此项原片文件与冻结来源不匹配，请手工核对。');
   const owner={groupId,accountId,projectId:current.projectId,outputId:current.outputId,sourceVersionId:mountVersion};
   const value=await frame.current!.request<OriginalAudioRange&{owner?:typeof owner;nonce?:string;clipId?:string;sceneId?:string;assetFileId?:string;sourceId?:string;contextEpoch?:number}>('read-original-audio-range',{owner,file,assetFileId:binding.ref.assetFileId,sourceId:binding.sourceId,clipId:gap.clipId,sceneId,contextEpoch:bridgeEpoch,nonce,sourceStartSeconds:binding.startSeconds,sourceEndSeconds:binding.endSeconds},{signal:combined});check();
   if(!value.owner||value.owner.groupId!==owner.groupId||value.owner.accountId!==owner.accountId||value.owner.projectId!==owner.projectId||value.owner.outputId!==owner.outputId||value.owner.sourceVersionId!==owner.sourceVersionId||value.assetFileId!==binding.ref.assetFileId||value.sourceId!==gap.sourceId||value.contextEpoch!==bridgeEpoch||value.nonce!==nonce||value.clipId!==gap.clipId||value.sceneId!==sceneId)throw Error('此项试听返回范围已改变，请重新核对。');
   return value;
  }finally{if(audioController.current===abort)audioController.current=null;}
 }
 async function exportVideo(){if(!ready||busy||aiBusy||pendingApply.current||originalExists&&!replaceConfirmed)return;if(saveRequest.current&&!pendingExport.current){await save().catch(()=>null);return;}setBusy(true);setError(null);let result=pendingExport.current;try{if(!result){result=await frame.current!.request<EditorExport>('export',{format:'mp4'});if(!(result.blob instanceof Blob)||!result.blob.size||!result.document)throw Error('视频导出未返回有效文件与对应工程');rememberExport(result);}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'导出未完成，工程仍可继续');if(alive.current)setBusy(false);return;}if(!alive.current)return;setBusy(false);const saved=await save(result).catch(()=>null);if(!saved||!alive.current)return;rememberExport(null);downloadEditorExport(result.blob,result.fileName);setExported(result);setNotice('MP4 已导出，对应剪辑工程已保存。可继续采用为当前作品成片。');}
 async function insertAsset(asset:{id:string;name:string;currentFileId:string;assetType:string}){
  if(!asset.currentFileId||busy||!ready)return;
  const operation=workspace.capture(),key=JSON.stringify([asset.id,asset.currentFileId]);operation.assertCurrent();
  let intent=insertIntents.current.get(key);if(!intent){const ref={mediaId:crypto.randomUUID(),assetId:asset.id,assetFileId:asset.currentFileId};intent={ref,requestId:`insert:${ref.mediaId}`};insertIntents.current.set(key,intent);}
  setBusy(true);markDirty();
  try{
   intent.file??=await readEditorMedia(intent.ref,controller.current.signal,operation);operation.assertCurrent();
   localFiles.current.set(intent.ref.mediaId,intent.file);exactFiles.current.set(exactFileKey(intent.ref),intent.file);
   if(!intent.linked){await operation.client.createMaterialLink({params:undefined,query:undefined,body:{projectId:ownerRef.current.projectId,contentOutputId:ownerRef.current.outputId,entityType:'asset',entityId:asset.id,stage:'production',role:'reference'}});intent.linked=true;operation.assertCurrent();}
   if(!media.current.some(row=>row.mediaId===intent!.ref.mediaId))media.current.push(intent.ref);
   if(alive.current)setMediaForView([...media.current]);
   await frame.current!.request('insert-media',{file:intent.file,mediaId:intent.ref.mediaId},{requestId:intent.requestId});operation.assertCurrent();insertIntents.current.delete(key);markDirty();
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'素材加入未完成，原选择已保留');throw cause;}
  finally{if(alive.current)setBusy(false);}
 }
 async function showHistory(){setHistoryOpen(true);if(historyInFlight.current)return;historyInFlight.current=true;setHistoryLoading(true);setHistoryError(null);const operation=workspace.capture();try{const rows=await operation.client.listProductionEditorVersions({params:{outputId:owner.outputId},query:{limit:20,offset:0},body:undefined});operation.assertCurrent();if(alive.current)setHistory(rows.items);}catch(e){if(alive.current&&!workspace.signal.aborted)setHistoryError(e instanceof Error?e.message:'历史未读到');}finally{historyInFlight.current=false;if(alive.current)setHistoryLoading(false);}}
 async function restore(revision:number){if(dirty||busy||saveRequest.current||pendingExport.current)return;setBusy(true);try{const saved=await client.restoreProductionEditor({params:{outputId:owner.outputId},query:undefined,body:{expectedRevision:owner.revision,sourceRevision:revision,requestId:crypto.randomUUID()}});if(alive.current){const next={...owner,revision:saved.revision,plan:saved.plan,state:'editable' as const};acceptOwner(next);if(next.plan?.editorVersion===3)await load(next);else onOriginal();}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'历史恢复失败，当前工程保留');}finally{if(alive.current)setBusy(false);}}
 async function pauseOriginalForPreview(){const operation=workspace.capture();operation.assertCurrent();if(!alive.current||!frame.current)throw Error('当前作品已离开');await frame.current.request('context',{pausePlayback:true});operation.assertCurrent();if(!alive.current)throw Error('当前作品已离开');}
 const materialsPanel=<div className="min-w-0"><AssetPicker ownerKey={`${creationScopeKey(scope)}:${owner.projectId}:${owner.outputId}`} label="从素材库选取" source={{kind:"library",key:"video-library",label:"素材库",allowedTypes:["image","video","audio"],map:asset=>assetChoice(asset)}} value={null} disabled={busy||aiBusy||!!applyPending||!ready} confirmLabel="加入编辑器" onConfirm={choice=>insertAsset(choice.value)}/></div>;
 const transcriptPanel=<section aria-label="原片与转写" className="h-full min-w-0 space-y-3 overflow-y-auto p-3"><div className="space-y-1"><h2 className="font-medium">原片与转写</h2><p className="text-xs text-muted-foreground">先从“素材”导入视频原片，在这里选原片看转写，再回“画面”预览。</p></div><NativeSourcePanel key={owner.outputId} document={owner} media={mediaForView.filter(ref=>metadata.find(m=>m.mediaId===ref.mediaId)?.type==='video')} metadata={metadata} disabled={busy||aiBusy||!!applyPending} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict}/><div className="flex flex-wrap items-center gap-3"><h3 className="font-medium">时间轴文字剪辑</h3><Button size="sm" variant="outline" disabled={busy||aiBusy||!!applyPending} onClick={()=>void refreshContext()}>读取时间轴选区</Button><p className="text-xs text-muted-foreground">先选主轨片段，保存后生成建议，再核对影响并采纳。独立图层保留原位置。</p></div><ProductionScriptMarkdownPanel previewTarget={previewTarget} onPreviewPlay={pauseOriginalForPreview} onApplyDraft={applyScriptDraft} onLocate={locateScriptToken} resolveToken={resolveScriptToken} onStateChange={scriptStateChanged} scope={scope} outputId={owner.outputId} prepareTarget={()=>directorPort.current!.prepareForTurn()} disabled={!ready||busy||aiBusy||!!applyPending} onRecoverReceipt={async(version,action)=>{const latest=await client.getProductionEditor({params:{outputId:ownerRef.current.outputId},query:undefined,body:undefined});if(latest.revision!==version.revision)throw Error("原候选已保存，当前工程已有更新；本地稿保留，请在历史版本核对。");await acceptVersion(version,action);}}/>{aiOpen&&view&&nativeScope?<><ProductionTranscriptPanel document={owner} planView={view} disabled={busy||aiBusy||!!applyPending} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict} run={async action=>{setAiBusy(true);try{await action();}finally{if(alive.current)setAiBusy(false);}}}/><ProductionRoughCandidatePanel document={owner} planView={view} nativeScope={nativeScope} accountId={accountId} workspaceScope={scope} contextEpoch={contextEpoch} gapContextSignal={audioLifetime.current.signal} sourceVersionId={mountVersion} decodeGap={decodeGap} isGapReviewCurrent={(epoch,revision)=>epoch===contextEpochRef.current&&revision===ownerRef.current.revision} disabled={busy} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict} onBusyChange={setAiBusy} onLocate={clipId=>{const e=nativeScope.scene.tracks.main.elements.find(e=>e.id===clipId);if(e)void frame.current!.request('seek',{outputId:owner.outputId,sceneId:nativeScope.sceneId,tick:e.startTime}).catch(error=>setError(error.message));}}/></>:<p className="text-sm text-muted-foreground">先将原视频放到主轨并登记原片信息，再读取时间轴选区。手工剪辑可继续使用。</p>}</section>;
 return <section className="min-w-0 space-y-3" aria-label="视频剪辑工作台">
  <header className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-3"><h2 className="shrink-0 text-base font-semibold">剪辑视频</h2><span className="text-sm text-muted-foreground">{dirty?'有未保存修改':owner.revision>0?'已保存':'新工程'}</span><span className="sr-only">{title}</span></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!ready||busy||aiBusy||!!applyPending||originalExists&&!replaceConfirmed} onClick={()=>void save().catch(()=>null)}>保存工程</Button><Button size="sm" variant={scriptCandidatePending?'outline':'default'} disabled={!ready||busy||aiBusy||!!applyPending||originalExists&&!replaceConfirmed} onClick={()=>void exportVideo()}>{busy?'处理中…':'导出当前场景 MP4'}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button ref={historyOpener} size="sm" variant="ghost" aria-label="更多剪辑操作">更多</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onSelect={()=>void showHistory()}>历史版本</DropdownMenuItem><DropdownMenuItem disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onSelect={onOriginal}>返回制作页</DropdownMenuItem><DropdownMenuItem asChild><a href="/reference-editors/NOTICE.html" target="_blank" rel="noreferrer">开源来源与许可</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
  {originalExists&&<div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><p>这里打开新的剪辑稿。原方案完整保留在历史中。</p><label className="flex items-center gap-2"><input type="checkbox" checked={replaceConfirmed} onChange={e=>setReplaceConfirmed(e.target.checked)}/>保存这份新剪辑稿</label></div>}
  {applyPending&&!conflict&&<Button variant="outline" disabled={busy||aiBusy} onClick={()=>void resumeNativeReceipt()}>恢复原剪辑回执</Button>}{conflict&&<div className="flex flex-wrap gap-2 rounded border p-3">{!applyPending&&<Button variant="outline" onClick={()=>void recoverConflict().catch(e=>setError(e.message))}>保留本地稿，重新核对当前版本</Button>}<Button variant="outline" onClick={()=>void reloadWithBackup().catch(e=>setError(e.message))}>备份本地稿并读取当前版本</Button></div>}{error&&<p role="alert" className="rounded border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-xs leading-4">{notice}</p>}
  <div aria-label="剪辑工具" className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!ready||busy||aiBusy} onClick={()=>{chatDock?.openDirector();chat.openChat({prefill:"请先读取当前时间轴和选区，再根据我的要求精剪。先给实际可预览的候选，等我采纳。"});}}>用编导精剪</Button><Button size="sm" variant="ghost" disabled={!ready||busy||aiBusy} onClick={()=>{setAiOpen(true);void frame.current?.request('open-addon',{panel:'transcript'}).catch(cause=>setError(cause.message));if(!context)void refreshContext();}}>原片与转写</Button></div>

  {nativeImportCount?<p role="status" className="text-sm text-muted-foreground">正在读取 {nativeImportCount} 批素材的媒体信息，完成的文件会逐个加入编辑器。</p>:null}
  {importRows.length?<section aria-label="素材导入进度" className="space-y-2 rounded-xl border bg-surface p-3">{importRows.map(row=><div key={row.intent.mediaId} className="flex items-center gap-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate" title={row.file.name}>{row.file.name}</p><p className="text-xs text-muted-foreground">{row.error??({creating:'准备上传',uploading:'上传原文件',confirming:'确认素材文件',linking:'关联当前作品',ready:'原文件已入库，剪辑工程仍需保存'} as const)[row.stage]} · {Math.round(row.elapsed/1000)} 秒</p></div>{row.error?<Button size="sm" variant="outline" disabled={busy||aiBusy||row.intent.running||row.intent.createUnknown} onClick={()=>void retryImport(row.file)}>恢复原导入</Button>:null}</div>)}</section>:null}
  <div className="h-[min(900px,calc(100dvh-190px))] min-h-[440px] min-w-0 overflow-hidden rounded-xl border bg-surface">{(groupId||accountId)&&<NativeEditorSurface ref={frame} editor="opencut-classic" workspaceAddons={{materials:materialsPanel,transcript:transcriptPanel,onDirectorMount:mountDirector,onPreviewMount:mountPreview}} visible={visible} owner={{groupId,accountId,projectId:initial.projectId,outputId:initial.outputId,sourceVersionId:mountVersion}} disabled={busy||aiBusy||!!savePending||!!exportPending||!!applyPending} onReady={()=>void load()} onChanged={value=>{invalidateAudio();if(isNativeContextEvent(value)){if(value.outputId!==ownerRef.current.outputId)return;nativeContextEpoch.current=value.contextEpoch;const selection=canonical([value.sceneId,value.selectedElements]);if(directorSelection.current!==null&&directorSelection.current!==selection){directorGeneration.current++;chat.notifyEditorChanged();}directorSelection.current=selection;if(value.documentChanged){scriptSelection.current=null;directorGeneration.current++;chat.notifyEditorChanged();}if(!value.documentChanged)return;}if(!isNativeContextEvent(value)){directorGeneration.current++;chat.notifyEditorChanged();}if(ready&&!busyRef.current){dirtyRef.current=true;setDirty(true);setExported(null);}}} onError={setError} onImportActivity={pending=>{nativeImports.current=pending;if(alive.current){setNativeImportCount(pending);markDirty();}}} onImport={importFile}/>}{!groupId&&!accountId&&<p className="p-4 text-sm text-muted-foreground">请先选择账号组或创作账号，再编辑当前作品。</p>}</div>

  {exported&&<div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><p className="text-sm">{exported.fileName}</p>{delivery.hasExistingFinal&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={delivery.replaceOk} onChange={e=>delivery.setReplaceOk(e.target.checked)}/>确认替换当前成片，旧文件保留在素材库</label>}<Button disabled={delivery.finalBusy||delivery.hasExistingFinal&&!delivery.replaceOk||delivery.pubLocked===true} onClick={()=>{if(delivery.hasExistingFinal&&!delivery.replaceOk)return;void delivery.onFinalFile(new File([exported.blob],exported.fileName,{type:'video/mp4'}));}}>{delivery.finalBusy?'正在采用…':'采用为作品成片'}</Button><Button variant="outline" onClick={()=>downloadEditorExport(exported.blob,exported.fileName)}>再次下载</Button>{delivery.finalError&&<p role="alert">{delivery.finalError}</p>}{delivery.finalNotice&&<p role="status">{delivery.finalNotice}</p>}</div>}
  <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-xl" onCloseAutoFocus={event=>{event.preventDefault();historyOpener.current?.focus();}}><DialogTitle>历史版本</DialogTitle><DialogDescription>恢复会创建新版本，原工程继续保留。</DialogDescription><section aria-label="历史剪辑工程">{historyLoading?<p role="status">正在读取历史版本…</p>:null}{historyError?<p role="alert">{historyError}</p>:null}{!historyLoading&&!historyError&&!history.length?<p>暂无历史版本</p>:null}{history.map(row=><div key={row.revision} className="mt-2 flex items-center justify-between text-sm"><span>版本 {row.revision} · {new Date(row.createdAt).toLocaleString('zh-CN')}</span><Button size="sm" variant="outline" disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onClick={()=>void restore(row.revision)}>恢复此版</Button></div>)}</section></DialogContent></Dialog>
 </section>;
}
