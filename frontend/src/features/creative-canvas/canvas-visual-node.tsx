"use client";
import {useCreationClient} from "@/lib/creation-workspace-scope";

import {useEffect,useState} from "react";
import {Handle,NodeResizer,Position,type Node,type NodeProps} from "@xyflow/react";
import type {CanvasNode} from "@creatoros/contract";
import {client} from "@/lib/contract-client";

export type CanvasAssetOption={id:string;name:string;assetType:string;currentFileId:string};
export type CanvasResult={assetId:string;inputRevision:number};
export type CanvasCapability={mode:"text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";available:boolean;model:string|null;reason:string|null};

export type CanvasVisualData={
 item:CanvasNode;
 canvasId:string;
 previewRevision:number;
 result?:CanvasResult;
 assets:CanvasAssetOption[];
 capability?:CanvasCapability;
 busy:boolean;
 onPatch:(id:string,patch:Partial<CanvasNode>)=>void;
 onResize:(id:string,size:{width:number;height:number})=>void;
 onGenerate:(id:string)=>void;
 onInsertResult:(id:string,assetId:string,type:"image"|"video")=>void;
 onReferenceDrop:(targetId:string,sourceId:string)=>void;
};
export type CanvasVisualFlowNode=Node<CanvasVisualData,"canvasVisual">;

export function MediaPreview({assetId,type,canvasId,nodeId,revision}:{assetId:string;type:"image"|"video";canvasId?:string;nodeId?:string;revision?:number}){
 const client=useCreationClient();

 const [url,setUrl]=useState("");
 useEffect(()=>{let live=true;const request=canvasId&&nodeId?client.getCanvasNodePreview({params:{canvasId,nodeId},query:undefined,body:undefined}):client.getDownloadUrl({params:{assetId},query:undefined,body:undefined});void request.then(response=>{if(live)setUrl(response.url);}).catch(()=>{if(live)setUrl("");});return()=>{live=false;};},[assetId,canvasId,nodeId,revision]);
 if(!url)return <div className="flex min-h-32 flex-1 items-center justify-center rounded-lg bg-muted/60 text-xs text-muted-foreground">预览暂不可用</div>;
 return type==="image"?<img src={url} alt="画布图片素材" className="h-full min-h-0 w-full object-contain"/>:<video src={url} className="nodrag nowheel h-full min-h-0 w-full object-contain" muted controls playsInline/>;
}

const modeLabel={text_to_image:"文生图",image_to_image:"参考图生图",text_to_video:"文生视频",image_to_video:"首帧图生视频"} as const;

export function CanvasVisualNode({id,data,selected}:NodeProps<CanvasVisualFlowNode>){
 const {item,canvasId,previewRevision,result,assets,capability,busy,onPatch,onResize,onGenerate,onInsertResult,onReferenceDrop}=data;
 const isGeneration=item.type==="image_generation"||item.type==="video_generation";
 const mediaType=item.type==="video"||item.type==="video_generation"?"video":"image";
 const title=item.label||({text:"文字想法",image:"图片素材",video:"视频素材",image_generation:"图片生成",video_generation:"视频生成"} as const)[item.type];
 return <div className="group flex h-full w-full flex-col overflow-visible rounded-2xl border border-border bg-card shadow-lg ring-0 transition-shadow hover:shadow-xl" data-canvas-object={item.type}>
  <NodeResizer isVisible={selected} minWidth={180} minHeight={120} maxWidth={1200} maxHeight={900} onResizeEnd={(_,size)=>onResize(id,{width:Math.round(size.width),height:Math.round(size.height)})}/>
  <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-primary opacity-0 transition-opacity group-hover:opacity-100"/>
  <div className="canvas-drag-handle flex shrink-0 cursor-grab items-center justify-between gap-2 rounded-t-2xl border-b bg-muted/40 px-3 py-2 active:cursor-grabbing">
   <div className="min-w-0 truncate text-xs font-semibold">{title}</div>
   <span className="shrink-0 text-[10px] text-muted-foreground">{isGeneration?"创作中枢":item.type==="text"?"文字":"素材"}</span>
  </div>
  {item.type==="text"?<textarea aria-label="画布文字内容" className="nodrag nowheel min-h-0 flex-1 resize-none rounded-b-2xl bg-transparent p-3 text-sm leading-relaxed outline-none" placeholder="在这里写下想法…" value={item.text} onChange={event=>onPatch(id,{text:event.target.value} as Partial<CanvasNode>)}/>:null}
  {item.type==="image"||item.type==="video"?<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b-2xl bg-muted/30 p-2" draggable={item.type==="image"} onDragStart={event=>{if(item.type==="image")event.dataTransfer.setData("application/x-creatoros-canvas-image",id);}}><MediaPreview assetId={item.assetId} type={item.type} canvasId={canvasId} nodeId={item.id} revision={previewRevision}/></div>:null}
  {isGeneration?<>
   <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" onDragOver={event=>{if(event.dataTransfer.types.includes("application/x-creatoros-canvas-image"))event.preventDefault();}} onDrop={event=>{const sourceId=event.dataTransfer.getData("application/x-creatoros-canvas-image");if(sourceId){event.preventDefault();event.stopPropagation();onReferenceDrop(id,sourceId);}}}>
    <select aria-label="生成模式" className="nodrag nowheel w-full rounded-lg border bg-background px-2 py-1.5 text-xs" value={item.mode} onChange={event=>onPatch(id,{mode:event.target.value as typeof item.mode,referenceAssetId:undefined,aspectRatio:undefined} as Partial<CanvasNode>)}>
     {(item.type==="image_generation"?["text_to_image","image_to_image"]:["text_to_video","image_to_video"]).map(mode=><option key={mode} value={mode}>{modeLabel[mode as keyof typeof modeLabel]}</option>)}
    </select>
    <textarea aria-label="生成描述" className="nodrag nowheel min-h-24 w-full flex-1 resize-none rounded-lg border bg-background p-2 text-xs leading-relaxed outline-none focus:border-primary" placeholder="描述你想生成的画面…" value={item.prompt} onChange={event=>onPatch(id,{prompt:event.target.value} as Partial<CanvasNode>)}/>
    {item.mode.startsWith("image_to_")?<select aria-label="参考图片" className="nodrag nowheel w-full rounded-lg border bg-background px-2 py-1.5 text-xs" value={item.referenceAssetId??""} onChange={event=>onPatch(id,{referenceAssetId:event.target.value||undefined} as Partial<CanvasNode>)}><option value="">选择或拖入参考图片</option>{assets.filter(asset=>asset.assetType==="image").map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>:null}
    {result?<div className="relative h-44 min-h-28 shrink-0 overflow-hidden rounded-lg bg-muted/30"><MediaPreview assetId={result.assetId} type={mediaType}/><button type="button" className="nodrag absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-[11px] shadow" onClick={()=>onInsertResult(id,result.assetId,mediaType)}>放到画布</button></div>:null}
    <div className="flex items-center justify-between gap-2"><span className="max-w-[65%] truncate text-[10px] text-muted-foreground" title={capability?.reason??capability?.model??""}>{capability?.available?capability.model:capability?.reason??"正在读取模型…"}</span><button type="button" className="nodrag rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40" disabled={busy||!capability?.available||!item.prompt.trim()||(item.mode.startsWith("image_to_")&&!item.referenceAssetId)} onClick={()=>onGenerate(id)}>{busy?"提交中…":"生成"}</button></div>
   </div>
  </>:null}
  <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background !bg-primary opacity-0 transition-opacity group-hover:opacity-100"/>
 </div>;
}

export const canvasNodeTypes={canvasVisual:CanvasVisualNode};
