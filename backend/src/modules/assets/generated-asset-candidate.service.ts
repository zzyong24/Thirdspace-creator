import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,eq,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {pendingGeneratedAssetCommits} from "../../schema/pending-generated-asset-commits";
import {assets,assetFiles} from "./assets.db-schema";
import {ConflictError} from "./assets.errors";

/** 仅由后端候选事务调用；调用方传入同一事务，锁一直持有到候选及任务状态提交。 */
export async function verifyGeneratedAssetCandidate(db:Db,ctx:RequestContext,callId:string,raw:unknown){
 if(!ctx.userId || !ctx.accountId || !callId)throw new ConflictError("生成素材候选缺少归属");
 // SEMANTIC_BOUNDARY_ALLOW: 与素材提交服务同源的稳定身份摘要，不判断内容语义。
 const key=createHash("sha256").update(JSON.stringify([ctx.userId,ctx.accountId,`execution-asset:${callId}`])).digest("hex");
 const [row]=await db.select().from(pendingGeneratedAssetCommits).where(and(eq(pendingGeneratedAssetCommits.id,`generated-commit-${key}`),eq(pendingGeneratedAssetCommits.userId,ctx.userId),eq(pendingGeneratedAssetCommits.accountId,ctx.accountId)));
 if(!row?.committedAt)throw new ConflictError("素材缺少原调用的持久提交事实");
 const receipt={assetId:row.assetId,fileId:row.fileId,assetType:row.assetType,name:row.name,checksum:row.checksum,byteLength:row.byteLength,committedAt:row.committedAt};
 if(!isDeepStrictEqual(raw,receipt))throw new ConflictError("素材候选与原提交回执不符");
 const [asset]=await db.select().from(assets).where(and(eq(assets.id,row.assetId),eq(assets.userId,ctx.userId),eq(assets.accountId,ctx.accountId))).for("update");
 if(!asset || asset.status!=="pending" || asset.currentFileId!==row.fileId || asset.assetType!==row.assetType)throw new ConflictError("素材已删除、采纳或当前文件改变");
 const [file]=await db.select().from(assetFiles).where(and(eq(assetFiles.id,row.fileId),eq(assetFiles.assetId,row.assetId))).for("update");
 if(!file || file.storageKey!==row.storageKey || file.mimeType!==row.mimeType || file.checksum!==row.checksum || file.fileSize!==row.byteLength)throw new ConflictError("素材当前文件与原提交不符");
 return receipt;
}
