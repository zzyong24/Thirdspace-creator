import {workspaceKey,workspaceFilter} from "@creatoros/backend";
import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {ObjectStorageForCtx} from "./assets.service";
import {ConflictError,requireAccountId} from "./assets.errors";
import {createWebDocumentCacheRepository,type CacheTransaction} from "./web-document-cache.repository";
/** 只能由同一后端服务确认的准备对象；不可作为 Worker 请求数据。 */
export interface WebDocumentCachePreparation {readonly fullText:string;readonly assetId:string;readonly fileId:string;readonly previewUrl:string|null;}
export function createWebDocumentCacheService(db:Db,deps:{objectStorageForCtx:ObjectStorageForCtx}){
 const repo=createWebDocumentCacheRepository(db);
 type Snapshot=NonNullable<Awaited<ReturnType<typeof repo.find>>>;
 const prepared=new WeakMap<WebDocumentCachePreparation,{snapshot:Snapshot;fullText:string;previewUrl:string|null}>();
 return {
  async prepare(ctx:RequestContext,url:string,signal?:AbortSignal):Promise<WebDocumentCachePreparation|null>{
   const owner={...ctx},accountId=workspaceKey(owner);
   signal?.throwIfAborted();
   let snapshot:Snapshot|null,fullText:string,previewUrl:string|null;
   try{
    snapshot=await repo.find(owner.userId,accountId,url);signal?.throwIfAborted();
    if(!snapshot || !snapshot.file.mimeType.startsWith("text/"))return null;
    const storage=await deps.objectStorageForCtx(owner);signal?.throwIfAborted();
    const bytes=await storage.getObject(snapshot.file.storageKey);signal?.throwIfAborted();
    if(!bytes?.byteLength)return null;
    fullText=new TextDecoder().decode(bytes);if(!fullText.trim())return null;
    previewUrl=await storage.getSignedUrl(snapshot.file.storageKey).catch(()=>null);signal?.throwIfAborted();
   }catch{signal?.throwIfAborted();return null;}
   const token=Object.freeze({assetId:snapshot.asset.id,fileId:snapshot.file.id,fullText,previewUrl});
   prepared.set(token,{snapshot,fullText,previewUrl});return token;
  },
  async confirm(ctx:RequestContext,token:WebDocumentCachePreparation,transaction?:CacheTransaction,signal?:AbortSignal){
   const accountId=workspaceKey(ctx),bound=prepared.get(token);
   if(!bound || bound.snapshot.asset.userId!==ctx.userId || (accountId.kind==="group"?bound.snapshot.asset.groupId!==accountId.id:bound.snapshot.asset.accountId!==accountId.id))throw new ConflictError("缓存准备对象无效或归属不符");
   const confirmed=await repo.confirm(bound.snapshot,bound.fullText,transaction,signal);
   return {...confirmed,previewUrl:bound.previewUrl};
  },
 };
}
