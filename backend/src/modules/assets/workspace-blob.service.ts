import {and,eq,gt,isNull,or} from 'drizzle-orm';
import type {RequestContext} from '@creatoros/contract';
import type {Db} from '../../db';
import {assets,assetFiles,assetUploads} from '../../schema/assets';
import {resourceAccessGrants,workspaceBlobObjects} from '../../schema/resource-access';
import {workspaceFilter,workspaceStamp,requireWorkspace,assertWritableWorkspace} from '../../workspace-scope';
import {OwnershipError} from '../../errors';
/** 直接访问字节和通过素材列表使用同一权限，不从文件路径推断账号。 */
export function createWorkspaceBlobService(db:Db,now:()=>string){
 return {
  async register(ctx:RequestContext,key:string,expiresAt:string){
   requireWorkspace(ctx);
   await db.insert(workspaceBlobObjects).values({storageKey:key,userId:ctx.userId,...workspaceStamp(ctx),expiresAt}).onConflictDoNothing();
  },
  async authorize(ctx:RequestContext,key:string,method:'GET'|'PUT'){
   requireWorkspace(ctx);
   if(method==='PUT'){
    await assertWritableWorkspace(db,ctx);
    const uploads=await db.select({id:assetUploads.id}).from(assetUploads).where(and(eq(assetUploads.userId,ctx.userId),workspaceFilter(assetUploads,ctx),eq(assetUploads.storageKey,key),eq(assetUploads.status,'created')));
    if(uploads.length)return;
    throw new OwnershipError('上传凭证不可用');
   }
   const files=await db.select({id:assets.id,groupId:assets.groupId,accountId:assets.accountId,status:assets.status}).from(assetFiles).innerJoin(assets,eq(assets.id,assetFiles.assetId)).where(and(eq(assetFiles.storageKey,key),eq(assets.userId,ctx.userId)));
   if(files.length){
    const a=files[0]!;if(a.status==='deleted')throw new OwnershipError('素材不可用');
    if(ctx.groupId?a.groupId===ctx.groupId:a.accountId===ctx.accountId&&(a.groupId===null||a.groupId===`grp_legacy_${ctx.accountId}`))return;
    if(ctx.groupId){const grants=await db.select({id:resourceAccessGrants.id}).from(resourceAccessGrants).where(and(eq(resourceAccessGrants.userId,ctx.userId),eq(resourceAccessGrants.targetGroupId,ctx.groupId),eq(resourceAccessGrants.resourceType,'asset'),eq(resourceAccessGrants.resourceId,a.id),isNull(resourceAccessGrants.revokedAt)));if(grants.length)return;}
    throw new OwnershipError('当前账号组没有此素材的读取权限');
   }
   // 导出及候选预览没有正式素材实体，使用由服务端登记的短期对象凭证。
   const objects=await db.select().from(workspaceBlobObjects).where(and(eq(workspaceBlobObjects.userId,ctx.userId),eq(workspaceBlobObjects.storageKey,key),workspaceFilter(workspaceBlobObjects,ctx),gt(workspaceBlobObjects.expiresAt,now())));
   if(!objects.length)throw new OwnershipError('文件不可用或访问凭证已过期');
  },
 };
}
