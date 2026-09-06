import {and,eq,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {pendingGeneratedAssetCommits as commits} from "../../schema/pending-generated-asset-commits";
import {assets,assetFiles} from "./assets.db-schema";
import type {ObjectStoragePort} from "./object-storage";
import {ConflictError} from "./assets.errors";
export type GeneratedAssetCommit=typeof commits.$inferSelect;
export type GeneratedAssetCommitAuthorization=(ctx:RequestContext,operationKey:string,tx:Parameters<Parameters<Db["transaction"]>[0]>[0])=>Promise<void>;
export function createPendingGeneratedAssetRepository(db:Db,authorize:GeneratedAssetCommitAuthorization){
 const scope=(ctx:RequestContext,id:string)=>and(eq(commits.id,id),eq(commits.userId,ctx.userId),eq(commits.accountId,ctx.accountId!));
 const check=(row:GeneratedAssetCommit|undefined,expected:GeneratedAssetCommit)=>{if(!row || row.inputDigest!==expected.inputDigest)throw new ConflictError("素材提交键已绑定其他内容");return row;};
 return {
  async read(ctx:RequestContext,id:string,operationKey:string,signal?:AbortSignal){
   return db.transaction(async tx=>{
    const [row]=await tx.select().from(commits).where(scope(ctx,id));
    if(!row || row.committedAt)return row??null;
    signal?.throwIfAborted();await authorize(ctx,operationKey,tx);signal?.throwIfAborted();return row;
   });
  },
  async prepare(ctx:RequestContext,operationKey:string,expected:GeneratedAssetCommit,signal?:AbortSignal){
   return db.transaction(async tx=>{
    const [existing]=await tx.select().from(commits).where(scope(ctx,expected.id));
    if(existing){check(existing,expected);if(existing.committedAt)return existing;}
    signal?.throwIfAborted();await authorize(ctx,operationKey,tx);signal?.throwIfAborted();
    await tx.insert(commits).values(expected).onConflictDoNothing();signal?.throwIfAborted();
    return check((await tx.select().from(commits).where(scope(ctx,expected.id)))[0],expected);
   });
  },
  async commit(ctx:RequestContext,operationKey:string,expected:GeneratedAssetCommit,head:Awaited<ReturnType<ObjectStoragePort["headObject"]>>,stamp:string,signal?:AbortSignal){
   return db.transaction(async tx=>{
    const existing=check((await tx.select().from(commits).where(scope(ctx,expected.id)))[0],expected);if(existing.committedAt)return existing;
    signal?.throwIfAborted();await authorize(ctx,operationKey,tx);signal?.throwIfAborted();
    const row=check((await tx.select().from(commits).where(scope(ctx,expected.id)).for("update"))[0],expected);if(row.committedAt)return row;
    signal?.throwIfAborted();
    await tx.insert(assets).values({id:row.assetId,userId:row.userId,accountId:row.accountId,currentFileId:row.fileId,assetType:row.assetType,name:row.name,description:row.description,status:"pending",createdAt:stamp,updatedAt:stamp});
    signal?.throwIfAborted();
    await tx.insert(assetFiles).values({id:row.fileId,assetId:row.assetId,versionNumber:1,storageKey:row.storageKey,mimeType:row.mimeType,fileSize:row.byteLength,checksum:row.checksum,width:head.width,height:head.height,durationMs:head.durationMs,mediaMetadata:head.mediaMetadata,createdAt:stamp});
    signal?.throwIfAborted();
    const [saved]=await tx.update(commits).set({committedAt:stamp}).where(scope(ctx,row.id)).returning();signal?.throwIfAborted();return saved!;
   });
  },
 };
}
