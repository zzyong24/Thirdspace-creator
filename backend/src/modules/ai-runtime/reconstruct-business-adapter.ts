import type {RequestContext} from '@creatoros/contract';
import {assembleCreativeContext,type ContextDeps} from './creative-context';
import type {StructuredBusinessAdapter} from './structured-business-execution.service';
import {reconstructFacets} from './reconstruct-content';
export interface ReconstructPreparationPorts extends ContextDeps {
 getProjectSource(ctx:RequestContext,projectId:string):Promise<string|null>;
 getTranscript(ctx:RequestContext,projectId:string):Promise<string|null>;
 getMetricsSummary(ctx:RequestContext,projectId:string):Promise<string>;
}
/** 只冻结当前账号历史作品的真实来源；模型与重建落稿分别归 Worker 和完成事务。 */
export function createReconstructBusinessAdapter(deps:ReconstructPreparationPorts):StructuredBusinessAdapter {
 return {skillId:'reconstruct.project',capability:'reconstruct.project',async prepare(ctx,task){
  const projectId=task.projectId;
  if(!projectId || (task.inputData.projectId!==undefined&&task.inputData.projectId!==projectId))throw new Error('历史重建项目与任务归属不符');
  if(await deps.getProjectSource(ctx,projectId)!=='imported')throw new Error("仅 source='imported' 的历史作品可重建");
  const transcript=await deps.getTranscript(ctx,projectId);
  if(!transcript?.trim())throw new Error('项目无逐字稿，无法反推重建');
  const metrics=await deps.getMetricsSummary(ctx,projectId),context=await assembleCreativeContext(ctx,{projectId,topic:''},deps);
  return {...reconstructFacets(context,transcript,metrics,context.topic.title??''),__reconstructProject:JSON.stringify({projectId})};
 },project(){throw new Error('历史重建须通过非候选完成事务');}};
}
