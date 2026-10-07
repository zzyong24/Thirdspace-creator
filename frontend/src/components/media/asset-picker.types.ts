import type {ENDPOINTS} from "@creatoros/contract";
type AssetResource=(typeof ENDPOINTS.getAsset.response)["_output"];
export type MediaType="image"|"video"|"audio";
export type ExactMediaIdentity={file:{assetId:string;assetFileId:string};name:string;assetType:MediaType;mimeType:string|null;fileSize:number|null;width:number|null;height:number|null;durationMs:number|null;createdAt:string|null};
export type MediaChoice<T>={choiceKey:string;value:T;identity:ExactMediaIdentity|null;name?:string;assetType?:MediaType;unavailableReason?:string};
export type AssetPickerSource<T>=
 |{kind:"library";key:string;label:string;allowedTypes:MediaType[];map:(asset:AssetResource)=>MediaChoice<T>}
 |{kind:"bounded";key:string;label:string;allowedTypes:MediaType[];items:MediaChoice<T>[];loading?:boolean;error?:string;completeness:"complete"|"loaded";hasMore?:boolean;loadingMore?:boolean;onLoadMore?:()=>void;onRetry?:()=>void};
export function mediaIdentity(asset:{id:string;currentFileId:string|null;name:string;assetType:string;mimeType?:string|null;fileSize?:number|null;width?:number|null;height?:number|null;durationMs?:number|null;createdAt?:string|null}):ExactMediaIdentity|null{
 if(!asset.currentFileId||!["image","video","audio"].includes(asset.assetType))return null;
 return {file:{assetId:asset.id,assetFileId:asset.currentFileId},name:asset.name,assetType:asset.assetType as MediaType,mimeType:asset.mimeType??null,fileSize:asset.fileSize??null,width:asset.width??null,height:asset.height??null,durationMs:asset.durationMs??null,createdAt:asset.createdAt??null};
}
export function assetChoice<T extends {id:string;currentFileId:string|null;name:string;assetType:string}>(asset:T):MediaChoice<T>{return {choiceKey:JSON.stringify([asset.id,asset.currentFileId]),value:asset,identity:mediaIdentity(asset),name:asset.name,assetType:["image","video","audio"].includes(asset.assetType)?asset.assetType as MediaType:undefined,...(!asset.currentFileId?{unavailableReason:"文件尚未准备好"}:{})};}
