"use client";
import type {VideoLeaveControl} from "./project-video-session-registry";
import {creationScopeKey} from "@/lib/creation-workspace-scope";
import {AssetPicker} from "@/components/media/asset-picker";
import {assetChoice} from "@/components/media/asset-picker.types";
import * as React from 'react';
import {productionReferencePlan,type ProductionEditorDocument,type ReferenceEditorMedia,type ReferenceEditorDocument,type ProductionEditorVersion,projectProductionRoughPlan,readProductionNativeScene} from '@creatoros/contract';
import {useCreationWorkspace,useCreationScope,type CreationScope} from '@/lib/creation-workspace-scope';
import {isNativeContextEvent} from './native-editor-contract';
import {resolveGapAudioBinding,type OriginalAudioRange} from '@/features/production/native-gap-audio-player';
import type {ProductionPauseGap} from '@creatoros/contract';
import {Button} from '@/components/ui/button';
import {NativeEditorSurface,type NativeEditorHandle,type EditorSnapshot,type EditorExport} from './native-editor-surface';
import {uploadEditorMedia,readEditorMedia,downloadEditorExport,type EditorUploadIntent,type EditorUploadStage} from './reference-editor-media';
import {useProductionDelivery} from '@/features/production/use-production-delivery';
import {readVideoDurationViaElement,type WireProduction} from '@/features/production/production-resource-operations';
import {statusStepsTo,type ProductionStatus} from '@/features/production/production-flow';
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
type WorkbenchProps={scopeOverride?:CreationScope;visible?:boolean;onLeaveControl?:(control:VideoLeaveControl|null)=>void;initial:ProductionEditorDocument;title:string;onOriginal:()=>void;onSaved:(document:ProductionEditorDocument)=>void};
export function VideoReferenceWorkbench(props:WorkbenchProps){
 const currentScope=useNativeWorkspace(),scope=props.scopeOverride??currentScope;
 return <VideoReferenceWorkbenchSession key={`${scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??'missing'}`}:${props.initial.outputId}`} {...props} scope={scope}/>;
}
function VideoReferenceWorkbenchSession({initial,title,onOriginal,onSaved,scope,visible=true,onLeaveControl}:WorkbenchProps&{scope:CreationScope}){
 const {groupId,accountId}=scope,workspace=useCreationWorkspace(scope),client=workspace.client;
 const liveScope=useCreationScope();React.useEffect(()=>{if(creationScopeKey(liveScope)===creationScopeKey(scope)&&workspace.signal.aborted)workspace.activate();},[creationScopeKey(liveScope),workspace]);
 const [contextEpoch,setContextEpoch]=React.useState(0),contextEpochRef=React.useRef(0);
 const audioLifetime=React.useRef(new AbortController());
 const audioController=React.useRef<AbortController|null>(null),nativeContextEpoch=React.useRef<number|null>(null);
 function invalidateAudio(){audioLifetime.current.abort();audioLifetime.current=new AbortController();contextEpochRef.current++;audioController.current?.abort();audioController.current=null;setContextEpoch(contextEpochRef.current);}
 const [mountVersion]=React.useState(String(initial.revision));
 const frame=React.useRef<NativeEditorHandle>(null),alive=React.useRef(true),controller=React.useRef(new AbortController());
 const [owner,setOwner]=React.useState(initial),[ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[dirty,setDirty]=React.useState(false),[error,setError]=React.useState<string|null>(null),[notice,setNotice]=React.useState<string|null>(null),[replaceConfirmed,setReplaceConfirmed]=React.useState(false);
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
  const rows=await Promise.allSettled(media.current.map(async ref=>({...metadata.find(row=>row.mediaId===ref.mediaId),mediaId:ref.mediaId,file:exactFiles.current.get(exactFileKey(ref))??await readEditorMedia(ref,controller.current.signal,workspace.capture())})));
  const files=rows.flatMap(row=>row.status==='fulfilled'?[row.value]:[]);missingMedia.current=rows.flatMap((row,index)=>row.status==='rejected'?[metadata.find(m=>m.mediaId===media.current[index].mediaId)??{mediaId:media.current[index].mediaId}]:[]);
  if(!alive.current)return;await frame.current!.request('load',{document:document?.nativeDocument??null,title,outputId:next.outputId,media:files});
  if(alive.current){setMediaForView([...media.current]);setReady(true);setDirty(false);dirtyRef.current=false;if(missingMedia.current.length)setNotice(`${missingMedia.current.length} 个素材暂未读到，其余素材可继续编辑；原片引用和时间轴已保留。`);}
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
    if(!pendingApply.current)rememberApply({requestId:`native-adopt:${action?.requestId??version.requestId??crypto.randomUUID()}`,payload:{outputId:current.outputId,sceneId:after.id,beforeTracks:before.tracks,afterTracks:after.tracks,expectedBeforeDigest:await digest(before.tracks)},version});
    const pending=pendingApply.current!;if(pending.version.revision!==version.revision)throw Error('还有原剪辑回执等待确认，请先恢复。');
    try{await frame.current!.request('apply-tracks',pending.payload,{requestId:pending.requestId});}catch(e){if(isKnownNativeConflict(e)){setConflict(true);throw Object.assign(Error(e instanceof Error?e.message:'本地时间轴已有修改，未覆盖。'),{code:'NativeApplyConflictError',status:409});}throw e;}
    rememberApply(null);
   }
  }
  if(!alive.current)return;const next={...current,revision:version.revision,productionId:version.productionId,state:'editable' as const,plan:version.plan,unsupportedFields:[]};if(version.revision>=ownerRef.current.revision)acceptOwner(next);
  const now=await frame.current!.request<NativeContext>('context');if(!alive.current)return;setContext(now);const saved=productionReferencePlan.parse(ownerRef.current.plan);const stillChanged=canonical(nativeContent(planFor(now)))!==canonical(nativeContent(saved));setDirty(stillChanged);dirtyRef.current=stillChanged;setExported(null);setNotice(stillChanged?(restoringReceipt?'原采纳回执已确认，本地后续修改和撤销继续保留。':'已采用到当前时间轴，本地后续修改已保留，请继续核对并保存。'):'已采用到当前时间轴，可继续编辑或撤销。');
 }
 async function resumeNativeReceipt(){const pending=pendingApply.current;if(!pending||busyRef.current)return;setAiBusy(true);setError(null);try{await frame.current!.request('apply-tracks',pending.payload,{requestId:pending.requestId});if(!alive.current)return;rememberApply(null);const current=ownerRef.current,version=pending.version;if(version.revision>=current.revision)acceptOwner({...current,revision:version.revision,productionId:version.productionId,plan:version.plan,state:'editable',unsupportedFields:[]});const now=await frame.current!.request<NativeContext>('context');if(!alive.current)return;setContext(now);const saved=productionReferencePlan.parse(ownerRef.current.plan);const changed=canonical(nativeContent(planFor(now)))!==canonical(nativeContent(saved));setDirty(changed);dirtyRef.current=changed;setNotice(changed?'原剪辑回执已确认，本地后续修改或撤销已保留。':'已采用到当前时间轴，可继续编辑或撤销。');}catch(e){if(alive.current){if(isKnownNativeConflict(e))setConflict(true);setError(e instanceof Error?e.message:'原剪辑回执仍未确认，当前输入保留。');}}finally{if(alive.current)setAiBusy(false);}}
 async function recoverConflict(){const value=await client.getProductionEditor({params:{outputId:ownerRef.current.outputId},query:undefined,body:undefined});if(!alive.current)return;acceptOwner(value);rememberSave(null);setConflict(false);setDirty(true);dirtyRef.current=true;setNotice('当前已保存版本已重新核对，本地时间轴保留；请核对后保存或重新生成建议。');}
 async function reloadWithBackup(){const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');const backup={kind:'creatoros.native-edit-backup',outputId:ownerRef.current.outputId,projectId:ownerRef.current.projectId,baseRevision:ownerRef.current.revision,plan:planFor(snapshot)};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});downloadEditorExport(blob,'剪辑稿本地备份.json');const value=await client.getProductionEditor({params:{outputId:ownerRef.current.outputId},query:undefined,body:undefined});if(!alive.current)return;acceptOwner(value);rememberApply(null);rememberSave(null);rememberExport(null);setContext(null);setConflict(false);await load(value);setNotice('本地稿已下载备份，当前已保存版本已读回。');}
 React.useLayoutEffect(()=>{
  const handle:VideoLeaveControl={readState:()=>({dirty:dirtyRef.current,busy:busyRef.current||busy||aiBusy,pending:Boolean(saveRequest.current||pendingApply.current||pendingExport.current||insertIntents.current.size||[...uploadIntents.current.values()].some(intent=>intent.stage!=="ready")),imports:imports.current+nativeImports.current,ready}),saveForLeave:async()=>{if(imports.current||nativeImports.current||busyRef.current||busy||aiBusy||!ready)return false;await save();return !dirtyRef.current&&!saveRequest.current&&!pendingApply.current&&!pendingExport.current&&!imports.current&&!nativeImports.current&&!insertIntents.current.size&&![...uploadIntents.current.values()].some(intent=>intent.stage!=="ready");},recoverOriginalReceipt:async()=>{if(pendingApply.current)await resumeNativeReceipt();if(saveRequest.current)await save();if(pendingExport.current)await exportVideo();},exportLocalBackup:async()=>{const snapshot=await frame.current!.request<EditorSnapshot>('snapshot');downloadEditorExport(new Blob([JSON.stringify({kind:'creatoros.native-edit-backup',scope,projectId:ownerRef.current.projectId,outputId:ownerRef.current.outputId,baseRevision:ownerRef.current.revision,plan:planFor(snapshot),mediaRefs:media.current,pendingSave:saveRequest.current?.body??null,pendingApply:pendingApply.current,pendingImports:imports.current,nativePendingImports:nativeImports.current,pendingInserts:[...insertIntents.current.values()].map(intent=>({ref:intent.ref,requestId:intent.requestId,linked:intent.linked??false})),uploadIntents:[...uploadIntents.current.values()].map(intent=>({mediaId:intent.mediaId,uploadId:intent.upload?.uploadId??null,stage:intent.stage,createUnknown:intent.createUnknown??false,putConfirmed:intent.putConfirmed??false,ref:intent.ref??null,linked:intent.linked??false}))},null,2)],{type:'application/json'}),'剪辑稿本地备份.json');for(const [key,file] of localFiles.current)if(!(snapshot.mediaMetadata??[]).some(row=>row.mediaId===key))downloadEditorExport(file,file.name);},dispose:async()=>{await frame.current?.dispose();}};
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
 async function showHistory(){setHistoryOpen(true);try{const rows=await client.listProductionEditorVersions({params:{outputId:owner.outputId},query:{limit:20,offset:0},body:undefined});if(alive.current)setHistory(rows.items);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'历史未读到');}}
 async function restore(revision:number){if(dirty||busy||saveRequest.current||pendingExport.current)return;setBusy(true);try{const saved=await client.restoreProductionEditor({params:{outputId:owner.outputId},query:undefined,body:{expectedRevision:owner.revision,sourceRevision:revision,requestId:crypto.randomUUID()}});if(alive.current){const next={...owner,revision:saved.revision,plan:saved.plan,state:'editable' as const};acceptOwner(next);if(next.plan?.editorVersion===3)await load(next);else onOriginal();}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'历史恢复失败，当前工程保留');}finally{if(alive.current)setBusy(false);}}
 return <section className="min-w-0 space-y-3" aria-label="视频剪辑工作台">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">剪辑视频 · {title}</h2><p className="text-xs text-muted-foreground">{dirty?'有未保存修改':'素材、预览、时间轴和属性可直接编辑'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!ready||busy||aiBusy||!!applyPending||originalExists&&!replaceConfirmed} onClick={()=>void save().catch(()=>null)}>保存工程</Button><Button disabled={!ready||busy||aiBusy||!!applyPending||originalExists&&!replaceConfirmed} onClick={()=>void exportVideo()}>{busy?'处理中…':'导出当前场景 MP4'}</Button><Button variant="ghost" disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onClick={()=>void showHistory()}>历史版本</Button><Button variant="ghost" disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onClick={onOriginal}>返回制作页</Button></div></header>
  {originalExists&&<div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><p>这里打开新的剪辑稿。原方案完整保留在历史中。</p><label className="flex items-center gap-2"><input type="checkbox" checked={replaceConfirmed} onChange={e=>setReplaceConfirmed(e.target.checked)}/>保存这份新剪辑稿</label></div>}
  {applyPending&&!conflict&&<Button variant="outline" disabled={busy||aiBusy} onClick={()=>void resumeNativeReceipt()}>恢复原剪辑回执</Button>}{conflict&&<div className="flex flex-wrap gap-2 rounded border p-3">{!applyPending&&<Button variant="outline" onClick={()=>void recoverConflict().catch(e=>setError(e.message))}>保留本地稿，重新核对当前版本</Button>}<Button variant="outline" onClick={()=>void reloadWithBackup().catch(e=>setError(e.message))}>备份本地稿并读取当前版本</Button></div>}{error&&<p role="alert" className="rounded border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-xs leading-4">{notice}</p>}
  <div aria-label="剪辑工具" className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!ready||busy||aiBusy} onClick={()=>{setAiOpen(v=>!v);if(!context&&!aiOpen)void refreshContext();}}>AI 辅助粗剪{aiOpen?' · 收起':''}</Button><div className="min-w-[18rem] max-w-md flex-1"><AssetPicker ownerKey={`${creationScopeKey(scope)}:${owner.projectId}:${owner.outputId}`} label="从素材库选取" source={{kind:"library",key:"video-library",label:"素材库",allowedTypes:["image","video","audio"],map:asset=>assetChoice(asset)}} value={null} disabled={busy||aiBusy||!!applyPending||!ready} confirmLabel="加入编辑器" onConfirm={choice=>insertAsset(choice.value)}/></div></div>
  <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">开源来源与许可</summary><a className="underline" href="/reference-editors/NOTICE.html" target="_blank" rel="noreferrer">OpenCut 来源与许可</a></details>
  {nativeImportCount?<p role="status" className="text-sm text-muted-foreground">正在读取 {nativeImportCount} 批素材的媒体信息，完成的文件会逐个加入编辑器。</p>:null}
  {importRows.length?<section aria-label="素材导入进度" className="space-y-2 rounded-xl border bg-surface p-3">{importRows.map(row=><div key={row.intent.mediaId} className="flex items-center gap-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate" title={row.file.name}>{row.file.name}</p><p className="text-xs text-muted-foreground">{row.error??({creating:'准备上传',uploading:'上传原文件',confirming:'确认素材文件',linking:'关联当前作品',ready:'原文件已入库，剪辑工程仍需保存'} as const)[row.stage]} · {Math.round(row.elapsed/1000)} 秒</p></div>{row.error?<Button size="sm" variant="outline" disabled={busy||aiBusy||row.intent.running||row.intent.createUnknown} onClick={()=>void retryImport(row.file)}>恢复原导入</Button>:null}</div>)}</section>:null}
  <div className="h-[min(780px,calc(100dvh-240px))] min-h-[440px] min-w-0 overflow-hidden rounded-xl border bg-surface">{(groupId||accountId)&&<NativeEditorSurface ref={frame} editor="opencut-classic" visible={visible} owner={{groupId,accountId,projectId:initial.projectId,outputId:initial.outputId,sourceVersionId:mountVersion}} disabled={busy||aiBusy||!!savePending||!!exportPending||!!applyPending} onReady={()=>void load()} onChanged={value=>{invalidateAudio();if(isNativeContextEvent(value)){if(value.outputId!==ownerRef.current.outputId)return;nativeContextEpoch.current=value.contextEpoch;if(!value.documentChanged)return;}if(ready&&!busyRef.current){dirtyRef.current=true;setDirty(true);setExported(null);}}} onError={setError} onImportActivity={pending=>{nativeImports.current=pending;if(alive.current){setNativeImportCount(pending);markDirty();}}} onImport={importFile}/>}{!groupId&&!accountId&&<p className="p-4 text-sm text-muted-foreground">请先选择账号组或创作账号，再编辑当前作品。</p>}</div>
  {aiOpen&&<section aria-label="AI 辅助粗剪" className="min-w-0 space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center gap-3"><h2 className="font-medium">AI 辅助粗剪</h2><Button size="sm" variant="outline" disabled={busy||aiBusy||!!applyPending} onClick={()=>void refreshContext()}>读取时间轴选区</Button><p className="text-xs text-muted-foreground">先选主轨片段，保存后生成建议，再核对影响并采纳。独立图层保留原位置。</p></div><NativeSourcePanel key={owner.outputId} document={owner} media={mediaForView.filter(ref=>metadata.find(m=>m.mediaId===ref.mediaId)?.type==='video')} metadata={metadata} disabled={busy||aiBusy||!!applyPending} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict}/>{view&&nativeScope?<><ProductionTranscriptPanel document={owner} planView={view} disabled={busy||aiBusy||!!applyPending} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict} run={async action=>{setAiBusy(true);try{await action();}finally{if(alive.current)setAiBusy(false);}}}/><ProductionRoughCandidatePanel document={owner} planView={view} nativeScope={nativeScope} accountId={accountId} workspaceScope={scope} contextEpoch={contextEpoch} gapContextSignal={audioLifetime.current.signal} sourceVersionId={mountVersion} decodeGap={decodeGap} isGapReviewCurrent={(epoch,revision)=>epoch===contextEpochRef.current&&revision===ownerRef.current.revision} disabled={busy} prepareDocument={prepareDocument} onSaved={acceptVersion} onRecoverConflict={recoverConflict} onBusyChange={setAiBusy} onLocate={clipId=>{const e=nativeScope.scene.tracks.main.elements.find(e=>e.id===clipId);if(e)void frame.current!.request('seek',{outputId:owner.outputId,sceneId:nativeScope.sceneId,tick:e.startTime}).catch(error=>setError(error.message));}}/></>:<p className="text-sm text-muted-foreground">先将原视频放到主轨并登记原片信息，再读取时间轴选区。手工剪辑可继续使用。</p>}</section>}
  {exported&&<div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><p className="text-sm">{exported.fileName}</p>{delivery.hasExistingFinal&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={delivery.replaceOk} onChange={e=>delivery.setReplaceOk(e.target.checked)}/>确认替换当前成片，旧文件保留在素材库</label>}<Button disabled={delivery.finalBusy||delivery.hasExistingFinal&&!delivery.replaceOk||delivery.pubLocked===true} onClick={()=>{if(delivery.hasExistingFinal&&!delivery.replaceOk)return;void delivery.onFinalFile(new File([exported.blob],exported.fileName,{type:'video/mp4'}));}}>{delivery.finalBusy?'正在采用…':'采用为作品成片'}</Button><Button variant="outline" onClick={()=>downloadEditorExport(exported.blob,exported.fileName)}>再次下载</Button>{delivery.finalError&&<p role="alert">{delivery.finalError}</p>}{delivery.finalNotice&&<p role="status">{delivery.finalNotice}</p>}</div>}
  {historyOpen&&<section className="rounded-lg border p-4" aria-label="历史剪辑工程"><h3 className="font-medium">历史版本</h3><p className="text-sm text-muted-foreground">恢复会创建新版本，原工程继续保留。</p>{history.map(row=><div key={row.revision} className="mt-2 flex items-center justify-between text-sm"><span>版本 {row.revision} · {new Date(row.createdAt).toLocaleString('zh-CN')}</span><Button size="sm" variant="outline" disabled={busy||aiBusy||dirty||!!savePending||!!exportPending||!!applyPending} onClick={()=>void restore(row.revision)}>恢复此版</Button></div>)}</section>}
 </section>;
}
