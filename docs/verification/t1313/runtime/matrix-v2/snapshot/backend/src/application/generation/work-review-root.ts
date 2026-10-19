import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import type {AiService} from '@creatoros/backend/modules/ai';
import type {ArtifactsService} from '@creatoros/backend/modules/artifacts';
import type {PositioningService} from '@creatoros/backend/modules/positioning';
import type {WorkMaterialsService} from '@creatoros/backend/modules/work-compositions';
import {createWorkReviewsService,createWorkReviewsTransport,createWorkReviewBusinessAdapter,createWorkReviewTaskPorts,WORK_REVIEW_OP_IDS} from '@creatoros/backend/modules/review';
import type {createWorkSourceService} from '../../modules/work-compositions/work-source.service';
import {createWorkReviewReader,type ReviewOwners} from '@creatoros/backend/modules/review';
import {createProductionReviewFiles,type FrozenProductionFilePort} from '../../modules/review/production-review-files';
export interface WorkReviewRootPorts {
 /** 同tx原owner；不能捕获root db。本工厂不创建第二AI队列。 */
 owners(tx:Db):ReviewOwners;
 artifacts(tx:Db):Pick<ArtifactsService,'getArtifact'>;
 ai(tx:Db):Pick<AiService,'createTask'|'findTaskByAttempt'|'getTask'|'getTaskExecutionRuntime'>;
 positioning(tx:Db):Pick<PositioningService,'getStatement'>;
 materials(tx:Db):Pick<WorkMaterialsService,'dependencies'>;
 sources:Pick<ReturnType<typeof createWorkSourceService>,'read'>;
 frozenProductionFiles:FrozenProductionFilePort;
 /** 原wakeBusinessTask(ctx,id,'work.review')，事务commit以后调用。 */
 wake(ctx:RequestContext,id:string):Promise<void>;
}
export function createWorkReviewRoot(db:Db,deps:{now:()=>string;nextId:(prefix:string)=>string},ports:WorkReviewRootPorts){
 const readCurrent=createWorkReviewReader({owners:ports.owners,
  async lockMember(ctx,projectId,member,tx){const o=ports.owners(tx);let artifactId:string|undefined;
   if(member.kind==='moments'){const value=await o.moments.get(ctx,member.momentsId);if(value.projectId!==projectId)throw Error('REVIEW_PROJECT_MISMATCH');artifactId=value.artifactId;}
   else if(member.kind==='article')artifactId=(await o.articles.getArticle(ctx,member.outputId)).artifactId;
   else if(member.kind==='image')artifactId=(await o.graphicPosts.getGraphicPost(ctx,member.outputId)).artifactId;
   else{await o.production.getEditor(ctx,member.outputId,true);artifactId=(await o.outputScripts.getSavedScript(ctx,member.outputId))?.artifactId;}
   if(artifactId)await ports.artifacts(tx).getArtifact(ctx,artifactId,true);
   // 读取器会在锁后重新读正式稿面，不使用锁前的值。
  },
  lockPublication:async(ctx,id,tx)=>{await ports.owners(tx).publishing.getPublication(ctx,id,true);},
  dependencies:(ctx,id,tx)=>ports.materials(tx).dependencies(ctx,id),
  readSource:(ctx,id,ref,tx)=>ports.sources.read(ctx,id,ref,tx),
  readRule:(ctx,ref,tx)=>ports.positioning(tx).getStatement(ctx,ref.versionId),
  productionFiles:createProductionReviewFiles(ports.frozenProductionFiles),
 });
 const service=createWorkReviewsService({db,...deps,ports:{...createWorkReviewTaskPorts(ports.ai,ports.wake),readCurrent,
  async assertComposition(ctx,id,tx,forUpdate=false){const owner=ports.owners(tx).compositions;await owner.assertCompositionOwned(ctx,id,forUpdate);return{projectId:(await owner.get(ctx,id)).projectId};}
 }});
 return {service,readCurrent,transport:createWorkReviewsTransport(()=>service),opIds:WORK_REVIEW_OP_IDS,
  businessAdapters:{'work.review':createWorkReviewBusinessAdapter(()=>service)},
 };
}
