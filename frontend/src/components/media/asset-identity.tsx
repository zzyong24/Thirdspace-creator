import type {ExactMediaIdentity} from "./asset-picker.types";
export const mediaTypeLabels={image:"图片",video:"视频",audio:"音频"};
export function mediaDetails(identity:ExactMediaIdentity|null):string{
 if(!identity)return "";const bits:string[]=[mediaTypeLabels[identity.assetType]];
 if(identity.durationMs!==null){const seconds=Math.floor(identity.durationMs/1000);bits.push(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`);}
 if(identity.width!==null&&identity.height!==null)bits.push(`${identity.width} × ${identity.height}`);
 if(identity.fileSize!==null)bits.push(identity.fileSize>=1048576?`${(identity.fileSize/1048576).toFixed(1)} MB`:`${Math.ceil(identity.fileSize/1024)} KB`);
 return bits.join(" · ");
}
export function AssetIdentity({identity,name}:{identity:ExactMediaIdentity|null;name?:string}){return <div className="min-w-0 space-y-1"><p className="line-clamp-2 break-all text-sm font-medium leading-5" title={identity?.name??name}>{identity?.name??name??"已选素材"}</p><p className="text-xs text-muted-foreground">{mediaDetails(identity)}</p></div>;}
