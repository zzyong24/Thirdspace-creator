import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import type {AiService} from '@creatoros/backend/modules/ai';
import type {AssetsService} from '@creatoros/backend/modules/assets';
import type {ProjectsService} from '@creatoros/backend/modules/projects';
import {createCreativeCanvasService,createCreativeCanvasTransport,CREATIVE_CANVAS_OP_IDS} from '@creatoros/backend/modules/creative-canvas';
import {readCommittedGeneratedAssetFile} from '@creatoros/backend/modules/assets';
import {createExecutionCandidateService,type ExecutionCandidateDeps} from '../../modules/ai/execution-candidate.service';
import {createAiTaskSubmissionService} from '../../modules/ai/ai-task-submission.service';
export interface CreativeCanvasRootPorts {
 /** 原AI owner，runtime resolver也必须绑定传入store，不捕获root Settings repo。 */
 ai(store:Db):Pick<AiService,'createTask'|'findTaskByAttempt'|'getTask'|'listResults'|'getAssetResultProof'>;
 assets(store:Db):Pick<AssetsService,'getAsset'|'readMediaFile'|'readImageReference'|'getAssetFileDownloadUrl'>;
 projects(store:Db):Pick<ProjectsService,'getProject'>;
 resolveTemplateRequirement?:(ctx:RequestContext,id:string,version:number,tx?:Db)=>Promise<boolean>;
 resolveCapability(ctx:RequestContext,capability:'image.generate'|'image.edit'|'video.generate'):Promise<{provider:string;model:string}>;
 wake(ctx:RequestContext,id:string):Promise<void>;
 projectCandidate:ExecutionCandidateDeps['projectCandidate'];
}
export function createCreativeCanvasRoot(db:Db,deps:{now:()=>string},ports:CreativeCanvasRootPorts){
 const proofFor=(store:Db)=>createExecutionCandidateService(store,{projectCandidate:ports.projectCandidate,committedAssets:{
  aiFor:ports.ai,assetsFor:tx=>({readCommittedGeneratedAssetFile:(c,id,raw)=>readCommittedGeneratedAssetFile(tx,c,id,raw)}),
 }});
 const service=createCreativeCanvasService(db,{now:deps.now,
  assertProject:async(c,id,tx=db,lock)=>{await ports.projects(tx).getProject(c,id,lock);},
  assertMediaAsset:async(c,id,type,fileId,tx=db)=>{const owner=ports.assets(tx),asset=await owner.getAsset(c,id);if(asset.assetType!==type||asset.status!=='active')throw Error('画布素材不是可用的所选媒体类型');const exact=fileId??asset.currentFileId;if(!exact)throw Error('素材没有实际文件');const file=await owner.readMediaFile(c,id,exact);return{fileId:exact,checksum:file.fileDigest};},
  assertReferenceAsset:async(c,id,tx=db)=>{const asset=await ports.assets(tx).getAsset(c,id);if(asset.assetType!=='image'||!['pending','active'].includes(asset.status))throw Error('参考素材不是可用图片');},
  getMediaFileDownloadUrl:(c,id,file)=>ports.assets(db).getAssetFileDownloadUrl(c,id,file),
  getReference:(c,id,file,tx=db)=>ports.assets(tx).readImageReference(c,id,file),
  readTask:(c,id,tx=db)=>ports.ai(tx).getTask(c,id),
  readTaskResults:(c,id,tx=db)=>ports.ai(tx).listResults(c,id),
  getCommittedAssetResult:(c,input,tx)=>proofFor(tx).getCommittedAssetResult(c,input),
  submitTask:async(c,input)=>{const ai=ports.ai(db),submissions=createAiTaskSubmissionService({findTaskByAttempt:ai.findTaskByAttempt,submit:ai.createTask}),task=await submissions.submit(c,{taskType:'asset.generate',attemptId:input.attemptId,inputData:input.inputData});await ports.wake(c,task.id);return{id:task.id};},
  resolveCapability:ports.resolveCapability,
  resolveTemplateRequirement:ports.resolveTemplateRequirement,
  findTaskByAttempt:(c,attempt)=>ports.ai(db).findTaskByAttempt(c,"asset.generate",attempt),
 });
 return {service,transport:createCreativeCanvasTransport(service),opIds:CREATIVE_CANVAS_OP_IDS,
  /** 原assetBusiness在准备前与原映射写事务内调用，不创建第二执行器。 */
  assertCanvasInput:service.assertFrozenGenerationInput,
  readAssetReference:(c:RequestContext,id:string,file:string)=>ports.assets(db).readImageReference(c,id,file),
 };
}
