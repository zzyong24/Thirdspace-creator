import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,eq,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {pendingGeneratedAssetCommits} from "../../schema/pending-generated-asset-commits";
import {assets,assetFiles} from "./assets.db-schema";
import {ConflictError} from "./assets.errors";

/** 仅由后端候选事务调用；调用方传入同一事务，锁一直持有到候选及任务状态提交。 */
async function readGeneratedAssetReceipt(db:Db,ctx:RequestContext,callId:string,raw:unknown){
 if(!ctx.userId || !ctx.accountId || !callId)throw new ConflictError("生成素材候选缺少归属");
 // SEMANTIC_BOUNDARY_ALLOW: 与素材提交服务同源的稳定身份摘要，不判断内容语义。
 const key=createHash("sha256").update(JSON.stringify([ctx.userId,ctx.accountId,`execution-asset:${callId}`])).digest("hex");
 const [row]=await db.select().from(pendingGeneratedAssetCommits).where(and(eq(pendingGeneratedAssetCommits.id,`generated-commit-${key}`),eq(pendingGeneratedAssetCommits.userId,ctx.userId),eq(pendingGeneratedAssetCommits.accountId,ctx.accountId)));
 if(!row?.committedAt)throw new ConflictError("素材缺少原调用的持久提交事实");
 const receipt={assetId:row.assetId,fileId:row.fileId,assetType:row.assetType,name:row.name,checksum:row.checksum,byteLength:row.byteLength,committedAt:row.committedAt};
 if(!isDeepStrictEqual(raw,receipt))throw new ConflictError("素材候选与原提交回执不符");
 return {row,receipt};
}
export async function verifyGeneratedAssetCandidate(db:Db,ctx:RequestContext,callId:string,raw:unknown){
 const {row,receipt}=await readGeneratedAssetReceipt(db,ctx,callId,raw);
 const [asset]=await db.select().from(assets).where(and(eq(assets.id,row.assetId),eq(assets.userId,ctx.userId),eq(assets.accountId,ctx.accountId!))).for("update");
 if(!asset || asset.status!=="pending" || asset.currentFileId!==row.fileId || asset.assetType!==row.assetType)throw new ConflictError("素材已删除、采纳或当前文件改变");
 const [file]=await db.select().from(assetFiles).where(and(eq(assetFiles.id,row.fileId),eq(assetFiles.assetId,row.assetId))).for("update");
 if(!file || file.storageKey!==row.storageKey || file.mimeType!==row.mimeType || file.checksum!==row.checksum || file.fileSize!==row.byteLength)throw new ConflictError("素材当前文件与原提交不符");
 return receipt;
}

/** 调用方持有同一采纳事务；验证当前原文件后才激活，不涉及对象写入。 */
export async function activateGeneratedAssetCandidate(db:Db,ctx:RequestContext,callId:string,raw:unknown,stamp:string){
 const receipt=await verifyGeneratedAssetCandidate(db,ctx,callId,raw);
 await db.update(assets).set({status:"active",updatedAt:stamp}).where(and(eq(assets.id,receipt.assetId),eq(assets.userId,ctx.userId),eq(assets.accountId,ctx.accountId!)));
 return receipt;
}

/** 用户拒绝原候选；已删素材无需恢复，不读取或改写对象文件。 */
export async function discardGeneratedAssetCandidate(db:Db,ctx:RequestContext,callId:string,raw:unknown,stamp:string){
 const {row}=await readGeneratedAssetReceipt(db,ctx,callId,raw);
 const owned=and(eq(assets.id,row.assetId),eq(assets.userId,ctx.userId),eq(assets.accountId,ctx.accountId!));
 const [asset]=await db.select().from(assets).where(owned).for("update");
 if(!asset || asset.status==="deleted")return;
 if(asset.status!=="pending")throw new ConflictError("已采纳素材不能作为待采纳候选删除");
 await db.update(assets).set({status:"deleted",updatedAt:stamp}).where(owned);
}

/** 原提交与精确历史文件的只读核验；不使用currentFileId，不激活，不修复账本。 */
export async function readCommittedGeneratedAssetFile(db:Db,ctx:RequestContext,callId:string,raw:unknown){
 const {row,receipt}=await readGeneratedAssetReceipt(db,ctx,callId,raw);
 if(!["image","video"].includes(row.assetType) || !/^[a-f0-9]{64}$/.test(row.checksum) || row.byteLength<1)throw new ConflictError("原提交文件证明不完整");
 const [asset]=await db.select().from(assets).where(and(eq(assets.id,row.assetId),eq(assets.userId,ctx.userId),eq(assets.accountId,ctx.accountId!)));
 if(!asset || !["pending","active"].includes(asset.status) || asset.assetType!==row.assetType)throw new ConflictError("原素材不可用于选择");
 const [file]=await db.select().from(assetFiles).where(and(eq(assetFiles.id,row.fileId),eq(assetFiles.assetId,row.assetId)));
 if(!file || file.storageKey!==row.storageKey || file.mimeType!==row.mimeType || file.checksum!==row.checksum || file.fileSize!==row.byteLength)throw new ConflictError("历史精确文件与原提交不符");
 return {receipt:{...receipt,assetType:row.assetType as "image"|"video"},assetStatus:asset.status as "pending"|"active"};
}
