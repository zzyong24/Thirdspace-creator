import {isDeepStrictEqual} from 'node:util';
import {ENDPOINTS} from '@creatoros/contract';
import type {Db} from '../../db';
import type {RequestContext,ProjectPreparationCandidate} from '@creatoros/contract';
import {chatWorkerInputSchema,workerToolResultReceiptSchema,agenticToolOutcomeSchema,chatToolProviderName,externalTaskToolCallSchema} from '@creatoros/contract/execution-worker';
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
import {ProjectPreparationInputRequired} from '../../modules/projects/project-preparation-input-required';
import {buildProjectPreparationBriefSeed} from './project-preparation-brief-seed';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const briefFieldsSchema=ENDPOINTS.getProject.response.shape.briefDetail.unwrap().pick({targetAudience:true,contentGoal:true,contentFormat:true,coreMessage:true,durationEstimate:true,successCriteria:true}).strict();
const briefSuggestionSchema=briefFieldsSchema.refine(value=>Object.keys(value).length>0&&Object.values(value).every(text=>typeof text==='string'&&text.trim().length>0));
export function createProjectPreparationChat(db:Db,deps:ServiceDeps&{assemble(ctx:RequestContext,snapshot:ChatTurnSnapshot,options:ChatPrepareOptions):Promise<ChatTurnAssembly>}){
 const leases=createExecutionLeaseService(db,deps);
 return {
  async submit(ctx:RequestContext,input:Parameters<ProjectPreparationDeps['dispatch']>[1]){
   const {claim,project,step}=input,key=`${step}:${Number(object(claim.payload).inputRevision??0)}`;
   const anchor=await leases.withLease({executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',async({tx,task})=>{
    if(task.kind!=='project_preparation'||task.ownerId!==project.id||task.userId!==ctx.userId||task.accountId!==(ctx.accountId??null)||task.groupId!==(ctx.groupId??null))throw new ConflictError('准备编导归属不符');
    const cp=object(task.checkpoint),submissions=object(cp.chatSubmissions),prior=object(submissions[key]);
    if(typeof prior.conversationId==='string'&&typeof prior.sourceMessageId==='string')return {conversationId:prior.conversationId,sourceMessageId:prior.sourceMessageId};
    const content=buildProjectPreparationBriefSeed(project);
    const repo=createAiRepository(tx as unknown as Db,{...deps,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,membershipVersion:ctx.membershipVersion});
    const conversation=await repo.createConversation({title:'项目准备资料候选',projectId:project.id,scope:`project:${project.id}`});
    const message=await repo.createMessage(conversation.id,{role:'user',content,attachments:[],modelMetadata:{}});
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
   const partial=task.status==='partial';
   if(task.kind!=='ai_task'||!['succeeded','partial'].includes(task.status)||object(host.chatContext).projectId!==projectId)throw new ConflictError('项目编导尚无完成候选回执');
   const project=await createProjectRepository(store).get(ctx,projectId),values=[],calls=await states.calls(ctx,task.id);let hasValidProposal=false,needsInput=false,unsafePartial=partial&&calls.some(call=>call.status!=='settled');
   const frozen=chatWorkerInputSchema.safeParse(object(task.payload).modelInput),frozenTools=frozen.success?frozen.data.tools:[];
   for(const call of calls){
    if(partial&&['model','external_agent'].includes(call.kind))continue;
    if(call.status!=='settled'||!call.resultText){if(partial)unsafePartial=true;continue;}
    let raw:unknown;try{raw=JSON.parse(call.resultText);}catch{if(partial)unsafePartial=true;continue;}
    let output:unknown,toolName:string;
    if(call.kind==='tool'){
     const receipt=workerToolResultReceiptSchema.safeParse(raw);if(!receipt.success){if(partial)unsafePartial=true;continue;}
     toolName=frozenTools.find(definition=>chatToolProviderName(definition.name)===receipt.data.toolName)?.name??(receipt.data.toolName===chatToolProviderName('brief.fill')?'brief.fill':'');
     output=receipt.data.output;
    }else if(call.kind==='external_tool'){
     const identity=externalTaskToolCallSchema.safeParse(call.providerResult);
     if(!identity.success||identity.data.turnCallId!==call.parentCallId||!calls.some(parent=>parent.id===identity.data.turnCallId&&parent.kind==='external_agent'&&parent.parentCallId===null&&parent.status==='settled')){if(partial)unsafePartial=true;continue;}
     toolName=identity.data.toolName;output=raw;
    }else {if(partial)unsafePartial=true;continue;}
    const outcome=agenticToolOutcomeSchema.safeParse(output);if(!outcome.success){if(partial)unsafePartial=true;continue;}
    if(partial){
     const definition=frozenTools.find(value=>value.name===toolName);
     if(!definition){unsafePartial=true;continue;}
     // 成功且无副作用的已冻结读取可以保留；其它错误/交付仍不能借空输入绕过partial。
     if(toolName!=='brief.fill'){
      if(definition.effect==='none'&&outcome.data.status==='ok'&&outcome.data.sideEffect==='none')continue;
      unsafePartial=true;continue;
     }
     if(definition.effect!=='proposal'){unsafePartial=true;continue;}
    }else if(toolName!=='brief.fill')continue;
    const data=object(outcome.data.data);if(data.kind!=='brief.fill'){if(partial)unsafePartial=true;continue;}
    if(outcome.data.status==='error'&&outcome.data.sideEffect==='none'&&outcome.data.error?.code==='invalid_input'&&outcome.data.error.retryable===false){needsInput=true;continue;}
    // partial仅能报告已核实的空输入错误；任何其它回执或交付都保持原部分结果阻断。
    if(partial){unsafePartial=true;continue;}
    if(outcome.data.status!=='ok'||outcome.data.sideEffect!=='proposal')continue;
    const fields=briefFieldsSchema.safeParse(data.suggestion);
    // SEMANTIC_BOUNDARY_ALLOW: 仅识别合法字段结构为空；不根据内容词语判断质量或编造候选。
    if(fields.success&&Object.values(fields.data).every(value=>typeof value==='string'&&!value.trim())){needsInput=true;continue;}
    const suggestion=briefSuggestionSchema.safeParse(data.suggestion);if(!suggestion.success)continue;
    hasValidProposal=true;
    // SEMANTIC_BOUNDARY_ALLOW: 只按合法建议字段与当前保存值精确去重，不判断资料语义或替模型选择内容。
    if(Object.entries(suggestion.data).every(([key,value])=>isDeepStrictEqual(object(project.briefDetail)[key],value)))continue;
    const content:PreparationContent={kind:'brief',brief:project.brief,briefDetail:{...object(project.briefDetail),...suggestion.data}};
    const sourceDigest=projectIntakeDigest({taskId:task.id,callId:call.id,inputDigest:call.inputDigest,resultText:call.resultText});
    values.push({candidate:{id:`preparation-brief:${call.id}`,kind:'brief' as const,sourceTaskId:task.id,transformId:null,checkpointPath:`calls.${call.id}.resultText`,sourceDigest,artifactDigest:projectIntakeDigest(content),status:'pending' as const,acceptanceReceipt:null},content});
   }
   if(partial&&(!needsInput||unsafePartial))throw new ConflictError('原编导仅有部分结果，请保留原记录核对');
   if(!hasValidProposal&&needsInput)throw new ProjectPreparationInputRequired();
   if(!hasValidProposal)throw new ConflictError('编导未返回可采纳的资料候选，请查看原会话');return values;
  },
 };
}
