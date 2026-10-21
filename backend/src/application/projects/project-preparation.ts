import {createHash} from 'node:crypto';
import type {Db} from '../../db';
import {ConflictError} from '../../errors';
import type {RequestContext,ProjectPreparationCandidate,ProjectSourceReference} from '@creatoros/contract';
import type {ServiceDeps} from '../../modules/projects/projects.service';
import {createProjectPreparationService,type ProjectPreparationDeps,type PreparationContent} from '../../modules/projects/project-preparation.service';
import {createProjectPreparationGenerationService} from '../../modules/projects/project-preparation-generation.service';
import {createProjectPreparationStateService} from '../../modules/execution/project-preparation-state.service';
import {createIntelligenceService,type IntelligenceService} from '../../modules/intelligence/intelligence.service';
import {createPersistentTaskService,type PersistentTaskService} from '../../modules/execution/persistent-task.service';
import {createArtifactsService} from '../../modules/artifacts/artifacts.service';
import {createProjectRepository} from '../../modules/projects/projects.repository';
import {createTranscriptArtifactService} from '../../modules/projects/transcript-artifact.service';
import {projectIntakeDigest,findImportedProjectText} from '../../modules/projects/project-intake.service';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const hash=(text:string)=>`sha256:${createHash('sha256').update(text).digest('hex')}`;
type DispatchInput=Parameters<ProjectPreparationDeps['dispatch']>[1];
export function createProjectPreparationApplication(db:Db,deps:ServiceDeps&{
 tasks:PersistentTaskService;intelligence:IntelligenceService;
 readTranscriptFile?:(ctx:RequestContext,input:{assetId:string;assetFileId:string;format:'txt'|'md'|'srt'|'vtt'},store:Db)=>Promise<{text:string;fileName:string}>;
 submitProjectTranscript(ctx:RequestContext,input:DispatchInput,referenceId:string):Promise<{childTaskId:string;businessTaskId:string;shared:boolean}>;
 submitBrief(ctx:RequestContext,input:DispatchInput):Promise<{childTaskId:string;businessTaskId:string}>;
 readBrief(ctx:RequestContext,projectId:string,childTaskId:string,store:Db):Promise<Array<{candidate:ProjectPreparationCandidate;content:PreparationContent}>>;
}){
 const generation=createProjectPreparationGenerationService(db,deps),states=createProjectPreparationStateService(db);
 const artifactsFor=(store:Db)=>createArtifactsService({db:store,...deps,assertProjectOwned:(ctx,id)=>createProjectRepository(store).get(ctx,id)});
 const notRequired=(reasonCode:string)=>({status:'not_required' as const,reasonCode});
 const waiting=(reasonCode:string,message:string)=>({status:'waiting_user' as const,reasonCode,message});
 async function sourceArtifacts(ctx:RequestContext,projectId:string,reference?:ProjectSourceReference){
  const artifacts=artifactsFor(db),sources=[];
  for(const artifact of await artifacts.listProjectArtifacts(ctx,projectId)){
   const version=(await artifacts.listVersions(ctx,artifact.id)).find(v=>v.id===artifact.currentVersionId),data=object(version?.contentData);
   // SEMANTIC_BOUNDARY_ALLOW: 按用户当前来源修订的精确hash筛选；不按标题或正文选择创作材料。
   if(version?.contentText.trim()&&data.purpose==='project_preparation_source'&&data.projectId===projectId&&(!reference||(data.referenceId===reference.id&&reference.transcriptHash===hash(version.contentText))))sources.push({artifact,version});
  }
  return sources;
 }
 async function read(ctx:RequestContext,projectId:string,candidate:ProjectPreparationCandidate,store:Db){
  const child=await createProjectPreparationStateService(store).read(ctx,candidate.sourceTaskId);
  if(child.kind==='ai_task')return (await deps.readBrief(ctx,projectId,child.id,store)).find(value=>value.candidate.id===candidate.id)?.content??null;
  if(child.ownerType==='project')return (await createProjectPreparationGenerationService(store,{...deps,tasks:createPersistentTaskService(store,deps)}).collect(ctx,projectId,child.id)).find(value=>value.candidate.id===candidate.id)?.content??null;
  const source=await createIntelligenceService(store,{...deps,tasks:createPersistentTaskService(store,deps)}).readProjectPreparationCandidate(ctx,child.id);
  const refs=await preparation.references(ctx,projectId,store);
  if(!refs.some(ref=>ref.sourceKind==='intelligence_item'&&ref.itemId===source.itemId&&ref.snapshotId===source.snapshotId)||source.sourceDigest!==candidate.sourceDigest||source.transformId!==candidate.transformId)throw new ConflictError('候选原始来源引用已变化');
  return {kind:'draft' as const,text:source.text};
 }
 const preparation=createProjectPreparationService(db,{...deps,
  async dispatch(ctx,input){
   const {project,references,step,claim}=input,payload=object(claim.payload),revision=Number(payload.inputRevision??0);
   const reference=references.length===1?references[0]:undefined;
   const parent={taskId:claim.task.id,...claim.lease,preparationReferenceId:reference?.id??null};
   try{
    if(step==='brief'){const child=await deps.submitBrief(ctx,input);return {status:'child',...child,shared:false,sourceDigest:projectIntakeDigest([project.id,claim.task.id,step,revision])};}
    if(references.length>1)return waiting('SOURCE_SELECTION_REQUIRED','有多个来源，请在编导中明确本次采用的素材');
    if(step==='transcript'){
     if(reference?.sourceKind==='intelligence_item'){
      const detail=await deps.intelligence.getItem(ctx,reference.itemId);
      if(detail.transcript.status==='done'&&detail.transcript.text?.trim())return {status:'done',reasonCode:'TRANSCRIPT_ALREADY_AVAILABLE'};
      if(detail.transcript.executionTaskId){await states.reuseTranscript(ctx,{parentClaim:claim,referenceId:reference.id,childTaskId:detail.transcript.executionTaskId,now:deps.now()});return {status:'child',childTaskId:detail.transcript.executionTaskId,businessTaskId:null,shared:true,sourceDigest:reference.sourceDigest??projectIntakeDigest(reference)};}
      const queued=await deps.intelligence.enqueueTranscripts(ctx,{itemIds:[reference.itemId],idempotencyKey:`preparation:${claim.task.id}:transcript:${revision}`},parent),child=queued.tasks[0];
      if(!child)return waiting('TRANSCRIPT_REQUIRES_INPUT','来源转写无法启动，请在项目内补充逐字稿');
      return {status:'child',childTaskId:child.id,businessTaskId:null,shared:false,sourceDigest:reference.sourceDigest??projectIntakeDigest(reference)};
     }
     const platform=object(project.platformRef);
     if(reference?.sourceKind==='platform_work'&&platform.platform==='douyin'&&platform.externalId===reference.externalId){if((await sourceArtifacts(ctx,project.id,reference)).length)return {status:'done',reasonCode:'TRANSCRIPT_ALREADY_AVAILABLE'};const child=await deps.submitProjectTranscript(ctx,input,reference.id);return {status:'child',...child,sourceDigest:reference.sourceDigest??projectIntakeDigest(reference)};}
     return notRequired('NO_SUPPORTED_TRANSCRIPTION_SOURCE');
    }
    if(reference?.sourceKind==='intelligence_item'){
     const detail=await deps.intelligence.getItem(ctx,reference.itemId);
     if(detail.transcript.status!=='done'||!detail.transcript.text?.trim())return waiting('SOURCE_BODY_REQUIRED','请先完成来源转写或补充逐字稿');
     const positioningVersionId=typeof payload.positioningVersionId==='string'?payload.positioningVersionId:undefined;
     const result=await deps.intelligence.startTopicPreview(ctx,{itemId:reference.itemId,sourceSnapshotId:reference.snapshotId,positioningVersionId,strategyBacked:true,idempotencyKey:`preparation:${claim.task.id}:source_draft:${revision}`},parent);
     return {status:'child',childTaskId:result.task.id,businessTaskId:null,shared:false,sourceDigest:reference.sourceDigest??projectIntakeDigest(reference),transformId:result.transform.id};
    }
    if(reference?.sourceKind==='platform_work'&&!reference.transcriptHash){
     const imported=await findImportedProjectText(db,deps,ctx,project.id);
     if(imported){
      const source={kind:'imported_text' as const,projectId:project.id,intakeId:imported.intakeId,contentText:imported.contentText,contentHash:imported.contentHash,title:project.title,authorName:null,url:reference.url};
      const child=await generation.reserve(ctx,{parentClaim:claim,projectId:project.id,referenceId:reference.id,inputRevision:revision,target:{ownerType:'project',projectId:project.id,source,generationMode:'strategy_backed',transcript:{text:imported.contentText,hash:imported.contentHash}}});
      return {status:'child',...child,businessTaskId:null,shared:false};
     }
    }
    const sources=await sourceArtifacts(ctx,project.id,reference);
    if(!reference&&!sources.length)return notRequired('NO_EXTERNAL_SOURCE');
    if(sources.length!==1)return waiting('SOURCE_BODY_REQUIRED','请在项目内提供本次使用的来源正文');
    const selected=sources[0]!,contentHash=hash(selected.version.contentText),source={kind:'project_artifact' as const,projectId:project.id,artifactId:selected.artifact.id,artifactVersion:selected.version.versionNumber,contentHash,title:selected.artifact.title,authorName:null,url:reference?.url??null};
    const child=await generation.reserve(ctx,{parentClaim:claim,projectId:project.id,referenceId:reference?.id??null,inputRevision:revision,target:{ownerType:'project',projectId:project.id,source,generationMode:'strategy_backed',transcript:{text:selected.version.contentText,hash:contentHash}}});
    return {status:'child',...child,businessTaskId:null,shared:false};
   }catch(error){// SEMANTIC_BOUNDARY_ALLOW: 仅匹配宿主确定的配置错误协议码，不解释模型文本。
    const code=(error as {details?:{domainCode?:string};code?:string}).details?.domainCode??(error as {code?:string}).code??(error instanceof Error?error.message:undefined);
    if(['MODEL_NOT_CONFIGURED','MODEL_CREDENTIAL_UNAVAILABLE','MODEL_CONFIGURATION_UNAVAILABLE','MODEL_ROUTE_NOT_FROZEN'].includes(code??''))return waiting('CONFIGURATION_REQUIRED','请完成模型配置后继续原准备任务');throw error;
   }
  },
  async collect(ctx,{project,step,childTaskId}){
   if(step.name==='transcript')return [];
   const child=await states.read(ctx,childTaskId);
   if(child.kind==='ai_task')return deps.readBrief(ctx,project.id,childTaskId,db);
   if(child.ownerType==='project')return generation.collect(ctx,project.id,childTaskId);
   const source=await deps.intelligence.readProjectPreparationCandidate(ctx,childTaskId),content:PreparationContent={kind:'draft',text:source.text};
   return [{candidate:{id:`preparation-draft:${childTaskId}`,kind:'draft',sourceTaskId:childTaskId,transformId:source.transformId,checkpointPath:null,sourceDigest:source.sourceDigest,artifactDigest:projectIntakeDigest(content),status:'pending',acceptanceReceipt:null},content}];
  },
  async readCandidate(ctx,projectId,candidate,store){const content=await read(ctx,projectId,candidate,store);if(!content)throw new ConflictError('原候选正文不可读取');return content;},
  async provideTranscript(ctx,input,store){
   const file=input.inputMode==='file'?await deps.readTranscriptFile?.(ctx,input,store):undefined;
   if(input.inputMode==='file'&&!file)throw new ConflictError('来源附件读取端口不可用');
   const rawText=input.inputMode==='paste'?input.text:file!.text;
   const reference=(await preparation.references(ctx,input.projectId,store)).find(ref=>ref.id===input.referenceId);if(!reference)throw new ConflictError('项目来源不存在');
   if(reference.sourceKind==='intelligence_item'){
    const intelligence=createIntelligenceService(store,{...deps,tasks:createPersistentTaskService(store,deps)});await intelligence.uploadManualTranscript(ctx,{itemId:reference.itemId,inputMode:input.inputMode,text:rawText,...(input.inputMode==='file'?{format:input.format,fileName:file!.fileName}:{})});
    const actual=await intelligence.getProjectIntakeSource(ctx,reference.itemId,reference.snapshotId);return {sourceDigest:actual.sourceDigest,transcriptHash:actual.transcriptHash};
   }
   if(reference.platform!=='douyin')throw new ConflictError('此平台来源暂不支持手工逐字稿');
   const text=rawText.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(!text||text.length>500000||text.includes('\uFFFD'))throw new ConflictError('逐字稿为空、过大或编码损坏');
   await createTranscriptArtifactService({db:store,...deps}).ensurePreparation(ctx,{projectId:input.projectId,referenceId:reference.id,parentTaskId:input.parentTaskId,executionTaskId:`manual:${input.parentTaskId}:${input.submissionKey}`,awemeId:reference.externalId,transcript:text});
   return {sourceDigest:hash(text),transcriptHash:hash(text)};
  },
 });return {preparation,generation};
}
