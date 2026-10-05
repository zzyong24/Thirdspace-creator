import type {Db} from '@creatoros/backend';
import {ErrorCode,type RequestContext} from '@creatoros/contract';
import type {PublishingService} from './publishing.service';
import type {PublicationCoverSavePorts} from './publication-cover.ports';
/** 保持旧createRevision/setCover/createImportedPublication公开body/response；root须传未包装的同tx原owner factory。
 * 其他currentRevision写者仍须原锁/CAS审核，不把此wrapper宣称全owner锁已落实。 */
export function withPublicationManualRevisionLock(db:Db,ports:PublicationCoverSavePorts,originalFor:(tx:Db)=>PublishingService):PublishingService{
 async function locked<T>(ctx:RequestContext,id:string,action:(owner:PublishingService)=>Promise<T>):Promise<T>{return db.transaction(async transaction=>{const tx=transaction as unknown as Db,owner=originalFor(tx),pub=await owner.getPublication(ctx,id),output=await ports.projects(tx).getOutput(ctx,pub.contentOutputId);await ports.projects(tx).getProject(ctx,output.projectId,true);const current=await owner.getPublication(ctx,id,true);if(current.contentOutputId!==output.id)throw Object.assign(Error('发布稿归属发生变化'),{code:ErrorCode.ConflictError});return action(owner);});}
 const original=originalFor(db);return{...original,
 createImportedPublication:async(ctx,outputId,body)=>{
  const canonical=await original.resolvePublication(ctx,{platform:body.platform,externalId:body.externalId});
  // 已有原canonical属主优先，不能用临时导入output抢归属或锁错项目。
  if(canonical)return locked(ctx,canonical.id,owner=>owner.createImportedPublication(ctx,outputId,body));
  // 新创建沿原owner；其命中竞态canonical的回填分支自己锁pub并CAS，且不再反向取项目锁。
  return original.createImportedPublication(ctx,outputId,body);
 },
 createRevision:(ctx,id,body)=>locked(ctx,id,owner=>owner.createRevision(ctx,id,body)),setCover:(ctx,id,assetId)=>locked(ctx,id,owner=>owner.setCover(ctx,id,assetId))};
}
