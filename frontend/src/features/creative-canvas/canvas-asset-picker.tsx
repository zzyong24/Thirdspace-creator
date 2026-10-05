"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {ImagePlus,Search,Video,X} from "lucide-react";
import {MediaPreview} from "./infinite-canvas-node";

export type CanvasAssetOption={id:string;name:string;assetType:string;currentFileId:string};

type Props={presentation?:"drawer"|"page";query?:string;assetType?:"all"|"image"|"video";onFilter?:(query:string,type:"all"|"image"|"video")=>void;assets:CanvasAssetOption[];hasMore:boolean;loadingMore:boolean;onLoadMore:()=>void;onInsert:(asset:CanvasAssetOption)=>void;onClose:()=>void};

function AssetCard({asset,onInsert,presentation}:{asset:CanvasAssetOption;onInsert:(asset:CanvasAssetOption)=>void;presentation:"drawer"|"page"}){
 const ref=useRef<HTMLDivElement|null>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{const element=ref.current;if(!element)return;if(typeof IntersectionObserver==="undefined"){queueMicrotask(()=>setVisible(true));return;}const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)setVisible(true);},{root:element.closest("[data-canvas-assets-scroll]"),rootMargin:"240px"});observer.observe(element);return()=>observer.disconnect();},[asset.id]);
 const type=asset.assetType==="video"?"video":"image";
 return <div ref={ref} draggable onDragStart={event=>event.dataTransfer.setData("application/x-creatoros-canvas-asset",asset.id)} className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary/50 hover:shadow-sm">
  <div className="flex h-32 items-center justify-center overflow-hidden bg-muted/40">{visible?<MediaPreview assetId={asset.id} type={type}/>:type==="video"?<Video className="size-7 text-muted-foreground"/>:<ImagePlus className="size-7 text-muted-foreground"/>}</div>
  <div className="space-y-2 p-2.5"><div className="flex items-start gap-2"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{type==="video"?"视频":"图片"}</span><span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium" title={asset.name}>{asset.name}</span></div><button type="button" aria-label={`${type==="video"?"视频":"图片"} · ${asset.name} · ${presentation==="page"?"用此素材创作":"放到画布"}`} onClick={()=>onInsert(asset)} className="w-full rounded-lg border px-2 py-1.5 text-xs font-medium hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">{presentation==="page"?"用此素材创作":"放到画布"}</button></div>
 </div>;
}

export function CanvasAssetPicker({assets,hasMore,loadingMore,onLoadMore,onInsert,onClose,presentation="drawer",query:initialQuery="",assetType:initialType="all",onFilter}:Props){
 const [query,setQuery]=useState(initialQuery),[type,setType]=useState<"all"|"image"|"video">(initialType);
 useEffect(()=>{queueMicrotask(()=>setQuery(initialQuery));},[initialQuery]);
 const filtered=useMemo(()=>assets.filter(asset=>(type==="all"||asset.assetType===type)&&asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[assets,query,type]);
 return <aside aria-label="当前账号素材" className={presentation==="page"?"flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-background":"absolute bottom-16 left-4 top-16 z-20 flex w-[min(22rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"}>
  <div className="space-y-3 border-b p-4"><div className="flex items-start justify-between gap-3">{presentation==="drawer"?<div><h2 className="text-sm font-semibold">从素材库选用</h2><p className="mt-1 text-xs text-muted-foreground">点击插入，或拖到画布的指定位置。</p></div>:null}{presentation==="drawer"?<button type="button" onClick={onClose} aria-label="关闭素材库" className="rounded-lg p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><X className="size-4"/></button>:null}</div><label className="flex items-center gap-2 rounded-lg border bg-background px-2.5"><Search className="size-4 text-muted-foreground"/><input aria-label="搜索已加载素材" value={query} onChange={event=>{setQuery(event.target.value);onFilter?.(event.target.value,type);}} placeholder="搜索已加载的素材" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none"/></label><div className="flex gap-1" role="group" aria-label="筛选素材类型">{(["all","image","video"] as const).map(value=><button key={value} type="button" aria-pressed={type===value} onClick={()=>{setType(value);onFilter?.(query,value);}} className={`rounded-lg px-3 py-1.5 text-xs ${type===value?"bg-primary text-primary-foreground":"bg-muted/60 hover:bg-muted"}`}>{value==="all"?"全部":value==="image"?"图片":"视频"}</button>)}</div><p className="text-[11px] text-muted-foreground">搜索已加载的 {assets.length} 件素材{hasMore?" · 还有更多可加载":""}</p></div>
  <div data-canvas-assets-scroll className="min-h-0 flex-1 overflow-y-auto p-3">{filtered.length?<div className={presentation==="page"?"grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4":"grid grid-cols-2 gap-2"}>{filtered.map(asset=><AssetCard key={asset.id} asset={asset} onInsert={onInsert} presentation={presentation}/>)}</div>:<div className="rounded-xl border border-dashed px-4 py-8 text-center"><p className="text-sm font-medium">{assets.length?"已加载的素材中没有匹配项":"当前账号还没有图片或视频素材"}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{assets.length?"试试其他词或类型；如果还有更多页，可以继续加载。":"可以先去素材中心上传，也可以直接在画布中生成。"}</p>{assets.length===0?<Link href="/assets" className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">去素材中心上传</Link>:null}</div>}{hasMore?<button type="button" disabled={loadingMore} onClick={onLoadMore} className="mt-4 w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">{loadingMore?"正在加载…":"加载更多素材"}</button>:null}</div>
 </aside>;
}
