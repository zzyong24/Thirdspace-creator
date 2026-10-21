import {isDeepStrictEqual} from 'node:util';
import {ENDPOINTS} from '@creatoros/contract';
import type {Db} from '../../db';
import type {RequestContext,ProjectPreparationCandidate} from '@creatoros/contract';
import {workerToolResultReceiptSchema,agenticToolOutcomeSchema,chatToolProviderName,externalTaskToolCallSchema} from '@creatoros/contract/execution-worker';
import {createAiRepository} from '../../modules/ai/ai.repository';
import {createChatTurnSubmissionService,type ChatTurnAssembly,type ChatTurnSnapshot,type ChatPrepareOptions} from '../../modules/ai/chat-turn-submission.service';
import {createExecutionLeaseService} from '../../modules/execution/execution-lease.service';
import {createPersistentTaskService} from '../../modules/execution/persistent-task.service';
import {createProjectPreparationStateService} from '../../modules/execution/project-preparation-state.service';
import {createProjectRepository} from '../../modules/projects/projects.repository';
import type {ServiceDeps} from '../../modules/projects/projects.service';
import type {ProjectPreparationDeps,PreparationContent} from '../../modules/projects/project-preparation.service';
import {projectIntakeDigest} from '../../modules/projects/project-intake.service';
import {ConflictError} from '../../errors';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const briefSuggestionSchema=ENDPOINTS.getProject.response.shape.briefDetail.unwrap().pick({targetAudience:true,contentGoal:true,contentFormat:true,coreMessage:true,durationEstimate:true,successCriteria:true}).strict().refine(value=>Object.keys(value).length>0&&Object.values(value).every(text=>typeof text==='string'&&text.trim().length>0));
export function createProjectPreparationChat(db:Db,deps:ServiceDeps&{assemble(ctx:RequestContext,snapshot:ChatTurnSnapshot,options:ChatPrepareOptions):Promise<ChatTurnAssembly>}){
 const leases=createExecutionLeaseService(db,deps);
 return {
  async submit(ctx:RequestContext,input:Parameters<ProjectPreparationDeps['dispatch']>[1]){
   const {claim,project,step}=input,key=`${step}:${Number(object(claim.payload).inputRevision??0)}`;
   const anchor=await leases.withLease({executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',async({tx,task})=>{
    if(task.kind!=='project_preparation'||task.ownerId!==project.id||task.userId!==ctx.userId||task.accountId!==(ctx.accountId??null)||task.groupId!==(ctx.groupId??null))throw new ConflictError('准备编导归属不符');
    const cp=object(task.checkpoint),submissions=object(cp.chatSubmissions),prior=object(submissions[key]);
    if(typeof prior.conversationId==='string'&&typeof prior.sourceMessageId==='string')return {conversationId:prior.conversationId,sourceMessageId:prior.sourceMessageId};
    const repo=createAiRepository(tx as unknown as Db,{...deps,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,membershipVersion:ctx.membershipVersion});
    const conversation=await repo.createConversation({title:'项目准备资料候选',projectId:project.id,scope:'project'});
    const message=await repo.createMessage(conversation.id,{role:'user',content:'请根据本项目已有资料，用 brief.fill 提出资料补全候选。保留已有事实，缺少的内容明确留空，等待我采纳。',attachments:[],modelMetadata:{}});
    const anchor={conversationId:conversation.id,sourceMessageId:message.id};
    await createPersistentTaskService(tx as unknown as Db,deps).saveCheckpoint({taskId:task.id,...claim.lease,checkpoint:{...cp,chatSubmissions:{...submissions,[key]:anchor}}});return anchor;
   });
   const result=await createChatTurnSubmissionService(db,{...deps,assemble:async(context,snapshot,options)=>{
    const assembled=await deps.assemble(context,snapshot,options),reads=new Set(['history.read','skill.read','tool.result.read','creatoros.guide']);
    // SEMANTIC_BOUNDARY_ALLOW: 依据冻结工具副作用与明确能力白名单收窄权限，不根据模型文字猜测意图。
    const tools=assembled.tools.filter(tool=>(tool.name==='brief.fill'&&tool.effect==='proposal')||(tool.effect==='none'&&(tool.name.startsWith('context.')||reads.has(tool.name))));
    if(!tools.some(tool=>tool.name==='brief.fill'))throw new ConflictError('资料候选工具不可用');
    const {tools:_tools,workbenchCapabilities:_capabilities,workbenchPlatform:_platform,forcedTool:_forced,forcedToolSequence:_sequence,...base}=assembled;
    return {...base,tools,workbenchCapabilities:[],forcedTool:'brief.fill'};
   },assertProject:(c,id)=>createProjectRepository(db).get(c,id)}).submit(ctx,anchor,{claim,referenceId:null});
   return {childTaskId:result.executionTaskId,businessTaskId:result.taskId};
  },
  async read(ctx:RequestContext,projectId:string,childTaskId:string,store:Db):Promise<Array<{candidate:ProjectPreparationCandidate;content:PreparationContent}>>{
   const states=createProjectPreparationStateService(store),task=await states.read(ctx,childTaskId),host=object(object(task.payload).hostContext);
   if(task.kind!=='ai_task'||task.status!=='succeeded'||object(host.chatContext).projectId!==projectId)throw new ConflictError('项目编导尚无完成候选回执');
   const project=await createProjectRepository(store).get(ctx,projectId),values=[],calls=await states.calls(ctx,task.id);let hasValidProposal=false;
   for(const call of calls){
    if(call.status!=='settled'||!call.resultText)continue;
    let raw:unknown;try{raw=JSON.parse(call.resultText);}catch{continue;}
    let output:unknown;
    if(call.kind==='tool'){
     const receipt=workerToolResultReceiptSchema.safeParse(raw);if(!receipt.success||receipt.data.toolName!==chatToolProviderName('brief.fill'))continue;
     output=receipt.data.output;
    }else if(call.kind==='external_tool'){
     const identity=externalTaskToolCallSchema.safeParse(call.providerResult);
     if(!identity.success||identity.data.toolName!=='brief.fill'||identity.data.turnCallId!==call.parentCallId||!calls.some(parent=>parent.id===identity.data.turnCallId&&parent.kind==='external_agent'&&parent.parentCallId===null&&parent.status==='settled'))continue;
     output=raw;
    }else continue;
    const outcome=agenticToolOutcomeSchema.safeParse(output);if(!outcome.success||outcome.data.status!=='ok'||outcome.data.sideEffect!=='proposal')continue;
    const data=object(outcome.data.data),suggestion=briefSuggestionSchema.safeParse(data.suggestion);if(data.kind!=='brief.fill'||!suggestion.success)continue;
    hasValidProposal=true;
    // SEMANTIC_BOUNDARY_ALLOW: 只按合法建议字段与当前保存值精确去重，不判断资料语义或替模型选择内容。
    if(Object.entries(suggestion.data).every(([key,value])=>isDeepStrictEqual(object(project.briefDetail)[key],value)))continue;
    const content:PreparationContent={kind:'brief',brief:project.brief,briefDetail:{...object(project.briefDetail),...suggestion.data}};
    const sourceDigest=projectIntakeDigest({taskId:task.id,callId:call.id,inputDigest:call.inputDigest,resultText:call.resultText});
    values.push({candidate:{id:`preparation-brief:${call.id}`,kind:'brief' as const,sourceTaskId:task.id,transformId:null,checkpointPath:`calls.${call.id}.resultText`,sourceDigest,artifactDigest:projectIntakeDigest(content),status:'pending' as const,acceptanceReceipt:null},content});
   }
   if(!hasValidProposal)throw new ConflictError('编导未返回可采纳的资料候选，请查看原会话');return values;
  },
 };
}
