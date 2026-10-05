"use client";
import * as React from "react";
import {Timeline,type TimelineState} from "@xzdarcy/react-timeline-editor";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import type {ProductionEditorDocument,ProductionEditorVersion,ProductionEditorRenderRequest,ProductionEditorPreview} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
import {ExecutionTaskCard} from "@/features/copilot/execution-task-card";
import {FinalVideoPreview} from "./production-media-previews";
import {ProductionEditorFields} from "./production-editor-fields";
import {listDraftItems,moveDraftItem,patchDraftItem,removeDraftItem,type DraftPlan} from "./production-editor-draft";
import {withPreviewBridge,validPreviewMessage} from "./production-preview-bridge";

type TimelineRow=React.ComponentProps<typeof Timeline>["editorData"][number];
const button="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40";
const requestId=()=>crypto.randomUUID();
const signature=(p:unknown)=>JSON.stringify(p);
export function ProductionVisualEditor({initial,onPrepare}:{initial:ProductionEditorDocument;onPrepare:()=>void}) {
  const [documentState,setDocument]=React.useState(initial),[draft,setDraft]=React.useState(initial.plan as DraftPlan),[selected,setSelected]=React.useState<string|null>(null);
  const [past,setPast]=React.useState<DraftPlan[]>([]),[future,setFuture]=React.useState<DraftPlan[]>([]),[error,setError]=React.useState<string|null>(null),[busy,setBusy]=React.useState(false);
  const [preview,setPreview]=React.useState<{data:ProductionEditorPreview;channel:string}|null>(null),[previewError,setPreviewError]=React.useState<string|null>(null),[previewEpoch,setPreviewEpoch]=React.useState(0);
  const [ready,setReady]=React.useState(false),[playing,setPlaying]=React.useState(false),[time,setTime]=React.useState(0),[zoom,setZoom]=React.useState(80),[paramsOpen,setParamsOpen]=React.useState(true);
  const [materials,setMaterials]=React.useState<Array<{id:string;name:string;assetType:string}>>([]),[materialError,setMaterialError]=React.useState<string|null>(null),[materialEpoch,setMaterialEpoch]=React.useState(0),[insertAsset,setInsertAsset]=React.useState("");
  const [history,setHistory]=React.useState<Array<Omit<ProductionEditorVersion,"plan">>>([]),[historyTotal,setHistoryTotal]=React.useState(0),[historyOpen,setHistoryOpen]=React.useState(false),[historical,setHistorical]=React.useState<ProductionEditorVersion|null>(null),[historyOffset,setHistoryOffset]=React.useState(0);
  const [renders,setRenders]=React.useState<ProductionEditorRenderRequest[]>([]),[renderTask,setRenderTask]=React.useState<string|null>(null),[renderEpoch,setRenderEpoch]=React.useState(0);
  const frame=React.useRef<HTMLIFrameElement>(null),timeline=React.useRef<TimelineState>(null),stage=React.useRef<HTMLDivElement>(null),[stageWidth,setStageWidth]=React.useState(640);
  const desired=React.useRef({time:0,playing:false}),commands=React.useRef(0),active=React.useRef(true),draftRef=React.useRef(draft),command=React.useRef<{kind:"save"|"restore"|"render";requestId:string;body:unknown}|null>(null);
  const duration=draft.renderProps.talkingHead.durationSec,dirty=signature(draft)!==signature(documentState.plan),items=React.useMemo(()=>listDraftItems(draft),[draft]),selection=items.find(i=>i.id===selected);
  React.useLayoutEffect(()=>{draftRef.current=draft;},[draft]);
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  React.useEffect(()=>{const target=stage.current;if(!target)return;const observer=new ResizeObserver(entries=>setStageWidth(entries[0]?.contentRect.width??640));observer.observe(target);return()=>observer.disconnect();},[]);
  const edit=(next:DraftPlan)=>{if(signature(next)===signature(draftRef.current))return;setPast(p=>[...p,draftRef.current].slice(-100));setFuture([]);setDraft(next);setError(null);};
  const runEdit=(f:()=>DraftPlan)=>{try{edit(f());}catch(e){setError(e instanceof Error?e.message:"修改未完成，输入已保留");}};
  const send=React.useCallback((type:"seek"|"play"|"pause",seconds?:number)=>{if(!preview||!frame.current?.contentWindow)return;frame.current.contentWindow.postMessage({channelId:preview.channel,commandId:++commands.current,type,...(seconds===undefined?{}:{time:seconds})},"*");},[preview]);
  const seek=(seconds:number)=>{desired.current={time:seconds,playing:false};setPlaying(false);if(ready)send("seek",seconds);};
  React.useEffect(()=>{
    let cancelled=false;const timer=setTimeout(()=>{
      setPreviewError(null);
      void client.previewProductionEditor({params:{outputId:documentState.outputId},query:undefined,body:{expectedRevision:documentState.revision,requestId:requestId(),plan:draft}}).then(data=>{
        if(cancelled)return;setReady(false);setPlaying(false);commands.current=0;setPreview({data,channel:requestId()});
      }).catch(e=>{if(!cancelled)setPreviewError(e instanceof Error?e.message:"预览读取失败，请重试");});
    },300);return()=>{cancelled=true;clearTimeout(timer);};
  },[draft,documentState.outputId,documentState.revision,previewEpoch]);
  React.useEffect(()=>{
    if(!preview)return;let live=true,isReady=false;commands.current=0;
    const timeout=setTimeout(()=>{if(live&&!isReady)setPreviewError("预览准备超时，草稿仍可保存。请重试预览。");},15000);
    const receive=(event:MessageEvent)=>{
      if(!live || !validPreviewMessage(event,frame.current?.contentWindow,preview.channel,commands.current,preview.data.durationSec))return;
      const d=event.data;
      if(d.type==="ready"){isReady=true;clearTimeout(timeout);setReady(true);send("seek",Math.min(desired.current.time,preview.data.durationSec));if(desired.current.playing)send("play");}
      else if(d.type==="time"&&isReady){setTime(d.time!);desired.current.time=d.time!;timeline.current?.setTime(d.time!);}
      else if(d.type==="state"){setPlaying(d.state==="playing");if(d.state==="error"||d.state==="blocked"){desired.current.playing=false;setPreviewError(d.message??"预览暂不可播放，请重试");}}
    };
    window.addEventListener("message",receive);return()=>{live=false;clearTimeout(timeout);window.removeEventListener("message",receive);};
  },[preview,send]);
  React.useEffect(()=>{let cancelled=false;void(async()=>{
    await Promise.resolve();if(cancelled)return;setMaterialError(null);
    const collected:Array<{id:string;name:string;assetType:string}>=[],seen=new Set<string>();
    for(let page=1;;page++){
      const links=(await client.listMaterialLinks({params:undefined,body:undefined,query:{projectId:documentState.projectId,page,pageSize:100}})) as unknown as Array<{entityType:string;entityId:string}>;
      if(cancelled)return;
      for(const link of links)if(link.entityType==="asset"&&!seen.has(link.entityId)){seen.add(link.entityId);const asset=await client.getAsset({params:{assetId:link.entityId},body:undefined,query:undefined});if(cancelled)return;if(asset.status==="active"&&["image","video"].includes(asset.assetType))collected.push({id:asset.id,name:asset.name,assetType:asset.assetType});}
      if(links.length<100)break;
    }
    if(!cancelled)setMaterials(collected);
  })().catch(e=>{if(!cancelled)setMaterialError(e instanceof Error?e.message:"项目素材读取失败");});return()=>{cancelled=true;};},[documentState.projectId,materialEpoch]);
  React.useEffect(()=>{if(!historyOpen)return;let cancelled=false;void client.listProductionEditorVersions({params:{outputId:documentState.outputId},body:undefined,query:{limit:20,offset:historyOffset}}).then(result=>{if(cancelled)return;setHistory(result.items);setHistoryTotal(result.total);}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[historyOpen,historyOffset,documentState.outputId,documentState.revision]);
  React.useEffect(()=>{let cancelled=false;void client.listProductionEditorRenders({params:{outputId:documentState.outputId},body:undefined,query:{limit:20,offset:0}}).then(result=>{if(!cancelled)setRenders(result.items);}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[documentState.outputId,renderEpoch]);
  const acceptVersion=(version:ProductionEditorVersion,submitted?:DraftPlan)=>{setDocument(prev=>({...prev,revision:version.revision,plan:version.plan,state:"editable"}));if(!submitted||signature(draftRef.current)===signature(submitted)){setDraft(version.plan as DraftPlan);setPast([]);setFuture([]);}setHistorical(null);};
  const save=async()=>{
    if(busy)return;setBusy(true);setError(null);const submitted=draftRef.current;
    const pending=command.current?.kind==="save"?command.current:{kind:"save" as const,requestId:requestId(),body:{expectedRevision:documentState.revision,plan:submitted,source:"manual" as const}};command.current=pending;
    try{
      const receipt=await client.getProductionEditorReceipt({params:{outputId:documentState.outputId,requestId:pending.requestId},body:undefined,query:undefined});
      const version=receipt??await client.saveProductionEditor({params:{outputId:documentState.outputId},query:undefined,body:{...(pending.body as {expectedRevision:number;plan:Record<string,unknown>;source:"manual"}),requestId:pending.requestId}});
      if(active.current){acceptVersion(version,(pending.body as {plan:DraftPlan}).plan);command.current=null;}
    }catch(e){if(active.current)setError(`${e instanceof Error?e.message:String(e)}。草稿已保留，重试会先查原回执。`);}finally{if(active.current)setBusy(false);}
  };
  const restore=async()=>{
    if(!historical||busy)return;setBusy(true);const pending=command.current?.kind==="restore"?command.current:{kind:"restore" as const,requestId:requestId(),body:{expectedRevision:documentState.revision,sourceRevision:historical.revision}};command.current=pending;
    try{const receipt=await client.getProductionEditorReceipt({params:{outputId:documentState.outputId,requestId:pending.requestId},body:undefined,query:undefined});const version=receipt??await client.restoreProductionEditor({params:{outputId:documentState.outputId},query:undefined,body:{...(pending.body as {expectedRevision:number;sourceRevision:number}),requestId:pending.requestId}});if(active.current){acceptVersion(version);command.current=null;}}
    catch(e){if(active.current)setError(`${String(e)}。本地草稿已保留，请查回执后重试。`);}finally{if(active.current)setBusy(false);}
  };
  const render=async()=>{
    if(busy||dirty)return;setBusy(true);const pending=command.current?.kind==="render"?command.current:{kind:"render" as const,requestId:requestId(),body:{revision:documentState.revision}};command.current=pending;
    try{const result=await client.renderProductionEditor({params:{outputId:documentState.outputId},query:undefined,body:{...(pending.body as {revision:number}),requestId:pending.requestId}});if(active.current){setRenderTask(result.taskId);setRenderEpoch(e=>e+1);command.current=null;}}
    catch(e){if(active.current)setError(`${String(e)}。重试沿用此次生成请求，不会重复创建任务。`);}finally{if(active.current)setBusy(false);}
  };
  const rows:TimelineRow[]=[{id:"master",actions:[{id:"master",start:0,end:duration,effectId:"master",movable:false,flexible:false}]},...["caption","card","broll"].map(kind=>({id:kind,actions:items.filter(i=>i.kind===kind).map(i=>({id:i.id,start:i.start,end:i.end,effectId:kind,movable:true,flexible:kind!=="card",selected:i.id===selected}))}))];
  const effects={master:{id:"master",name:"口播源（只读）"},caption:{id:"caption",name:"字幕"},card:{id:"card",name:"卡片"},broll:{id:"broll",name:"素材"}};
  const width=draft.renderProps.delivery.width,height=draft.renderProps.delivery.height,scale=Math.min(stageWidth/width,280/height);
  return <section className="grid gap-3" aria-label="可视视频制作工作台">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">可视剪辑</h2><p className="text-xs text-muted-foreground">版本 {documentState.revision} · {dirty?"有未保存修改":"已保存"} · {duration.toFixed(1)} 秒</p></div><div className="flex flex-wrap gap-2"><button className={button} onClick={onPrepare} disabled={busy||dirty}>备料与成品</button><button className={button} disabled={busy||!past.length} onClick={()=>{const p=past.at(-1)!;setFuture(f=>[draftRef.current,...f]);setPast(past.slice(0,-1));setDraft(p);}}>撤销</button><button className={button} disabled={busy||!future.length} onClick={()=>{setPast(p=>[...p,draftRef.current]);setDraft(future[0]!);setFuture(future.slice(1));}}>重做</button><button className={button} onClick={()=>setHistoryOpen(v=>!v)}>版本历史</button><button className={button} disabled={busy||!dirty} onClick={()=>void save()}>保存版本</button><button className={`${button} bg-primary text-primary-foreground`} disabled={busy||dirty} onClick={()=>void render()}>生成这版视频</button></div></header>
    {error?<div role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}<button className={`${button} ml-2`} disabled={busy} onClick={()=>void(command.current?.kind==="render"?render():command.current?.kind==="restore"?restore():save())}>恢复原请求</button></div>:null}
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="min-w-0"><div ref={stage} className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg bg-zinc-950" style={{height:Math.max(180,height*scale)}}>{preview?<iframe key={preview.channel} ref={frame} title="当前剪辑预览" sandbox="allow-scripts" allow="autoplay" srcDoc={withPreviewBridge(preview.data.html,preview.channel,preview.data.durationSec)} style={{width,height,transform:`scale(${scale})`,transformOrigin:"center",flexShrink:0,border:0}}/>:<p className="text-sm text-zinc-300">正在准备真实素材预览…</p>}</div><div className="mt-2 flex flex-wrap items-center gap-2"><button className={button} disabled={!ready} onClick={()=>{desired.current.playing=!playing;send(playing?"pause":"play");}}>{playing?"暂停":"播放"}</button><span className="text-xs tabular-nums">{time.toFixed(2)} / {duration.toFixed(2)}</span><input aria-label="定位预览时间" type="range" min={0} max={duration} step={.05} value={time} onChange={e=>seek(Number(e.target.value))} className="min-w-20 flex-1"/><span className="text-xs text-muted-foreground">{ready?"预览已就绪":"准备素材"}</span><button className={button} onClick={()=>setParamsOpen(v=>!v)}>{paramsOpen?"收起参数":"片段参数"}</button></div>{previewError?<p role="alert" className="mt-2 text-sm">{previewError} <button className={button} onClick={()=>setPreviewEpoch(e=>e+1)}>重试预览</button></p>:null}{preview?.data.warnings.length?<details className="mt-2 text-xs"><summary>兼容说明（{preview.data.warnings.length}）</summary>{preview.data.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>:null}</div>
      {paramsOpen?<fieldset disabled={busy} className="max-h-[320px] overflow-auto rounded-md border p-3">{selection?<ProductionEditorFields plan={draft} item={selection} materials={materials} patch={patch=>runEdit(()=>patchDraftItem(draftRef.current,selection.id,patch))} remove={()=>runEdit(()=>removeDraftItem(draftRef.current,selection.id))} onSceneTitle={(id,title)=>runEdit(()=>{const p=structuredClone(draftRef.current);p.renderProps.scenes.find(s=>s.id===id)!.title=title;return p;})}/>:<p className="text-sm text-muted-foreground">点击时间轴上的字幕、卡片或素材，查看并修改。口播源与分场边界在备料中配置。</p>}</fieldset>:null}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs"><label>时间轴缩放 <input aria-label="时间轴缩放" type="range" min={30} max={180} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><span>口播 ／ 字幕 ／ 卡片 ／ 素材</span><select aria-label="插入项目素材" className="max-w-48 rounded-md border p-1.5" value={insertAsset} onChange={e=>setInsertAsset(e.target.value)}><option value="">选择项目素材</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button className={button} disabled={!insertAsset||busy} onClick={()=>runEdit(()=>{const p=structuredClone(draftRef.current),m=materials.find(m=>m.id===insertAsset)!;p.renderProps.broll.push({id:requestId(),file:m.id,label:m.name,at:Math.min(time,Math.max(0,duration-.1)),durationSec:Math.min(3,duration-Math.min(time,Math.max(0,duration-.1))),motion:"static",big:false});return p;})}>添加到播放头</button><a className="underline" href={`/projects/${encodeURIComponent(documentState.projectId)}/materials`}>添加项目素材</a>{materialError?<span role="alert">{materialError}<button className={button} onClick={()=>setMaterialEpoch(e=>e+1)}>重试素材读取</button></span>:null}</div>
    <div className="min-w-0 overflow-hidden rounded-md border" style={{height:230}}><Timeline ref={timeline} editorData={rows} effects={effects} autoScroll={false} disableDrag={busy} scale={5} scaleWidth={zoom} startLeft={20} minScaleCount={Math.ceil(duration/5)+1} maxScaleCount={Math.ceil(duration/5)+1} rowHeight={44} style={{width:"100%",height:"230px"}} gridSnap dragLine onClickActionOnly={(_e,{action,time:at})=>{if(action.id!=="master")setSelected(action.id);seek(Math.max(0,Math.min(duration,at)));}} onActionMoveStart={({action})=>setSelected(action.id)} onActionResizeStart={({action})=>setSelected(action.id)} onClickTimeArea={at=>{seek(Math.max(0,Math.min(duration,at)));return false;}} onCursorDragEnd={at=>seek(Math.max(0,Math.min(duration,at)))} onActionMoveEnd={({action,start,end})=>{const item=items.find(i=>i.id===action.id);if(item)runEdit(()=>moveDraftItem(draftRef.current,item,start,end));}} onActionResizeEnd={({action,start,end})=>{const item=items.find(i=>i.id===action.id);if(item)runEdit(()=>moveDraftItem(draftRef.current,item,start,end));}} getActionRender={action=><div className={`h-full truncate rounded px-2 py-2 text-xs ${action.id===selected?"ring-2 ring-primary":""}`} style={{background:action.effectId==="caption"?"#385f79":action.effectId==="card"?"#795580":action.effectId==="broll"?"#386a55":"#475569",color:"white"}}>{action.id==="master"?"口播源 · 只读":items.find(i=>i.id===action.id)?.label}</div>}/></div>
    {historyOpen?<div className="rounded-md border p-3"><div className="flex flex-wrap gap-2">{history.map(v=><button key={v.revision} className={button} disabled={busy} onClick={()=>void client.getProductionEditorVersion({params:{outputId:documentState.outputId,revision:v.revision},query:undefined,body:undefined}).then(v=>{if(active.current)setHistorical(v);}).catch(e=>setError(String(e)))}>版本 {v.revision} · {v.source}</button>)}<button className={button} disabled={historyOffset===0} onClick={()=>setHistoryOffset(n=>Math.max(0,n-20))}>上一页</button><button className={button} disabled={historyOffset+20>=historyTotal} onClick={()=>setHistoryOffset(n=>n+20)}>下一页</button></div>{historical?<div className="mt-3"><p className="text-sm">查看版本 {historical.revision}，当前版本未改变。{dirty?"恢复会替换未保存草稿，请核对下方差异后明确选择。":"恢复后会保存为新版本。"}</p><div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto text-xs"><pre>{JSON.stringify(draft.renderProps,null,2)}</pre><pre>{JSON.stringify(historical.plan.renderProps,null,2)}</pre></div><button className={button} disabled={busy} onClick={()=>void restore()}>{dirty?"放弃本地草稿，恢复为新版本":"恢复为新版本"}</button><button className={button} onClick={()=>setHistorical(null)}>保留当前草稿</button></div>:null}</div>:null}
    <details className="rounded-md border p-3"><summary className="text-sm">生成记录（最近 {renders.length} 次）</summary><div className="mt-2 flex flex-wrap gap-2">{renders.map(r=><button className={button} key={r.requestId} disabled={!r.taskId} onClick={()=>setRenderTask(r.taskId)}>版本 {r.revision} · {r.assetId?"已采纳":r.taskId?"查看任务":"请求待恢复"}</button>)}</div>{renders.filter(r=>r.assetId).map(r=><div key={r.requestId} className="mt-3"><p className="text-xs">已采纳版本 {r.revision}</p><FinalVideoPreview assetId={r.assetId!} orientation={height>width?"portrait":"landscape"}/></div>)}</details>
    {renderTask?<ExecutionTaskCard key={renderTask} taskId={renderTask} projectId={documentState.projectId} onTaskUpdate={()=>setRenderEpoch(e=>e+1)}/>:null}
  </section>;
}
