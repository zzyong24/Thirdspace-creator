"use client";
import * as React from "react";
import Image from "next/image";
import type {MomentsDocument} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
export function MomentsImage({file}:{file:MomentsDocument["imageUses"][number]}){const[url,setUrl]=React.useState<string|null>(null),[error,setError]=React.useState(false);React.useEffect(()=>{let active=true;void client.getAssetFileDownloadUrl({params:{assetId:file.assetId,assetFileId:file.assetFileId},query:undefined,body:undefined}).then(value=>{if(active)setUrl(value.url);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[file.assetId,file.assetFileId]);return url?<div className="space-y-2"><Image src={url} alt={`朋友圈配图 ${file.order+1}`} width={320} height={240} unoptimized className="h-36 w-full rounded-lg bg-surface-subtle object-contain"/><a href={url} download className="inline-flex rounded-md border px-3 py-2 text-sm">下载原图</a></div>:<div className="flex h-36 items-center justify-center rounded-lg bg-surface-subtle text-xs text-muted-foreground">{error?"原图片版本暂不可读取":"读取配图中…"}</div>;}
