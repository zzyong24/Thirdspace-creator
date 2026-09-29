"use client";

// Adapted from basketikun/infinite-canvas, web/src/components/canvas/canvas-node.tsx
// and web/src/pages/canvas/project.tsx at dab19adc0847e32e39b7fc8ff90cb392561fb826.
// The media body is bound to CreatorOS assets and generation tasks. MIT notice: THIRD_PARTY_NOTICES.md.
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import type {CanvasNode} from "@creatoros/contract";
import {client} from "@/lib/contract-client";

export type CanvasAssetOption={id:string;name:string;assetType:string;currentFileId:string};
export type CanvasResult={assetId:string;inputRevision:number};
export type CanvasCapability={mode:"text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";available:boolean;model:string|null;reason:string|null};
export const defaultSize=(type:CanvasNode["type"])=>type==="text"?{width:280,height:200}:type==="image"||type==="video"?{width:380,height:300}:{width:350,height:430};

export function MediaPreview({assetId,type,canvasId,nodeId,revision}:{assetId:string;type:"image"|"video";canvasId?:string;nodeId?:string;revision?:number}){
 const [url,setUrl]=useState("");
 useEffect(()=>{let live=true;const request=canvasId&&nodeId?client.getCanvasNodePreview({params:{canvasId,nodeId},query:undefined,body:undefined}):client.getDownloadUrl({params:{assetId},query:undefined,body:undefined});void request.then(response=>{if(live)setUrl(response.url);}).catch(()=>{if(live)setUrl("");});return()=>{live=false;};},[assetId,canvasId,nodeId,revision]);
 if(!url)return <div className="flex min-h-32 flex-1 items-center justify-center rounded-lg bg-muted/60 text-xs text-muted-foreground">预览暂不可用</div>;
 return type==="image"?<img src={url} alt="画布图片素材" className="h-full min-h-0 w-full object-contain"/>:<video src={url} className="h-full min-h-0 w-full object-contain" muted controls playsInline/>;
}

const modeLabel={text_to_image:"文生图",image_to_image:"参考图生图",text_to_video:"文生视频",image_to_video:"首帧图生视频"} as const;
type Props={item:CanvasNode;canvasId:string;revision:number;selected:boolean;result?:CanvasResult;assets:CanvasAssetOption[];capability?:CanvasCapability;busy:boolean;
 onSelect:(event:ReactPointerEvent<HTMLDivElement>,id:string)=>void;onStartDrag:(event:ReactPointerEvent<HTMLDivElement>,id:string)=>void;onStartResize:(event:ReactPointerEvent<HTMLButtonElement>,id:string)=>void;onStartConnect:(event:ReactPointerEvent<HTMLButtonElement>,id:string)=>void;
 onPatch:(id:string,patch:Partial<CanvasNode>)=>void;onGenerate:(id:string)=>void;onInsertResult:(id:string,assetId:string,type:"image"|"video")=>void;onReferenceDrop:(targetId:string,sourceId:string)=>void;};

export function InfiniteCanvasNode({item,canvasId,revision,selected,result,assets,capability,busy,onSelect,onStartDrag,onStartResize,onStartConnect,onPatch,onGenerate,onInsertResult,onReferenceDrop}:Props){
 const wrapperRef=useRef<HTMLDivElement|null>(null),[nearViewport,setNearViewport]=useState(true);
 useEffect(()=>{const element=wrapperRef.current,root=element?.closest('[data-testid="infinite-canvas"]');if(!element||!root||typeof IntersectionObserver==="undefined")return;const observer=new IntersectionObserver(entries=>setNearViewport(Boolean(entries[0]?.isIntersecting)),{root,rootMargin:"400px"});observer.observe(element);return()=>observer.disconnect();},[item.id]);
 const size={...defaultSize(item.type),...item.size},isGeneration=item.type==="image_generation"||item.type==="video_generation",mediaType=item.type==="video"||item.type==="video_generation"?"video":"image";
 const title=item.label||({text:"文字想法",image:"图片素材",video:"视频素材",image_generation:"图片生成",video_generation:"视频生成"} as const)[item.type];
 return <div ref={wrapperRef} data-canvas-object={item.type} data-node-id={item.id} data-selected={selected?"true":"false"} data-testid="canvas-node" className={`group absolute flex flex-col rounded-2xl border bg-card shadow-lg ${selected?"border-primary ring-2 ring-primary/40":"border-border"}`} style={{left:item.position.x,top:item.position.y,width:size.width,height:size.height}} onPointerDownCapture={event=>onSelect(event,item.id)}>
  <button type="button" data-canvas-handle-target={item.id} aria-label={`连接到${title}`} className="absolute -left-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={event=>event.stopPropagation()}/>
  <div className="canvas-drag-handle flex shrink-0 cursor-grab items-center justify-between gap-2 rounded-t-2xl border-b bg-muted/40 px-3 py-2 active:cursor-grabbing" onPointerDown={event=>onStartDrag(event,item.id)}><span className="min-w-0 truncate text-xs font-semibold">{title}</span><span className="shrink-0 text-[10px] text-muted-foreground">{isGeneration?"创作中枢":item.type==="text"?"文字":"素材"}</span></div>
  {item.type==="text"?<textarea aria-label="画布文字内容" data-canvas-scroll className="min-h-0 flex-1 resize-none rounded-b-2xl bg-transparent p-3 text-sm leading-relaxed outline-none" placeholder="在这里写下想法…" value={item.text} onChange={event=>onPatch(item.id,{text:event.target.value} as Partial<CanvasNode>)}/>:null}
  {item.type==="image"||item.type==="video"?<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b-2xl bg-muted/30 p-2" draggable={item.type==="image"} onDragStart={event=>{if(item.type==="image")event.dataTransfer.setData("application/x-creatoros-canvas-image",item.id);}}>{nearViewport?<MediaPreview assetId={item.assetId} type={item.type} canvasId={canvasId} nodeId={item.id} revision={revision}/>:<span className="text-xs text-muted-foreground">媒体位于视口外</span>}</div>:null}
  {isGeneration?<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" data-canvas-scroll onDragOver={event=>{if(event.dataTransfer.types.includes("application/x-creatoros-canvas-image"))event.preventDefault();}} onDrop={event=>{const source=event.dataTransfer.getData("application/x-creatoros-canvas-image");if(source){event.preventDefault();event.stopPropagation();onReferenceDrop(item.id,source);}}}>
   <select aria-label="生成模式" className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs" value={item.mode} onChange={event=>onPatch(item.id,{mode:event.target.value as typeof item.mode,referenceAssetId:undefined,aspectRatio:undefined} as Partial<CanvasNode>)}>{(item.type==="image_generation"?["text_to_image","image_to_image"]:["text_to_video","image_to_video"]).map(mode=><option key={mode} value={mode}>{modeLabel[mode as keyof typeof modeLabel]}</option>)}</select>
   <textarea aria-label="生成描述" className="min-h-24 w-full flex-1 resize-none rounded-lg border bg-background p-2 text-xs leading-relaxed outline-none focus:border-primary" placeholder="描述你想生成的画面…" value={item.prompt} onChange={event=>onPatch(item.id,{prompt:event.target.value} as Partial<CanvasNode>)}/>
   {item.mode.startsWith("image_to_")?<select aria-label="参考图片" className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs" value={item.referenceAssetId??""} onChange={event=>onPatch(item.id,{referenceAssetId:event.target.value||undefined} as Partial<CanvasNode>)}><option value="">选择或拖入参考图片</option>{assets.filter(asset=>asset.assetType==="image").map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>:null}
   {result?<div className="relative h-44 min-h-28 shrink-0 overflow-hidden rounded-lg bg-muted/30">{nearViewport?<MediaPreview assetId={result.assetId} type={mediaType}/>:null}<button type="button" className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-[11px] shadow" onClick={()=>onInsertResult(item.id,result.assetId,mediaType)}>放到画布</button></div>:null}
   <div className="flex items-center justify-between gap-2"><span className="max-w-[65%] truncate text-[10px] text-muted-foreground" title={capability?.reason??capability?.model??""}>{capability?.available?capability.model:capability?.reason??"正在读取模型…"}</span><button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40" disabled={busy||!capability?.available||!item.prompt.trim()||(item.mode.startsWith("image_to_")&&!item.referenceAssetId)} onClick={()=>onGenerate(item.id)}>{busy?"提交中…":"生成"}</button></div>
  </div>:null}
  <button type="button" data-canvas-handle-source={item.id} aria-label={`从${title}连接`} className="absolute -right-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={event=>onStartConnect(event,item.id)}/>
  <button type="button" aria-label={`调整${title}大小`} data-canvas-control className="absolute -bottom-2 -right-2 z-20 h-5 w-5 cursor-nwse-resize rounded-md border border-background bg-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={event=>onStartResize(event,item.id)}/>
 </div>;
}
