"use client";
import {useEffect,useRef,useState} from "react";
import {Video,Music} from "lucide-react";
import {useCreationWorkspace,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";
import {imageRatioStatus} from "@/features/creative-canvas/image-ratio";
export function AssetMediaPreview({assetId,fileId,type,requestedRatio,expectedChecksum,thumbnail=false,alt="画布图片素材"}:{assetId:string;fileId?:string;type:"image"|"video"|"audio";requestedRatio?:string;expectedChecksum?:string;thumbnail?:boolean;alt?:string}){
 const workspace=useCreationWorkspace(useCreationScope()),client=workspace.client;
 const mediaKey=JSON.stringify([creationScopeKey(workspace.scope),assetId,fileId??null,expectedChecksum??null]);

 const playback=useRef<HTMLMediaElement|null>(null);
 const [media,setMedia]=useState<{key:string;url:string}>({key:"",url:""}),[dimensions,setDimensions]=useState<{width:number;height:number}|null>(null);
 const url=media.key===mediaKey?media.url:"";
 useEffect(()=>{
  let live=true,blobUrl="";const controller=new AbortController();
  const setUrl=(url:string)=>setMedia({key:mediaKey,url});
  queueMicrotask(()=>{if(live){setUrl("");setDimensions(null);}});
  if(!fileId||(thumbnail&&type==="audio"))return()=>{live=false;controller.abort();};
  void client.getAssetFileDownloadUrl({params:{assetId,assetFileId:fileId},query:undefined,body:undefined}).then(async response=>{
   if(!live)return;workspace.assertCurrent();
   if(!expectedChecksum){setUrl(response.url);return;}
   // SEMANTIC_BOUNDARY_ALLOW: 仅校验用户已保存样图的文件完整性，不做风格或创作选择。
   const file=await fetch(response.url,{signal:controller.signal});if(!file.ok)throw Error("私人样图读取失败");
   const bytes=await file.arrayBuffer();
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
   if(digest!==expectedChecksum)throw Error("私人样图版本已变化");
   if(!live)return;workspace.assertCurrent();
   blobUrl=URL.createObjectURL(new Blob([bytes],{type:file.headers.get("content-type")??"image/png"}));setUrl(blobUrl);
  }).catch(()=>{if(live)setUrl("");});
  return()=>{live=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
 },[mediaKey,client,workspace,thumbnail,type]);
 useEffect(()=>()=>{playback.current?.pause();},[mediaKey]);
 if(thumbnail&&type==="audio")return <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Music className="size-9"/></div>;
 if(!url)return <div className="flex min-h-32 flex-1 items-center justify-center rounded-lg bg-muted/60 text-xs text-muted-foreground">预览暂不可用</div>;
 // Blob URLs are short-lived, account-scoped media links and must be loaded directly.
 // eslint-disable-next-line @next/next/no-img-element
 return type==="image"?<div className="flex h-full min-h-0 w-full flex-col"><img src={url} alt={alt} className="min-h-0 w-full flex-1 object-contain" onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}/>{dimensions&&!thumbnail?<p className={`shrink-0 px-1 py-1 text-center text-[10px] ${imageRatioStatus(dimensions.width,dimensions.height,requestedRatio).matched===false?"text-amber-700":"text-muted-foreground"}`}>{dimensions.width} × {dimensions.height} · {imageRatioStatus(dimensions.width,dimensions.height,requestedRatio).actualRatio}{requestedRatio&&imageRatioStatus(dimensions.width,dimensions.height,requestedRatio).matched===false?`（目标${requestedRatio}，仍可选用或下载）`:""}</p>:null}</div>:type==="audio"?<audio ref={element=>{playback.current=element;}} src={url} controls preload="none" className="w-full"/>:<video ref={element=>{playback.current=element;}} src={url} preload="metadata" className="h-full min-h-0 w-full object-contain" aria-label={alt} muted controls={!thumbnail} playsInline/>;
}

