import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {lockImportedProjectForReconstruction} from '../projects/project-lock.service';
import {createArtifactsService} from './artifacts.service';
/** 仅接当前完成事务：项目锁、artifact 和首版本一起回滚，origin 不由模型决定。 */
export function createReconstructedArtifactService(deps:{now:()=>string;nextId:(prefix:string)=>string}){
 return {async materialize(tx:Db,ctx:RequestContext,input:{projectId:string;contentText:string;contentData:Record<string,unknown>}){
  await lockImportedProjectForReconstruction(tx,ctx,input.projectId);
  const service=createArtifactsService({db:tx,...deps});
  const artifact=await service.createArtifact(ctx,{projectId:input.projectId,title:'研究重建（AI 反推）',artifactType:'trend_analysis',stage:'research',origin:'reconstructed'});
  await service.createVersion(ctx,artifact.id,{contentText:input.contentText,contentData:input.contentData,changeSummary:'AI 历史反推重建',createdByType:'ai',origin:'reconstructed'});
  return {id:artifact.id};
 }};
}
