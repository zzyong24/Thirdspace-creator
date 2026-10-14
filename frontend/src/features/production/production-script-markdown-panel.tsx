'use client';
import * as React from 'react';
import {createPortal} from 'react-dom';
import {workEditorContext,workEditorCandidate,readProductionNativeScene,type ProductionEditorVersion,type WorkEditorTarget,type WorkEditorContext,type WorkEditorCandidate} from '@creatoros/contract';
import {useCreationWorkspace,type CreationScope,creationScopeKey} from '@/lib/creation-workspace-scope';
import {useDraftChatRequest} from '@/features/draft-workbench/draft-chat-request';
import {editorDigest,EditorCandidateConflictError} from '@/features/draft-workbench/draft-chat-request';
import {ProductionScriptTranscript,type ScriptTranscriptLocation,type ScriptTranscriptToken} from './production-script-transcript';
import {Button} from '@/components/ui/button';
import {downloadEditorExport} from '@/features/reference-editors/reference-editor-media';
export type ScriptMirrorState={dirty:boolean;pending:boolean;draft:string;base:WorkEditorContext|null;candidate:WorkEditorCandidate|null;requestId:string|null};
/** 文字草稿与保存基线分别保留；解析/diff仍由已有后端候选服务执行。 */
export function ProductionScriptMarkdownPanel({scope,outputId,prepareTarget,previewTarget,onPreviewPlay,disabled=false,onRecoverReceipt,onStateChange,onApplyDraft,onLocate,resolveToken}:{scope:CreationScope;outputId:string;prepareTarget:()=>Promise<WorkEditorTarget|undefined>;previewTarget?:HTMLElement|null;onPreviewPlay?:()=>Promise<void>;disabled?:boolean;onApplyDraft?:(candidate:WorkEditorCandidate,requestId:string)=>Promise<void>;onLocate?:(target:WorkEditorTarget,location:ScriptTranscriptLocation)=>void;resolveToken?:(token:ScriptTranscriptToken)=>{sourceTick:number;nativeTick:number;tokenId:string}|null;onStateChange?:(state:ScriptMirrorState)=>void;onRecoverReceipt?:(version:ProductionEditorVersion,action:{requestId:string;expectedRevision:number;candidateDigest?:string|null})=>Promise<void>}){
 const workspace=useCreationWorkspace(scope),chat=useDraftChatRequest(),key=`creatoros:video-script:${creationScopeKey(scope)}:${outputId}`;
 const [base,setBase]=React.useState<WorkEditorContext|null>(null),[draft,setDraft]=React.useState(''),[candidate,setCandidate]=React.useState<WorkEditorCandidate|null>(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[preview,setPreview]=React.useState<{url:string;fileName:string}|null>(null),[requestId,setRequestId]=React.useState<string|null>(null);
 const [previewed,setPreviewed]=React.useState(false),[previewWarnings,setPreviewWarnings]=React.useState<string[]>([]);
 const [pendingAdoption,setPendingAdoption]=React.useState(false),[pendingKind,setPendingKind]=React.useState<'adopt'|'draft'>('adopt');
 React.useLayoutEffect(()=>{if(!previewTarget)return;if(preview)previewTarget.setAttribute('data-creatoros-preview-active','true');else previewTarget.removeAttribute('data-creatoros-preview-active');return()=>{previewTarget.removeAttribute('data-creatoros-preview-active');};},[previewTarget,preview]);
 const previewOpener=React.useRef<HTMLButtonElement>(null);
 const active=React.useRef(true),inFlight=React.useRef(false),url=React.useRef<string|null>(null),draftRef=React.useRef(draft),baseRef=React.useRef(base);
 // StrictMode会cleanup后复用同一元素，重新绑定时恢复当前有效Blob，真实卸载仍显式停播卸载媒体。
 const attachPreviewPlayer=React.useCallback((node:HTMLVideoElement|null)=>{if(!node)return;const resource=url.current;if(resource&&node.getAttribute('src')!==resource){node.setAttribute('src',resource);node.load();}return()=>{node.pause();node.removeAttribute('src');node.load();};},[]);
 React.useLayoutEffect(()=>{draftRef.current=draft;baseRef.current=base;},[draft,base]);
 // 缓存是外部存储：仅挂载后恢复，保证SSR一致；后续读回不得覆盖dirty。
 /* eslint-disable react-hooks/set-state-in-effect -- 外部sessionStorage挂载恢复原稿与原请求 */
 React.useEffect(()=>{active.current=true;try{
  const value=JSON.parse(sessionStorage.getItem(key)??'null'),read=workEditorContext.safeParse(value?.base),proposal=workEditorCandidate.safeParse(value?.candidate);
  if(read.success&&typeof value.draft==='string'&&read.data.target.owner==='production'&&read.data.target.outputId===outputId){setBase(read.data);setDraft(value.draft);baseRef.current=read.data;draftRef.current=value.draft;
   if(value.pendingAdoption===true&&proposal.success&&proposal.data.target.outputId===outputId&&proposal.data.target.projectId===read.data.target.projectId&&typeof value.requestId==='string'&&value.requestId.length>=16){setCandidate(proposal.data);setRequestId(value.requestId);setPendingKind(value.pendingKind==='draft'?'draft':'adopt');setPendingAdoption(true);}
  }
 }catch{}return()=>{active.current=false;if(url.current)URL.revokeObjectURL(url.current);};},[key,outputId]);
 /* eslint-enable react-hooks/set-state-in-effect */
 function persist(value:unknown){sessionStorage.setItem(key,JSON.stringify(value));}
 function clearPreview(){if(url.current){URL.revokeObjectURL(url.current);url.current=null;}setPreview(null);}
 function complete(message='已采纳到当前时间轴。可重新读取继续修改。'){sessionStorage.removeItem(key);setBase(null);baseRef.current=null;setDraft('');setCandidate(null);setRequestId(null);setPendingAdoption(false);setPreviewed(false);setPreviewWarnings([]);clearPreview();setError(message);}

 const dirty=Boolean(base?.scriptMarkdown&&draft!==base.scriptMarkdown.markdown);
 React.useEffect(()=>{onStateChange?.({dirty,pending:pendingAdoption,draft,base,candidate,requestId});},[dirty,pendingAdoption,draft,base,candidate,requestId,onStateChange]);
 function remember(next:string,read=baseRef.current){if(pendingAdoption)return;setDraft(next);setCandidate(null);setRequestId(null);setPreviewed(false);setPreviewWarnings([]);if(url.current){URL.revokeObjectURL(url.current);url.current=null;}setPreview(null);try{sessionStorage.setItem(key,JSON.stringify({base:read,draft:next}));}catch{/* 窗口内草稿仍保留；不把缓存失败说成保存成功。 */}}
 async function run(action:(check:()=>void)=>Promise<void>){if(disabled||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');const operation=workspace.capture();const check=()=>{operation.assertCurrent();if(!active.current)throw Error('已离开当前文字稿');};try{check();await action(check);check();}catch(cause){if(active.current&&!workspace.signal.aborted)setError(cause instanceof Error?cause.message:'本次回复尚未确认，文字稿已保留。');}finally{inFlight.current=false;if(active.current)setBusy(false);}}
 async function read(check:()=>void){if(dirty)throw Error('已有文字修改，当前草稿保留。先生成候选，或备份后读取当前工程。');const target=await prepareTarget();check();if(!target||target.owner!=='production'||target.outputId!==outputId)throw Error('当前视频目标尚未准备好');const current=await workspace.client.readProductionEditorScript({params:{outputId},query:undefined,body:{target}});check();if(!current.scriptMarkdown)throw Error('当前工程未返回时间轴文字');setBase(current);baseRef.current=current;remember(current.scriptMarkdown.markdown,current);}
 async function propose(check:()=>void){const read=baseRef.current,script=read?.scriptMarkdown;if(!read||!script)throw Error('请先读取当前时间轴');const result=await workspace.client.proposeProductionEditorScript({params:{outputId},query:undefined,body:{target:read.target,input:{base:read.base,baseDigest:read.baseDigest,summary:'按当前文字修改剪辑',candidate:{kind:'markdown_timeline',owner:'production',sceneId:script.sceneId,markdown:draftRef.current,declaredTrackIds:script.tracks.map(t=>t.trackId),stateStamp:script.stateStamp,libraryStamp:script.libraryStamp}}}});check();setCandidate(result);setPreviewed(false);setPreviewWarnings([]);setRequestId(crypto.randomUUID());}
 async function showPreview(check:()=>void){if(!candidate)throw Error('请先生成候选');const result=await chat.previewEditorCandidate(candidate);check();if(!result)throw Error('当前视频预览尚未绑定，请回到本作品核对');await onPreviewPlay?.();check();if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(result.blob);setPreview({url:url.current,fileName:result.fileName});setPreviewed(true);setPreviewWarnings(result.warnings??[]);}
 async function adopt(check:()=>void){
  if(!candidate||!requestId||!candidate.apply)throw Error('候选没有可采纳的改动');
  // 写请求发出前持久化原候选与原ID；缓存失败则保留窗口内草稿并停止发送。
  const wasPending=pendingAdoption;persist({base:baseRef.current,draft:draftRef.current,candidate,requestId,pendingAdoption:true,pendingKind:'adopt'});setPendingAdoption(true);setPendingKind('adopt');
  let result;try{result=await chat.adoptEditorCandidate(candidate,requestId);}catch(cause){if((!wasPending||(cause as {originalSettled?:boolean})?.originalSettled)&&(cause instanceof EditorCandidateConflictError||(cause as {notSent?:boolean})?.notSent)){setPendingAdoption(false);persist({base:baseRef.current,draft:draftRef.current});}throw cause;}check();
  if(!result||result.status!=='adopted')throw Error(result?.message??'原采纳尚未同步，请核对原回执，文字稿已保留');complete();
 }
 async function applyDraft(check:()=>void){
  if(!candidate?.apply||!requestId||!onApplyDraft)throw Error('文字剪辑草稿尚未绑定');
  const wasPending=pendingAdoption;persist({base:baseRef.current,draft:draftRef.current,candidate,requestId,pendingAdoption:true,pendingKind:'draft'});setPendingKind('draft');setPendingAdoption(true);
  try{await onApplyDraft(candidate,requestId);}catch(cause){if((!wasPending||(cause as {originalSettled?:boolean})?.originalSettled)&&(cause as {notSent?:boolean})?.notSent){setPendingAdoption(false);persist({base:baseRef.current,draft:draftRef.current});}throw cause;}check();
  complete('已应用为未保存剪辑稿，可撤销；保存工程后继续修改。');
 }
 async function recover(check:()=>void){
  if(!candidate?.apply||candidate.apply.operation!=='applyProductionEditor'||!requestId||!onRecoverReceipt)throw Error('原采纳恢复尚未绑定');
  const receipt=await workspace.client.getProductionEditorReceipt({params:{outputId,requestId},query:undefined,body:undefined});check();
  if(!receipt)throw Error('原请求尚未查到回执，候选和原请求ID继续保留。');
  if(candidate.candidate?.kind!=='native_scene'||receipt.productionId!==(candidate.target.savedBase.kind==='production'?candidate.target.savedBase.productionId:null)||receipt.requestId!==requestId)throw Error('原回执与候选身份不一致');
  const saved=readProductionNativeScene(receipt.plan,candidate.candidate.document.id);
  if(!saved||await editorDigest(saved)!==candidate.candidateDigest)throw Error('原回执内容与候选不一致');check();
  await onRecoverReceipt(receipt,{requestId,expectedRevision:candidate.apply.body.expectedRevision,candidateDigest:candidate.candidateDigest});check();complete();
 }

 const previewPlayer=preview?<section aria-label="候选画面比较" className={`pointer-events-auto flex max-h-full min-h-0 flex-col gap-2 overflow-y-auto bg-surface p-3${previewTarget?' h-full':''}`}><div className="flex shrink-0 items-center justify-between gap-2"><span className="text-sm font-medium">这次修改的预览</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>{clearPreview();requestAnimationFrame(()=>{if(active.current)previewOpener.current?.focus();});}}>返回当前画面</Button></div><video ref={attachPreviewPlayer} controls onPlay={event=>{const player=event.currentTarget;void onPreviewPlay?.().catch(cause=>{player.pause();if(active.current)setError(cause instanceof Error?cause.message:'当前播放未准备好，请重新核对');});}} src={preview.url} className={`w-full rounded-control object-contain ${previewTarget?'min-h-0 flex-1':'max-h-[60dvh] shrink-0'}`} aria-label="文字剪辑候选预览"/></section>:null;
 return <section aria-label="按文字剪辑" className="min-w-0 space-y-3 border-b border-border pb-4"><h3 className="text-sm font-medium">按文字剪辑</h3>
  <p className="text-sm text-text-muted">改删留和顺序，先预览再采纳；原始转录与其他图层保持原样。</p>
  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled||busy||Boolean(requestId&&candidate?.apply)} onClick={()=>void run(read)}>读取当前时间轴</Button>{dirty?<Button size="sm" variant="ghost" disabled={busy||pendingAdoption} onClick={()=>{downloadEditorExport(new Blob([draft],{type:'text/markdown'}),'时间轴文字稿.md');const current=base?.scriptMarkdown?.markdown??'';remember(current);}}>备份文字稿并还原</Button>:null}</div>
  {base?.scriptMarkdown?<ProductionScriptTranscript markdown={draft} onChange={remember} onLocate={position=>onLocate?.(base.target,position)} resolveToken={resolveToken} disabled={disabled||busy||Boolean(requestId&&candidate?.apply)}/>:null}
  <details><summary className="cursor-pointer text-sm">高级：编辑时间轴文字</summary>
  {base?.scriptMarkdown?<><label className="grid min-w-0 gap-1 text-sm">时间轴文字<textarea aria-label="时间轴文字" className="min-h-[240px] w-full min-w-0 resize-y rounded-control border border-border bg-surface p-3 font-mono text-sm leading-6" value={draft} disabled={disabled||busy||Boolean(requestId&&candidate?.apply)} onChange={e=>remember(e.target.value)}/></label><details><summary className="cursor-pointer text-sm">只读原片文字库</summary>{base.scriptMarkdown.libraryDocs.map(doc=><pre key={doc.mediaId} className="whitespace-pre-wrap break-words text-sm">{doc.content}</pre>)}</details></>:null}</details>
  <Button size="sm" variant="outline" disabled={disabled||busy||!dirty||Boolean(requestId&&candidate?.apply)} onClick={()=>void run(propose)}>生成剪辑候选</Button>
  {candidate?<section className="min-w-0 space-y-2" aria-label="文字剪辑候选"><p className="text-sm font-medium">{candidate.apply?(previewed?'剪辑候选已预览，待采纳':'剪辑候选待预览'):'没有可采纳的改动'}</p>{previewWarnings.map((warning,i)=><p key={`preview-${i}`} role="status" className="text-sm text-text-muted">{warning}</p>)}{candidate.scriptDiagnostics?.warnings.map((warning,i)=><p key={i} className="text-sm text-text-muted">{warning}</p>)}{candidate.scriptDiagnostics?.errors.map((issue,i)=><p key={i} role="status" className="text-sm">第 {issue.line} 行：{issue.message}{issue.hint?`；${issue.hint}`:''}</p>)}{candidate.apply?<><p className="text-sm">{candidate.scriptDiagnostics?.operations.length??candidate.changes.length} 项调整</p><div className="flex flex-wrap gap-2"><Button ref={previewOpener} size="sm" variant="outline" disabled={disabled||busy} onClick={()=>void run(showPreview)}>预览这次修改</Button>{onApplyDraft?<Button size="sm" variant="outline" disabled={disabled||busy||pendingAdoption} onClick={()=>void run(applyDraft)}>应用为可撤销草稿</Button>:null}<Button size="sm" disabled={disabled||busy||!previewed||pendingAdoption} onClick={()=>void run(adopt)}>采纳并保存新版本</Button><Button size="sm" variant="ghost" disabled={busy||pendingAdoption} onClick={()=>{setCandidate(null);setRequestId(null);setPreviewed(false);setPreviewWarnings([]);clearPreview();}}>丢弃候选</Button>{pendingAdoption&&pendingKind==='adopt'?<Button size="sm" variant="outline" disabled={busy||disabled} onClick={()=>void run(recover)}>核对原采纳结果</Button>:null}{pendingAdoption?<Button size="sm" variant="outline" disabled={busy||disabled} onClick={()=>void run(pendingKind==='draft'?applyDraft:adopt)}>{pendingKind==='draft'?'恢复原草稿操作':'重试原采纳请求'}</Button>:null}</div></>:null}{previewTarget?createPortal(previewPlayer,previewTarget):previewPlayer}</section>:null}
  {error?<p role="status" className="whitespace-pre-wrap break-words text-sm text-text-muted">{error}</p>:null}
 </section>;
}
