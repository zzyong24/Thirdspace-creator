import {workspaceObjectIdentity} from "./workspace-object-identity";
import {workspaceFilter} from "@creatoros/backend";
import {createHash} from "node:crypto";
import {and,eq,type Db} from "@creatoros/backend";
import {pendingGeneratedAssetCommits} from "../../schema/pending-generated-asset-commits";
import type {RequestContext} from "@creatoros/contract";
import type {ObjectStorageForCtx} from "./assets.service";
import {accountKeyPrefix} from "./object-storage";
import {ConflictError,UploadValidationError,requireAccountId} from "./assets.errors";
import {createPendingGeneratedAssetRepository,type GeneratedAssetCommit,type GeneratedAssetCommitAuthorization} from "./pending-generated-asset.repository";
export interface PendingGeneratedAssetInput {operationKey:string;assetType:"image"|"video";mimeType:string;name:string;description?:string;bytes:Uint8Array}
export interface PendingGeneratedAssetReceipt {assetId:string;fileId:string;assetType:string;name:string;checksum:string;byteLength:number;committedAt:string}
// SEMANTIC_BOUNDARY_ALLOW: 摘要只固定身份与完整字节，不选择画面语义。
const hash=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
function missing(error:unknown){const e=error as {code?:string;name?:string}|null;return e?.code==="ENOENT" || e?.name==="NoSuchKey";}
function receipt(row:GeneratedAssetCommit):PendingGeneratedAssetReceipt{if(!row.committedAt)throw new ConflictError("素材尚未完成提交");return {assetId:row.assetId,fileId:row.fileId,assetType:row.assetType,name:row.name,checksum:row.checksum,byteLength:row.byteLength,committedAt:row.committedAt};}
/** 素材模块独占对象与数据库；操作键由 backend 原调用派生，不能透传模型自报键。 */
export function createPendingGeneratedAssetService(deps:{db:Db;objectStorageForCtx:ObjectStorageForCtx;now:()=>string;authorize:GeneratedAssetCommitAuthorization}){
 const repo=createPendingGeneratedAssetRepository(deps.db,deps.authorize);
 function identity(ctx:RequestContext,operationKey:string){
  const workspace=workspaceObjectIdentity(ctx);
  if(!ctx.userId || !operationKey?.trim() || operationKey.length>4096)throw new UploadValidationError("素材提交身份不完整");
  return {...workspace,key:hash(JSON.stringify([ctx.userId,workspace.identity,operationKey]))};
 }
 async function finish(ctx:RequestContext,operationKey:string,row:GeneratedAssetCommit,bytes:Uint8Array|undefined,signal?:AbortSignal){
  if(row.committedAt)return {status:"committed" as const,receipt:receipt(row)};
  signal?.throwIfAborted();const storage=await deps.objectStorageForCtx(ctx);signal?.throwIfAborted();
  let stored:Uint8Array|null;
  try{stored=await storage.getObject(row.storageKey);}catch(error){if(!missing(error))throw error;stored=null;}
  signal?.throwIfAborted();
  if(stored===null){
   if(!bytes)return {status:"bytes_missing" as const};
   await storage.putObject({storageKey:row.storageKey,bytes,mimeType:row.mimeType,assetType:row.assetType});
   signal?.throwIfAborted();stored=await storage.getObject(row.storageKey);
  }
  signal?.throwIfAborted();
  if(stored.byteLength!==row.byteLength || hash(stored)!==row.checksum)throw new ConflictError("素材字节与原提交摘要不符");
  let head=await storage.headObject(row.storageKey);signal?.throwIfAborted();
  if(head.fileSize!==row.byteLength || head.mimeType!==row.mimeType){
   // 本地对象可能在字节发布后、元数据发布前中断。只用已验证的原字节修复，绝不重新生成。
   await storage.putObject({storageKey:row.storageKey,bytes:stored,mimeType:row.mimeType,assetType:row.assetType});
   signal?.throwIfAborted();
   const repaired=await storage.getObject(row.storageKey);signal?.throwIfAborted();
   if(repaired.byteLength!==row.byteLength || hash(repaired)!==row.checksum)throw new ConflictError("素材修复后的字节与原提交摘要不符");
   head=await storage.headObject(row.storageKey);signal?.throwIfAborted();
  }
  if(head.fileSize!==row.byteLength || head.mimeType!==row.mimeType)throw new ConflictError("素材对象元数据与原提交不符");
  return {status:"committed" as const,receipt:receipt(await repo.commit(ctx,operationKey,row,head,deps.now(),signal))};
 }
 return {
  async submit(context:RequestContext,raw:PendingGeneratedAssetInput,signal?:AbortSignal):Promise<PendingGeneratedAssetReceipt>{
   const ctx={...context},input={...raw,bytes:new Uint8Array(raw.bytes)};
   const {stamp,prefix,key}=identity(ctx,input.operationKey),description=input.description?.trim()??"";
   if(!["image","video"].includes(input.assetType) || !input.mimeType.startsWith(`${input.assetType}/`) || input.mimeType.length>256 || !input.name.trim() || input.name.length>1000 || description.length>1000 || input.bytes.byteLength<1 || input.bytes.byteLength>2147483647)throw new UploadValidationError("素材提交参数无效");
   const checksum=hash(input.bytes),row=await repo.prepare(ctx,input.operationKey,{
    id:`generated-commit-${key}`,userId:ctx.userId,...stamp,inputDigest:hash(JSON.stringify([input.assetType,input.mimeType,input.name,description,checksum])),
    assetId:`asset-generated-${key}`,fileId:`afile-generated-${key}`,storageKey:`${prefix}${input.assetType}/committed-${key}`,
    assetType:input.assetType,mimeType:input.mimeType,name:input.name,description,checksum,byteLength:input.bytes.byteLength,createdAt:deps.now(),committedAt:null,
   },signal);
   const result=await finish(ctx,input.operationKey,row,input.bytes,signal);
   if(result.status!=="committed")throw new ConflictError("素材字节尚未保存");return result.receipt;
  },
  async recover(context:RequestContext,operationKey:string,signal?:AbortSignal){
   const ctx={...context},{key}=identity(ctx,operationKey);
   const row=await repo.read(ctx,`generated-commit-${key}`,operationKey,signal);
   if(!row)return {status:"missing" as const};
   return finish(ctx,operationKey,row,undefined,signal);
  },
 };
}

/** 仅证明原提交已进入持久准备；不声称对象已存在，也不修改素材。 */
export async function hasPendingGeneratedAssetCommit(db:Pick<Db,"select">,ctx:RequestContext,operationKey:string){
 const workspace=workspaceObjectIdentity(ctx);
 const id=`generated-commit-${hash(JSON.stringify([ctx.userId,workspace.identity,operationKey]))}`;
 const [row]=await db.select({id:pendingGeneratedAssetCommits.id}).from(pendingGeneratedAssetCommits).where(and(eq(pendingGeneratedAssetCommits.id,id),eq(pendingGeneratedAssetCommits.userId,ctx.userId),workspaceFilter(pendingGeneratedAssetCommits,ctx)));
 return !!row;
}
