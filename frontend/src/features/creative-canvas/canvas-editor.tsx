"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {ReactFlow,Background,Controls,MiniMap,addEdge,type Connection,type Edge,type Node,type NodeChange,type EdgeChange,type Viewport} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {CanvasDocument,CanvasNode,CreativeCanvasResource} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
import {copilotDeepLink} from "@/features/copilot/copilot-deeplink";
import {useAccountsChanged} from "@/lib/account-events";

type AssetOption={id:string;name:string;assetType:string;currentFileId:string};
type ProjectOption={id:string;title:string};
type LinkRow={id:string;nodeId:string;attemptId:string;taskId:string|null;mediaKind:"image"|"video";inputRevision:number;resultAssetId:string|null};
type TaskView={status:string;error:string|null;assetId:string|null;prompt:string|null;mode:string|null};
type ProposalRow={id:string;baseRevision:number;status:string;operations:Array<{type:string;operationId:string;[key:string]:unknown}>;expiresAt:string};
type Mode="text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";
type Capability={mode:Mode;available:boolean;model:string|null;reason:string|null};

function MediaPreview({assetId,type,canvasId,nodeId}:{assetId:string;type:"image"|"video";canvasId?:string;nodeId?:string}){
 const [url,setUrl]=useState("");
 useEffect(()=>{let live=true;const request=canvasId&&nodeId?client.getCanvasNodePreview({params:{canvasId,nodeId},query:undefined,body:undefined}):client.getDownloadUrl({params:{assetId},query:undefined,body:undefined});void request.then(response=>{if(live)setUrl(response.url);}).catch(()=>{if(live)setUrl("");});return()=>{live=false;};},[assetId,canvasId,nodeId]);
 if(!url)return <span className="text-xs text-muted-foreground">预览暂不可用</span>;
 return type==="image"?<img src={url} alt="画布素材" className="mt-2 max-h-28 w-full rounded object-contain"/>:<video src={url} className="mt-2 max-h-28 w-full rounded object-contain" muted controls/>;
}
function label(node:CanvasNode,canvasId:string,result?:{assetId:string;inputRevision:number}):ReactNode{
 const title=node.label||({text:"文字说明",image:"图片素材",video:"视频素材",image_generation:"图片生成",video_generation:"视频生成"} as const)[node.type];
 return <div className="min-w-44 max-w-60 text-left"><strong className="text-sm">{title}</strong>{node.type==="text"?<p className="mt-2 line-clamp-4 text-xs">{node.text}</p>:null}{node.type==="image"||node.type==="video"?<MediaPreview assetId={node.assetId} type={node.type} canvasId={canvasId} nodeId={node.id}/>:null}{node.type==="image_generation"||node.type==="video_generation"?<><p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{node.prompt||"在右侧填写生成描述"}</p>{result?<><MediaPreview assetId={result.assetId} type={node.type==="video_generation"?"video":"image"}/><p className="text-[10px] text-muted-foreground">结果来自画布版本 {result.inputRevision}</p></>:null}</>:null}</div>;
}
function toFlow(doc:CanvasDocument,canvasId:string,selectedId:string|null,results:Map<string,{assetId:string;inputRevision:number}>):Node[]{return doc.nodes.map(node=>({id:node.id,position:node.position,data:{label:label(node,canvasId,results.get(node.id))},selected:node.id===selectedId,style:{borderRadius:14,border:node.id===selectedId?"2px solid var(--primary)":"1px solid var(--border)",background:"var(--card)",color:"var(--foreground)",padding:12,minWidth:190}}));}
function errorText(error:unknown){return error instanceof Error?error.message:"操作失败，请重试";}

export function CanvasEditor({canvasId}:{canvasId:string}){
 const router=useRouter();
 const [canvas,setCanvas]=useState<CreativeCanvasResource|null>(null),[doc,setDoc]=useState<CanvasDocument|null>(null),[selectedId,setSelectedId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[saveState,setSaveState]=useState<"saved"|"dirty"|"saving"|"conflict">("saved");
 const [assets,setAssets]=useState<AssetOption[]>([]),[assetPage,setAssetPage]=useState(1),[assetsHasMore,setAssetsHasMore]=useState(false),[loadingAssets,setLoadingAssets]=useState(false),[projects,setProjects]=useState<ProjectOption[]>([]),[links,setLinks]=useState<LinkRow[]>([]),[taskViews,setTaskViews]=useState<Record<string,TaskView>>({});
 const [proposals,setProposals]=useState<ProposalRow[]>([]);
 const [capabilities,setCapabilities]=useState<Capability[]>([]);
 const [busyNode,setBusyNode]=useState<string|null>(null),[showAssets,setShowAssets]=useState(false);
 const docRef=useRef<CanvasDocument|null>(null),savedDocRef=useRef<CanvasDocument|null>(null),titleRef=useRef(""),savedTitleRef=useRef(""),projectIdRef=useRef<string|null>(null),savedProjectIdRef=useRef<string|null>(null),revisionRef=useRef(0),savePromiseRef=useRef<Promise<number>|null>(null),pollingRef=useRef(false),epochRef=useRef(0),attemptsRef=useRef(new Map<string,string>()),dragStartRef=useRef<CanvasDocument|null>(null);
 const [undo,setUndo]=useState<CanvasDocument[]>([]),[redo,setRedo]=useState<CanvasDocument[]>([]);
 const selected=doc?.nodes.find(node=>node.id===selectedId)??null;
 useAccountsChanged(useCallback(()=>{setCanvas(null);setDoc(null);setLoading(true);router.replace("/canvases");},[router]));
 const changeDoc=useCallback((next:CanvasDocument,record=true)=>{
  if(record&&docRef.current){setUndo(items=>[...items.slice(-29),docRef.current!]);setRedo([]);}
  docRef.current=next;setDoc(next);setSaveState("dirty");
 },[]);
 const refreshTasks=useCallback(async()=>{
  if(pollingRef.current)return;pollingRef.current=true;const epoch=epochRef.current;
  try{
   const response=await client.listCanvasNodeTasks({params:{canvasId},query:undefined,body:undefined});
   const rows=response as unknown as LinkRow[];if(epoch!==epochRef.current)return;setLinks(rows);
   const entries:Array<readonly [string,TaskView]>=[];
   const activeRows=rows.filter(row=>row.taskId).slice(0,40);
   for(let offset=0;offset<activeRows.length;offset+=8){
    const batch=await Promise.all(activeRows.slice(offset,offset+8).map(async row=>{
     const taskId=row.taskId!;
     try{const task=await client.getTask({params:{taskId},query:undefined,body:undefined});
      let assetId:string|null=row.resultAssetId;
      if(!assetId&&(task.status==="succeeded"||task.status==="awaiting_confirmation")){
       const results=await client.listTaskResults({params:{taskId},query:undefined,body:undefined});
       assetId=(results as unknown as Array<{assetId:string|null}>).find(result=>result.assetId)?.assetId??null;
      }
      const input=task.inputData as Record<string,unknown>;
      return [taskId,{status:task.status,error:task.errorMessage,assetId,prompt:typeof input.prompt==="string"?input.prompt:null,mode:typeof input.mode==="string"?input.mode:null}] as const;
     }catch(e){return [taskId,{status:"读取失败",error:errorText(e),assetId:row.resultAssetId,prompt:null,mode:null}] as const;}
    }));
    if(epoch!==epochRef.current)return;
    entries.push(...batch);
   }
   if(epoch===epochRef.current)setTaskViews(Object.fromEntries(entries));
  }catch(e){if(epoch===epochRef.current)setError(errorText(e));}finally{pollingRef.current=false;}
 },[canvasId]);
 const refreshProposals=useCallback(async()=>{const epoch=epochRef.current;try{const rows=await client.listCanvasProposals({params:{canvasId},query:undefined,body:undefined});if(epoch===epochRef.current)setProposals(rows as unknown as ProposalRow[]);}catch(e){if(epoch===epochRef.current)setError(errorText(e));}},[canvasId]);
 useEffect(()=>{let live=true;epochRef.current+=1;setLoading(true);setError("");
  void client.getCanvas({params:{canvasId},query:undefined,body:undefined}).then(response=>{if(!live)return;setCanvas(response);setDoc(response.document);docRef.current=response.document;savedDocRef.current=response.document;titleRef.current=response.title;savedTitleRef.current=response.title;projectIdRef.current=response.projectId;savedProjectIdRef.current=response.projectId;revisionRef.current=response.revision;setLoading(false);void refreshTasks();void refreshProposals();}).catch(e=>{if(live){setError(errorText(e));setLoading(false);}});
  void client.listAssets({params:undefined,query:{page:1,pageSize:100},body:undefined}).then(response=>{if(live){const rows=response as unknown as AssetOption[];setAssets(rows.filter(item=>item.assetType==="image"||item.assetType==="video").map(item=>({id:item.id,name:item.name,assetType:item.assetType,currentFileId:item.currentFileId})));setAssetPage(1);setAssetsHasMore(rows.length===100);}}).catch(e=>{if(live)setError(`素材列表读取失败：${errorText(e)}`);});
  void client.listProjects({params:undefined,query:{page:1,pageSize:100},body:undefined}).then(response=>{if(live)setProjects((response as unknown as ProjectOption[]).map(item=>({id:item.id,title:item.title})));}).catch(e=>{if(live)setError(`项目列表读取失败：${errorText(e)}`);});
  void client.getCanvasGenerationCapabilities({params:undefined,query:undefined,body:undefined}).then(response=>{if(live)setCapabilities(response.modes);}).catch(e=>{if(live)setError(`模型能力读取失败：${errorText(e)}`);});
  return()=>{live=false;epochRef.current+=1;};
 },[canvasId,refreshTasks,refreshProposals]);
 async function loadMoreAssets(){if(loadingAssets||!assetsHasMore)return;setLoadingAssets(true);try{const page=assetPage+1,response=await client.listAssets({params:undefined,query:{page,pageSize:100},body:undefined});const rows=response as unknown as AssetOption[];setAssets(items=>{const known=new Set(items.map(item=>item.id));return [...items,...rows.filter(item=>(item.assetType==="image"||item.assetType==="video")&&!known.has(item.id)).map(item=>({id:item.id,name:item.name,assetType:item.assetType,currentFileId:item.currentFileId}))];});setAssetPage(page);setAssetsHasMore(rows.length===100);}catch(e){setError(`素材列表读取失败：${errorText(e)}`);}finally{setLoadingAssets(false);}}
 useEffect(()=>{const onFocus=()=>void refreshProposals();window.addEventListener("focus",onFocus);return()=>window.removeEventListener("focus",onFocus);},[refreshProposals]);
 useEffect(()=>{if(!links.some(row=>row.taskId&&["queued","running"].includes(taskViews[row.taskId]?.status??"queued")))return;
  const timer=setInterval(()=>void refreshTasks(),5000);return()=>clearInterval(timer);
 },[links,taskViews,refreshTasks]);
 const saveNow=useCallback(()=>{
  if(savePromiseRef.current)return savePromiseRef.current;
  const run=async()=>{
   while(docRef.current&&(docRef.current!==savedDocRef.current||titleRef.current!==savedTitleRef.current||projectIdRef.current!==savedProjectIdRef.current)){
    const snapshot=docRef.current,titleSnapshot=titleRef.current,title=titleSnapshot.trim(),projectId=projectIdRef.current;
    if(!title){const message="请填写画布标题";setError(message);setSaveState("dirty");throw new Error(message);}
    setSaveState("saving");
    try{const response=await client.saveCanvas({params:{canvasId},query:undefined,body:{expectedRevision:revisionRef.current,document:snapshot,title,projectId}});
     revisionRef.current=response.revision;savedDocRef.current=snapshot;savedTitleRef.current=titleSnapshot;savedProjectIdRef.current=projectId;
     if(docRef.current===snapshot){docRef.current=response.document;savedDocRef.current=response.document;setDoc(response.document);}
     setCanvas({...response,title:titleRef.current,projectId:projectIdRef.current});setError("");
    }catch(e){const message=errorText(e);setError(message);setSaveState(message.includes("更新")||message.includes("409")?"conflict":"dirty");throw e;}
   }
   setSaveState("saved");return revisionRef.current;
  };
  const pending=run().finally(()=>{savePromiseRef.current=null;});
  savePromiseRef.current=pending;return pending;
 },[canvasId]);
 useEffect(()=>{if(saveState!=="dirty")return;const timer=setTimeout(()=>{void saveNow().catch(()=>{});},1200);return()=>clearTimeout(timer);},[doc,saveState,saveNow]);
 useEffect(()=>{const onBeforeUnload=(event:BeforeUnloadEvent)=>{if(saveState==="dirty"||saveState==="saving"||saveState==="conflict"){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",onBeforeUnload);return()=>window.removeEventListener("beforeunload",onBeforeUnload);},[saveState]);
 const latestResults=useMemo(()=>{const values=new Map<string,{assetId:string;inputRevision:number}>();for(const row of links){const assetId=row.resultAssetId??(row.taskId?taskViews[row.taskId]?.assetId:null);if(assetId&&!values.has(row.nodeId))values.set(row.nodeId,{assetId,inputRevision:row.inputRevision});}return values;},[links,taskViews]);
 const flowNodes=useMemo(()=>doc?toFlow(doc,canvasId,selectedId,latestResults):[],[doc,canvasId,selectedId,latestResults]);
 const flowEdges=useMemo<Edge[]>(()=>doc?.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,label:edge.label}))??[],[doc]);
 function addNode(type:CanvasNode["type"],asset?:AssetOption){if(!doc)return;
  const x=Math.round((180-doc.viewport.x)/doc.viewport.zoom),startY=Math.round((120-doc.viewport.y)/doc.viewport.zoom);
  let y=startY;
  while(doc.nodes.some(existing=>Math.abs(existing.position.x-x)<240&&Math.abs(existing.position.y-y)<180))y+=220;
  const common={id:crypto.randomUUID(),position:{x,y},label:""};
  const node:CanvasNode=type==="text"?{...common,type,text:""}:type==="image_generation"?{...common,type,prompt:"",mode:"text_to_image"}:type==="video_generation"?{...common,type,prompt:"",mode:"text_to_video",durationSec:6,resolution:"768P"}:asset?{...common,type:type as "image"|"video",assetId:asset.id,...(asset.currentFileId?{fileId:asset.currentFileId}:{})}:null as never;
  if(!node)return;changeDoc({...doc,nodes:[...doc.nodes,node]});setSelectedId(node.id);setShowAssets(false);
 }
 function updateNode(patch:Partial<CanvasNode>){if(!doc||!selectedId)return;changeDoc({...doc,nodes:doc.nodes.map(node=>node.id===selectedId?{...node,...patch} as CanvasNode:node)});}
 function removeSelected(){if(!doc||!selectedId)return;changeDoc({...doc,nodes:doc.nodes.filter(node=>node.id!==selectedId),edges:doc.edges.filter(edge=>edge.source!==selectedId&&edge.target!==selectedId)});setSelectedId(null);}
 function onNodesChange(changes:NodeChange[]){if(!docRef.current)return;const positions=new Map(changes.filter((change):change is Extract<NodeChange,{type:"position"}>=>change.type==="position"&&Boolean(change.position)).map(change=>[change.id,change.position!]));if(!positions.size)return;const current=docRef.current;if(!current.nodes.some(node=>{const next=positions.get(node.id);return next&&(next.x!==node.position.x||next.y!==node.position.y);}))return;changeDoc({...current,nodes:current.nodes.map(node=>positions.has(node.id)?{...node,position:positions.get(node.id)!}:node)},false);}
 function onNodeDragStop(){const before=dragStartRef.current;dragStartRef.current=null;if(before&&docRef.current&&before.nodes.some(node=>{const next=docRef.current!.nodes.find(item=>item.id===node.id);return next&&(next.position.x!==node.position.x||next.position.y!==node.position.y);})) {setUndo(items=>[...items.slice(-29),before]);setRedo([]);}}
 function onEdgesChange(changes:EdgeChange[]){const removed=new Set(changes.filter(change=>change.type==="remove").map(change=>change.id));if(!doc||!removed.size)return;changeDoc({...doc,edges:doc.edges.filter(edge=>!removed.has(edge.id))});}
 function onConnect(connection:Connection){if(!doc||!connection.source||!connection.target)return;const edges=addEdge({...connection,id:crypto.randomUUID()},flowEdges);changeDoc({...doc,edges:edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,...(typeof edge.label==="string"?{label:edge.label}:{})}))});}
 function onMoveEnd(_event:MouseEvent|TouchEvent|null,viewport:Viewport){const current=docRef.current;if(current&&(current.viewport.x!==viewport.x||current.viewport.y!==viewport.y||current.viewport.zoom!==viewport.zoom))changeDoc({...current,viewport},false);}
 function timeTravel(direction:"undo"|"redo"){const source=direction==="undo"?undo:redo,target=direction==="undo"?setRedo:setUndo,setSource=direction==="undo"?setUndo:setRedo;if(!source.length||!docRef.current)return;const previous=source[source.length-1]!;target(items=>[...items,docRef.current!]);setSource(items=>items.slice(0,-1));changeDoc(previous,false);}
 async function generate(){if(!selected||!canvas||(selected.type!=="image_generation"&&selected.type!=="video_generation")||busyNode)return;setBusyNode(selected.id);setError("");
  try{const revision=await saveNow();const attemptId=attemptsRef.current.get(selected.id)??crypto.randomUUID();attemptsRef.current.set(selected.id,attemptId);
   await client.generateCanvasNode({params:{canvasId,nodeId:selected.id},query:undefined,body:{expectedRevision:revision,attemptId}});attemptsRef.current.delete(selected.id);await refreshTasks();
  }catch(e){setError(errorText(e));await refreshTasks();}finally{setBusyNode(null);}
 }
 async function resumeSubmission(row:LinkRow){if(busyNode)return;setBusyNode(row.nodeId);setError("");try{await client.generateCanvasNode({params:{canvasId,nodeId:row.nodeId},query:undefined,body:{expectedRevision:row.inputRevision,attemptId:row.attemptId}});await refreshTasks();}catch(e){setError(errorText(e));}finally{setBusyNode(null);}}
 async function keepResult(taskId:string,assetId:string,attachProject=false){setError("");try{await client.confirmTask({params:{taskId},query:undefined,body:undefined});if(attachProject&&canvas?.projectId)await client.createMaterialLink({params:undefined,query:undefined,body:{projectId:canvas.projectId,entityType:"asset",entityId:assetId,addedByType:"user"}});await refreshTasks();}catch(e){setError(errorText(e));}}
 async function downloadResult(assetId:string){setError("");try{const result=await client.getDownloadUrl({params:{assetId},query:undefined,body:undefined});const anchor=document.createElement("a");anchor.href=result.url;anchor.download=result.fileName;document.body.appendChild(anchor);anchor.click();anchor.remove();}catch(e){setError(errorText(e));}}
 async function archive(){if(!confirm("归档这张画布？已生成或加入项目的素材会保留。"))return;try{await saveNow();await client.archiveCanvas({params:{canvasId},query:undefined,body:undefined});router.push("/canvases");}catch(e){setError(errorText(e));}}
 async function applyProposal(proposalId:string){if(saveState!=="saved")return;setError("");try{const updated=await client.applyCanvasProposal({params:{canvasId,proposalId},query:undefined,body:{expectedRevision:revisionRef.current}});setCanvas(updated);setDoc(updated.document);docRef.current=updated.document;revisionRef.current=updated.revision;setSelectedId(null);setUndo([]);setRedo([]);setSaveState("saved");await refreshProposals();}catch(e){setError(errorText(e));}}
 function renderHistoryRow(row:LinkRow){
  const task=row.taskId?taskViews[row.taskId]:null;
  const assetId=task?.assetId??row.resultAssetId;
  const source=doc?.nodes.find(node=>node.id===row.nodeId);
  const modeName=({text_to_image:"文生图",image_to_image:"参考图生图",text_to_video:"文生视频",image_to_video:"首帧图生视频"} as Record<string,string>)[task?.mode??""];
  return <div key={row.id} className="rounded-lg border p-3">
   <p className="font-medium">{source?.label||"已删除的节点"}</p>
   <p className="text-xs text-muted-foreground">{task?.status??(row.taskId?"状态读取中":"提交中")} · 画布版本 {row.inputRevision}{modeName?` · ${modeName}`:""}</p>
   {row.taskId?<p className="break-all text-[10px] text-muted-foreground">任务 ID：{row.taskId}</p>:<button type="button" disabled={Boolean(busyNode)} onClick={()=>void resumeSubmission(row)} className="mt-1 text-xs underline disabled:opacity-50">继续提交原任务</button>}
   {task?.prompt?<p className="mt-1 line-clamp-3 text-xs">{task.prompt}</p>:null}
   {task?.error?<p className="text-xs text-destructive">{task.error}</p>:null}
   {assetId?<div className="mt-2 space-y-2">
    <MediaPreview assetId={assetId} type={row.mediaKind}/>
    {task?.status==="succeeded"?<p className="text-xs text-muted-foreground">已保留到素材库</p>:<button type="button" onClick={()=>void keepResult(row.taskId!,assetId)} className="block text-xs underline">保留到素材库</button>}
    <button type="button" onClick={()=>void downloadResult(assetId)} className="block text-xs underline">下载结果</button>
    {canvas?.projectId&&projects.some(item=>item.id===canvas.projectId)?<button type="button" onClick={()=>void keepResult(row.taskId!,assetId,true)} className="block text-xs underline">加入关联项目用料</button>:null}
    <button type="button" onClick={()=>addNode(row.mediaKind,{id:assetId,name:"生成结果",assetType:row.mediaKind,currentFileId:""})} className="block text-xs underline">插入画布</button>
   </div>:null}
  </div>;
 }
 if(loading)return <div className="p-6" role="status">正在打开画布…</div>;
 if(!canvas||!doc)return <div className="p-6" role="alert">{error||"画布不可用"}<Link href="/canvases" className="ml-3 underline">返回画布库</Link></div>;
 return <main className="flex h-full min-h-0 flex-col bg-background">
  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><Link href="/canvases" className="mr-2 text-sm text-muted-foreground hover:underline">← 画布库</Link><input aria-label="画布标题" value={canvas.title} onChange={event=>{titleRef.current=event.target.value;setCanvas({...canvas,title:event.target.value});setSaveState("dirty");}} onBlur={()=>{void saveNow().catch(()=>{});}} className="min-w-40 rounded border bg-transparent px-2 py-1 font-medium"/><span className="text-xs text-muted-foreground">{saveState==="saving"?"保存中…":saveState==="saved"?"已保存":saveState==="conflict"?"版本冲突":"待保存"}</span><button type="button" onClick={()=>void saveNow().catch(()=>{})} className="rounded border px-3 py-1 text-sm">保存</button><button type="button" onClick={()=>timeTravel("undo")} disabled={!undo.length} className="rounded border px-2 py-1 text-sm disabled:opacity-40">撤销</button><button type="button" onClick={()=>timeTravel("redo")} disabled={!redo.length} className="rounded border px-2 py-1 text-sm disabled:opacity-40">重做</button><button type="button" onClick={()=>void archive()} className="ml-auto rounded border px-3 py-1 text-sm">归档</button></div>
  <div className="flex items-center gap-3 border-b px-4 py-2 text-xs"><label htmlFor="canvas-project" className="text-muted-foreground">关联项目（可选）</label><select id="canvas-project" value={canvas.projectId??""} onChange={event=>{const projectId=event.target.value||null;projectIdRef.current=projectId;setCanvas({...canvas,projectId});setSaveState("dirty");}} className="min-w-48 rounded border bg-background px-2 py-1"><option value="">不关联项目</option>{projects.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
  {error?<div role="alert" className="border-b border-destructive px-4 py-2 text-sm text-destructive">{error}{saveState==="conflict"?<button type="button" className="ml-3 underline" onClick={()=>location.reload()}>重新载入</button>:null}</div>:null}
  <div className="flex min-h-0 flex-1 flex-col xl:flex-row"><aside className="max-h-44 w-full shrink-0 space-y-2 overflow-y-auto border-b p-3 text-sm xl:max-h-none xl:w-48 xl:border-b-0 xl:border-r"><p className="font-medium">添加节点</p><button type="button" onClick={()=>addNode("text")} className="block w-full rounded border px-2 py-2 text-left">文字说明</button><button type="button" onClick={()=>addNode("image_generation")} className="block w-full rounded border px-2 py-2 text-left">图片生成</button><button type="button" onClick={()=>addNode("video_generation")} className="block w-full rounded border px-2 py-2 text-left">视频生成</button><button type="button" onClick={()=>setShowAssets(!showAssets)} className="block w-full rounded border px-2 py-2 text-left">从素材库插入</button>{showAssets?<div className="max-h-60 space-y-1 overflow-y-auto">{assets.length?assets.map(asset=><button key={asset.id} type="button" onClick={()=>addNode(asset.assetType as "image"|"video",asset)} className="block w-full truncate rounded px-2 py-1 text-left hover:bg-muted">{asset.assetType==="image"?"图":"视频"} · {asset.name}</button>):<p className="text-xs text-muted-foreground">当前页暂无图片或视频素材</p>}{assetsHasMore?<button type="button" disabled={loadingAssets} onClick={()=>void loadMoreAssets()} className="block w-full rounded border px-2 py-1 text-xs disabled:opacity-50">{loadingAssets?"读取中…":"加载更多素材"}</button>:null}</div>:null}</aside>
   <div className="min-h-[50vh] min-w-0 flex-1 xl:min-h-0"><ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onNodeDragStart={()=>{dragStartRef.current=docRef.current;}} onNodeDragStop={onNodeDragStop} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_,node)=>setSelectedId(node.id)} onPaneClick={()=>setSelectedId(null)} onMoveEnd={onMoveEnd} defaultViewport={doc.viewport} minZoom={0.05} maxZoom={4} deleteKeyCode={null}><Background/><Controls/><MiniMap pannable zoomable/></ReactFlow></div>
   <aside className="max-h-[45vh] w-full shrink-0 space-y-4 overflow-y-auto border-t p-4 text-sm xl:max-h-none xl:w-80 xl:border-l xl:border-t-0"><h2 className="font-semibold">节点设置</h2>{selected?<><label className="block">名称<input value={selected.label} onChange={event=>updateNode({label:event.target.value})} className="mt-1 w-full rounded border bg-background p-2"/></label>{selected.type==="text"?<label className="block">内容<textarea value={selected.text} onChange={event=>updateNode({text:event.target.value} as Partial<CanvasNode>)} rows={7} className="mt-1 w-full rounded border bg-background p-2"/></label>:null}{selected.type==="image_generation"||selected.type==="video_generation"?<><label className="block">生成描述<textarea value={selected.prompt} onChange={event=>updateNode({prompt:event.target.value} as Partial<CanvasNode>)} rows={7} className="mt-1 w-full rounded border bg-background p-2"/></label><label className="block">模式<select value={selected.mode} onChange={event=>updateNode({mode:event.target.value as typeof selected.mode,referenceAssetId:undefined,aspectRatio:undefined} as Partial<CanvasNode>)} className="mt-1 w-full rounded border bg-background p-2">{selected.type==="image_generation"?<><option value="text_to_image">文生图</option><option value="image_to_image">参考图生图</option></>:<><option value="text_to_video">文生视频</option><option value="image_to_video">首帧图生视频</option></>}</select></label>{selected.mode.startsWith("image_to_")?<label className="block">参考图片<select value={selected.referenceAssetId??""} onChange={event=>updateNode({referenceAssetId:event.target.value||undefined} as Partial<CanvasNode>)} className="mt-1 w-full rounded border bg-background p-2"><option value="">请选择当前账号图片</option>{assets.filter(asset=>asset.assetType==="image").map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>:null}{selected.mode==="image_to_video"?<p className="text-xs text-muted-foreground">首帧图决定画幅，无需手动选择。</p>:<label className="block">画幅<select value={selected.aspectRatio??""} onChange={event=>updateNode({aspectRatio:event.target.value||undefined} as Partial<CanvasNode>)} className="mt-1 w-full rounded border bg-background p-2"><option value="">模型默认</option>{["16:9","9:16","1:1","4:3","3:4","21:9"].map(ratio=><option key={ratio} value={ratio}>{ratio}</option>)}</select></label>}{selected.type==="video_generation"?<label className="block">分辨率<select value={selected.resolution??"768P"} onChange={event=>updateNode({resolution:event.target.value as "768P"|"2K"} as Partial<CanvasNode>)} className="mt-1 w-full rounded border bg-background p-2"><option value="768P">768P</option>{capabilities.find(item=>item.mode===selected.mode)?.model?.toLowerCase()==="minimax-h3"?<option value="2K">2K</option>:null}</select></label>:null}{selected.type==="video_generation"?<label className="block">时长（秒）<input type="number" min={4} max={15} value={selected.durationSec??6} onChange={event=>updateNode({durationSec:Number(event.target.value)} as Partial<CanvasNode>)} className="mt-1 w-full rounded border bg-background p-2"/></label>:null}{(()=>{const capability=capabilities.find(item=>item.mode===selected.mode);return <p className="text-xs text-muted-foreground">{capability?.available?`当前模型：${capability.model}`:capability?.reason??"正在读取模型能力…"}</p>;})()}<button type="button" disabled={Boolean(busyNode)||saveState==="conflict"||!selected.prompt.trim()||(selected.mode.startsWith("image_to_")&&!selected.referenceAssetId)||capabilities.find(item=>item.mode===selected.mode)?.available!==true} onClick={()=>void generate()} className="w-full rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{busyNode===selected.id?"正在提交…":"生成"}</button></>:null}<button type="button" onClick={removeSelected} className="rounded border px-3 py-1 text-destructive">删除节点</button></>:<p className="text-muted-foreground">选择节点后可编辑。拖拽节点连接点可建立关系。</p>}
    <div className="border-t pt-4"><div className="flex items-center justify-between"><h2 className="font-semibold">编导建议</h2><button type="button" onClick={()=>void refreshProposals()} className="text-xs underline">刷新</button></div><Link href={copilotDeepLink("canvas",undefined,{kind:"canvas",id:canvasId,title:canvas.title},"请先读取当前画布，再提出我可以逐项审核的画布修改建议。",`surface:canvas:${canvasId}`)} className="mt-2 block rounded border px-3 py-2 text-center">和编导讨论这张画布</Link>{proposals.filter(item=>item.status==="pending").map(item=><div key={item.id} className="mt-3 rounded border p-3"><p>{item.operations.length} 项建议 · 基于版本 {item.baseRevision}</p><ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">{item.operations.map(op=><li key={op.operationId}><details><summary className="cursor-pointer">{({addNode:"新增节点",updateNode:"修改节点",moveNode:"移动节点",deleteNode:"删除节点",connect:"建立连接",disconnect:"移除连接"} as Record<string,string>)[op.type]??op.type}</summary><pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(op,null,2)}</pre></details></li>)}</ul><button type="button" disabled={saveState!=="saved"||item.baseRevision!==revisionRef.current} onClick={()=>void applyProposal(item.id)} className="mt-2 rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">应用到画布</button>{item.baseRevision!==revisionRef.current?<p className="mt-1 text-xs text-muted-foreground">画布已更新，请让编导重新读取后提出建议。</p>:null}</div>)}</div>
    <div className="border-t pt-4"><h2 className="font-semibold">生成历史</h2>{links.length===0?<p className="mt-2 text-muted-foreground">暂无生成任务</p>:<div className="mt-2 space-y-3">{links.map(renderHistoryRow)}</div>}</div>
   </aside></div>
 </main>;
}
