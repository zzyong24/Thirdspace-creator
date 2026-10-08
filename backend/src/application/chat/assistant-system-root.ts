import {z} from 'zod';
import {createHash} from 'node:crypto';
import {ENDPOINTS,type Transport,creatorProfileResource,scheduledJobResource} from '@creatoros/contract';
import type {ProjectsService} from '../../modules/projects';
import type {CandidateService} from '../../modules/candidate';
import type {ArtifactsService} from '../../modules/artifacts';
import type {ArticlesService} from '../../modules/articles';
import type {GraphicPostsService} from '../../modules/graphic-posts';
import type {KnowledgeService} from '../../modules/knowledge';
import type {IntelligenceService} from '../../modules/intelligence';
import type {PositioningService} from '../../modules/positioning';
import type {AccountGroupService,PlatformAccountService,AccountBindingService} from '../../modules/platform-account';
import type {ContentCalendarService} from '../../modules/content-calendar';
import type {SchedulingService} from '../../modules/scheduling';
import type {SettingsService} from '../../modules/settings';
import type {createAssetTagProposalService} from '../../modules/taxonomy';
import {aiTasks,executionTasks,and,eq,type Db} from '@creatoros/backend';
import {isDeepStrictEqual} from 'node:util';
import {workspaceFilter} from '../../workspace-scope';
import type {createCreativeCanvasRoot} from '../generation/creative-canvas-root';
import {assistantReadEndpoints,assistantReadInputSchema,assistantActionProposeInputSchema,assistantActionCandidateSchema,canvasCreateCandidateSchema,canvasCreateProposalInputSchema,assistantFeaturesInputSchema,canvasGenerateProposalInputSchema,canvasGenerateUnsignedCandidateSchema,canvasGenerateCandidateSchema,canvasProposalAdmissionSchema,type CanvasProposalAdmission,type RequestContext,type AssistantActionInput,type AssistantProposalSource} from '@creatoros/contract';
import {createChatProposalSourceService,createAssistantActionAdoptionService,createAssistantActionTransport} from '../../modules/ai';
import {createCreativeCanvasService} from '../../modules/creative-canvas';
import {buildChatTools,type ChatToolDeps} from '../../modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../modules/ai-runtime/chat-tool-definitions';
import type {ChatSystemToolPorts} from '../../modules/ai-runtime/chat-system-tool-host';
import {ConflictError} from '../../modules/execution/execution.errors';

type Host=Parameters<ChatSystemToolPorts['propose']>[2];
type Source=Awaited<ReturnType<ReturnType<typeof createChatProposalSourceService>['read']>>;
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
export type AssistantActionOwner={
 prepare(ctx:RequestContext,action:AssistantActionInput,host:Host):Promise<Record<string,z.infer<ReturnType<typeof z.json>>>>;
 adopt(ctx:RequestContext,action:AssistantActionInput,observations:Record<string,z.infer<ReturnType<typeof z.json>>>,source:AssistantProposalSource,tx:Tx):Promise<{operationId:string;result:unknown;status:'adopted'|'accepted';afterCommit?:()=>Promise<void>}>;
 resolveScope?:(ctx:RequestContext,action:AssistantActionInput,observations:Record<string,z.infer<ReturnType<typeof z.json>>>)=>Promise<RequestContext>;
};
export interface AssistantSystemRootPorts {
 canvas:Pick<ReturnType<typeof createCreativeCanvasService>,'prepareCreateProposal'|'createWithDocumentInTransaction'>;
 /** 调用已审固定原读取合同的应用service port，不收自由path/method或凭据。 */
 read:(ctx:RequestContext,endpoint:typeof assistantReadEndpoints[string],input:{params?:unknown;query?:unknown})=>Promise<{data:unknown;meta?:unknown}>;
 actions:Partial<Record<AssistantActionInput['kind'],AssistantActionOwner>>;
 /** 只读原标签owner的观察版本；不创建候选、标签或采纳事实。 */
 assetTags?:Pick<ReturnType<typeof createAssetTagProposalService>,'prepare'>;
 generation?:NonNullable<ReturnType<typeof createCreativeCanvasRoot>['generation']>;
}
type ActionServices={
 projects:ProjectsService;candidates:CandidateService;artifacts:ArtifactsService;
 articles:ArticlesService;graphicPosts:GraphicPostsService;knowledge:KnowledgeService;
  intelligence:Pick<IntelligenceService,'createCollection'|'readCollection'>;
 positioning:PositioningService;groups:AccountGroupService;accounts:PlatformAccountService;
 calendar:ContentCalendarService;scheduling:SchedulingService;settings:SettingsService;
 /** 仅原模块transport，保留原DTO及公开写入的来源清理。 */
 writes:{projects:Transport;artifacts:Transport;knowledge:Transport;publishing:Transport};
};
export interface AssistantActionOwnerPorts{
 forStore:(store:Db,deferred?:Array<()=>Promise<void>>)=>ActionServices;
 assetTags:ReturnType<typeof createAssetTagProposalService>;
 /** 原唯一扫码实例，事务只预约，提交后才唤醒。 */
 binding:Pick<AccountBindingService,'reserveInTransaction'|'wakeReserved'>;
 afterCommit?:(ctx:RequestContext,action:AssistantActionInput,result:unknown)=>Promise<void>;
}
const actionKinds:AssistantActionInput['kind'][]=['project.create','topic.create','topic.promote','script.patch','article.save','graphic.save','asset.tag','knowledge.create','knowledge.folder.create','radar.collection.create','positioning.save','group.create','group.rename','account.bind.start','publication.prepare','calendar.plan','automation.createDraft','automation.enable','preferences.update'];
/** SEMANTIC_BOUNDARY_ALLOW:严格动作判别仅落实模型候选；不推断意图、内容或目标账号。 */
export function createAssistantActionOwners(db:Db,ports:AssistantActionOwnerPorts):Record<AssistantActionInput['kind'],AssistantActionOwner>{
 const json=(value:unknown)=>z.json().parse(JSON.parse(JSON.stringify(value)));
 const observation=(value:unknown)=>json(value) as Record<string,z.infer<ReturnType<typeof z.json>>>;
 const targetSchema=z.object({accountId:z.string().min(1),membershipVersion:z.number().int().positive().nullable(),accountHandle:z.string(),platform:z.string()}).strict();
 const key=(source:AssistantProposalSource)=>`assistant:${createHash('sha256').update(source.callId).digest('hex')}`;
 async function target(services:ActionServices,ctx:RequestContext,accountId:string|null|undefined,platform?:string){
  if(!accountId)throw new ConflictError('请先选择该操作的真实平台账号');
  const account=await services.accounts.getAccount(ctx,accountId);
  await services.accounts.assertOwnedAccount(ctx,accountId,platform??account.platform);
  const member=ctx.groupId?await services.groups.forAccount(ctx,accountId):null;
  if(member&&(member.groupId!==ctx.groupId||member.status!=='active'))throw new ConflictError('目标账号已离开当前组');
  return {accountId,membershipVersion:member?.version??null,accountHandle:account.accountHandle,platform:account.platform};
 }
 async function folder(services:ActionServices,ctx:RequestContext,id:string|null|undefined){
  if(!id)return null;
  const found=(await services.knowledge.listFolders(ctx)).find(row=>row.id===id&&row.status==='active');
  if(!found)throw new ConflictError('所选知识分类不存在或不属于当前工作区');return found;
 }
 async function write(transport:Transport,endpoint:typeof ENDPOINTS[keyof typeof ENDPOINTS],ctx:RequestContext,input:{params?:unknown;body?:unknown}){
  const result=await transport.request(endpoint,{params:input.params,body:input.body,query:undefined} as never,ctx) as {data:unknown};return endpoint.response.parse(result.data);
 }
 const owner:AssistantActionOwner={
  async prepare(ctx,action):Promise<Record<string,z.infer<ReturnType<typeof z.json>>>>{
   const services=ports.forStore(db);
   switch(action.kind){
    case 'project.create':case 'topic.create':case 'group.create':return {workspace:observation({groupId:ctx.groupId??null,accountId:ctx.accountId??null})};
    case 'topic.promote':return {candidate:json(await services.candidates.getCandidate(ctx,action.candidateId))};
    case 'script.patch':return {artifact:json(await services.artifacts.getArtifact(ctx,action.artifactId))};
    case 'article.save':return {article:json(await services.articles.getArticle(ctx,action.outputId))};
    case 'graphic.save':return {graphic:json(await services.graphicPosts.getGraphicPost(ctx,action.outputId))};
    case 'asset.tag':{
     const targets=await ports.assetTags.prepare(ctx,action.targets.map(row=>row.assetId));
     // 协议ID按原owner的二进制顺序比较，不能按本机语言排序后误判版本变化。
     const ordered=[...action.targets].sort((a,b)=>a.assetId<b.assetId?-1:a.assetId>b.assetId?1:0);
     if(!isDeepStrictEqual(targets,ordered))throw new ConflictError('素材或标签版本已变化，请重新读取素材');return {targets:json(targets)};
    }
    case 'knowledge.create':return {folder:json(await folder(services,ctx,action.folderId))};
    case 'knowledge.folder.create':return {parent:json(await folder(services,ctx,action.parentId))};
    case 'radar.collection.create':{
     if(!action.parentId)return {parent:null};
     return {parent:json(await services.intelligence.readCollection(ctx,action.parentId))};
    }
    case 'positioning.save':return {profile:json(await services.positioning.getProfile(ctx))};
    case 'group.rename':case 'account.bind.start':{
     if(!ctx.groupId)throw new ConflictError('请先打开要管理的账号组');
     const group=await services.groups.get(ctx,ctx.groupId),version=action.kind==='group.rename'?action.expectedVersion:action.expectedGroupVersion;
     if(group.version!==version||group.status!=='active')throw new ConflictError('账号组已变化，请重新读取');
     if(action.kind==='group.rename')return {group:json(group)};
     const capability=(await services.accounts.getBindingCapabilities(ctx)).find(row=>row.platform===action.platform);
     if(!capability?.bind.available||capability.bind.method!=='qr')throw new ConflictError('该平台的扫码服务尚未就绪，请在账号管理查看实际绑定方式');
     return {group:json(group),capability:json(capability)};
    }
    case 'publication.prepare':{
     const output=await services.projects.getOutput(ctx,action.outputId),selected=await target(services,ctx,action.accountId??ctx.accountId,action.platform);
     if(action.expectedMembershipVersion!==undefined&&action.expectedMembershipVersion!==selected.membershipVersion)throw new ConflictError('发布目标归属已变化，请重新读取');
     return {output:json(output),target:json(selected),effect:'创建空的发布准备记录，尚未向平台发布'};
    }
    case 'calendar.plan':{
     const project=await services.projects.getScheduleProject(ctx,action.projectId),calendarContext=await services.calendar.getCalendarRequestContext(ctx);
     const schedules=(await services.calendar.listActiveProjectSchedules({...ctx,accountId:ctx.groupId?null:ctx.accountId},null)).filter(row=>row.projectId===action.projectId);
     return {project:json(project),calendarContext:json(calendarContext),schedules:json(schedules),target:action.targetAccountId?json(await target(services,ctx,action.targetAccountId)):null,effect:'保存项目排期；同日同目标已有计划时保留原计划'};
    }
    case 'automation.createDraft':{
     const selected=action.targetAccountId?await target(services,ctx,action.targetAccountId):null;
     return {target:json(selected),effect:'创建关闭的自动化草稿，不立即执行'};
    }
    case 'automation.enable':{
     const job=await services.scheduling.getJob(ctx,action.jobId);
     return {job:json(job),target:job.accountId?json(await target(services,ctx,job.accountId)):null,effect:action.enabled?'启用后按原计划触发，不立即执行':'停用后不再按计划触发'};
    }
    case 'preferences.update':{
     const {kind:_,...patch}=action,preferences=await services.settings.getPreferences(ctx);
     return {expected:json(Object.fromEntries(Object.keys(patch).map(field=>[field,preferences[field as keyof typeof preferences]])))};
    }
   }
  },
  async resolveScope(ctx,action,observations){
   if(!['publication.prepare','calendar.plan','automation.createDraft','automation.enable'].includes(action.kind))return ctx;
   if(observations.target===null)return {...ctx,accountId:ctx.groupId?null:ctx.accountId,membershipVersion:undefined};
   const selected=targetSchema.parse(observations.target);
   return {...ctx,accountId:selected.accountId,membershipVersion:selected.membershipVersion??undefined};
  },
  async adopt(ctx,action,observations,source,transaction){
   const deferred:Array<()=>Promise<void>>=[],store=transaction as unknown as Db,services=ports.forStore(store,deferred),stable=key(source);
   let result:unknown,operationId:string,status:'adopted'|'accepted'='adopted';
   switch(action.kind){
    case 'project.create':{const {kind:_,...body}=action;operationId='projects.create';result=await write(services.writes.projects,ENDPOINTS.createProject,ctx,{body});break;}
    case 'topic.create':{const {kind:_,...body}=action;operationId='candidates.create';result=await services.candidates.createCandidate(ctx,body);break;}
    case 'topic.promote':{
     if(!isDeepStrictEqual(json(await services.candidates.getCandidateForUpdate(ctx,action.candidateId)),observations.candidate))throw new ConflictError('选题已改变，请重新核对立项内容');
     operationId='candidates.promote';result=await services.candidates.promote(ctx,action.candidateId);break;
    }
    case 'script.patch':{const {kind:_,artifactId,...body}=action;operationId='artifacts.scriptPatches.apply';result=await write(services.writes.artifacts,ENDPOINTS.applyScriptPatch,ctx,{params:{artifactId},body});break;}
    case 'article.save':{const {kind:_,outputId,...body}=action;operationId='articles.versions.create';result=await services.articles.createVersion(ctx,outputId,{...body,clientRequestId:stable});break;}
    case 'graphic.save':{const {kind:_,outputId,...body}=action;operationId='graphicPosts.versions.create';result=await services.graphicPosts.createVersion(ctx,outputId,{...body,clientRequestId:stable});break;}
    case 'asset.tag':operationId='taxonomy.assetTags.adopt';result=await ports.assetTags.adopt(ctx,{proposalId:stable,targets:action.targets,tag:action.tag},transaction);break;
    case 'knowledge.create':{
     await folder(services,ctx,action.folderId);
     operationId='knowledge.create';result=await write(services.writes.knowledge,ENDPOINTS.createKnowledge,ctx,{body:{title:action.title,content:action.note,sourceNote:action.sourceNote,folderId:action.folderId,knowledgeType:'note',sourceType:'ai',sourceMetadata:{origin:'assistant.action',source}}});break;
    }
    case 'knowledge.folder.create':{
     await folder(services,ctx,action.parentId);const {kind:_,...body}=action;
     operationId='knowledge.folders.create';result=await write(services.writes.knowledge,ENDPOINTS.createKnowledgeFolder,ctx,{body});break;
    }
    case 'radar.collection.create':{
     const parent=action.parentId?await services.intelligence.readCollection(ctx,action.parentId,{forUpdate:true}):null;
     if(!isDeepStrictEqual(json(parent),observations.parent))throw new ConflictError('雷达父分类已改变，请重新核对');
     const {kind:_,...body}=action;operationId='intelligence.collections.create';result=await services.intelligence.createCollection(ctx,{...body,idempotencyKey:stable});break;
    }
    case 'positioning.save':{const {kind:_,...body}=action;operationId='positioning.profile.upsert';result=await services.positioning.compareAndUpsertProfile(ctx,body,creatorProfileResource.nullable().parse(observations.profile));break;}
    case 'group.create':operationId='accountGroups.create';result=await services.groups.create(ctx,{name:action.name,idempotencyKey:stable});break;
    case 'group.rename':{
     if(!ctx.groupId)throw new ConflictError('请先选择账号组');operationId='accountGroups.update';result=await services.groups.update(ctx,ctx.groupId,{name:action.name,expectedVersion:action.expectedVersion});break;
    }
    case 'account.bind.start':{
     if(!ctx.groupId)throw new ConflictError('请先选择账号组');operationId='accounts.bind.start';status='accepted';result=await ports.binding.reserveInTransaction(ctx,{groupId:ctx.groupId,platform:action.platform,expectedGroupVersion:action.expectedGroupVersion,idempotencyKey:stable},transaction);break;
    }
    case 'publication.prepare':{
     const selected=targetSchema.parse(observations.target);operationId='outputs.publications.create';
     result=await write(services.writes.publishing,ENDPOINTS.createPublication,ctx,{params:{outputId:action.outputId},body:{platform:action.platform,accountId:selected.accountId,accountReference:action.accountReference,expectedMembershipVersion:selected.membershipVersion??undefined}});break;
    }
    case 'calendar.plan':{
     if(!ctx.groupId)throw new ConflictError('请先打开项目所属账号组');const {kind:_,...body}=action;
     operationId='group.calendar.entries.create';result=await services.calendar.createGroupEntry(ctx,ctx.groupId,body);break;
    }
    case 'automation.createDraft':{const {kind:_,targetAccountId:__,...body}=action;operationId='scheduledJobs.create';result=await services.scheduling.createDraftIfAbsent(ctx,body);break;}
    case 'automation.enable':operationId='scheduledJobs.setEnabled';result=await services.scheduling.setEnabledIfUnchanged(ctx,action.jobId,action.enabled,scheduledJobResource.parse(observations.job));break;
    case 'preferences.update':{const {kind:_,...patch}=action;operationId='settings.preferences.patch';result=await services.settings.patchPreferencesIfUnchanged(ctx,patch,observations.expected as Partial<typeof patch>);break;}
   }
   return {operationId,result:json(result),status,afterCommit:async()=>{
    if(action.kind==='account.bind.start')await ports.binding.wakeReserved();
    // 原稿件索引和编辑差异记录都是best-effort；延后到commit后仍保持该语义。
    // 正式owner写入、回执事务及扫码唤醒错误不在这个保护范围内。
    for(const effect of deferred){
     try{await effect();}catch{console.warn('[assistant-action] 派生效果失败，正式保存与原回执保留');}
    }
    try{await ports.afterCommit?.(ctx,action,result);}catch{console.warn('[assistant-action] 派生索引失败，正式保存与原回执保留');}
   }};
  },
 };
 return Object.fromEntries(actionKinds.map(kind=>[kind,owner])) as Record<AssistantActionInput['kind'],AssistantActionOwner>;
}
const features=[
 {feature:'project',title:'项目与选题',page:'/projects',reads:['projects.','candidates.','topics.'],actions:['project.create','topic.create','topic.promote']},
 {feature:'script',title:'脚本',page:'/projects',reads:['artifacts.'],actions:['script.patch']},
 {feature:'article',title:'文章与图文',page:'/projects',reads:['articles.','graphicPosts.'],actions:['article.save','graphic.save']},
 {feature:'composition',title:'作品组合与朋友圈',page:'/projects',reads:['moments.','workCompositions.'],actions:[]},
 {feature:'material',title:'素材与知识',page:'/assets',reads:['assets.','knowledge.'],actions:['asset.tag','knowledge.create','knowledge.folder.create']},
 {feature:'radar',title:'内容雷达',page:'/intelligence',reads:['intelligence.'],actions:['radar.collection.create']},
 {feature:'positioning',title:'创作者定位',page:'/positioning',reads:['positioning.','pages.positioning.'],actions:['positioning.save']},
 {feature:'accounts',title:'账号组与平台绑定',page:'/accounts',reads:['accountGroups.','accounts.'],actions:['group.create','group.rename','account.bind.start']},
 {feature:'publishing',title:'发布准备',page:'/publishing',reads:['outputs.publications.','publications.'],actions:['publication.prepare']},
 {feature:'analytics',title:'首页与数据复盘',page:'/daily-report',reads:['analytics.','pages.dashboard.','pages.projectOverview.','pages.groupOverview.','pages.dailyReport.'],actions:[]},
 {feature:'calendar',title:'日历与自动化',page:'/automations',reads:['group.calendar.','group.cadence.','scheduledJobs.','jobRuns.'],actions:['calendar.plan','automation.createDraft','automation.enable']},
 {feature:'settings',title:'偏好设置',page:'/settings',reads:['settings.preferences.'],actions:['preferences.update']},
 {feature:'canvas',title:'创作画布与生图',page:'/canvases',reads:['canvas.'],actions:[]},
 {feature:'video',title:'视频剪辑',page:'/projects',reads:[],actions:[]},
] as const;

/** 固定应用组合；来源、正式owner和回执沿既有账本，没有第二执行器。 */
export async function createAssistantSystemRoot(db:Db,ports:AssistantSystemRootPorts,deps:{now:()=>string}){
 const candidateNames=['system.action.propose','canvas.create.propose',...(ports.generation?['canvas.generate.propose']:[])];
 const prepared=await prepareChatToolDefinitions(buildChatTools(candidateNames,{humanizeError:()=>null} as unknown as ChatToolDeps));
 const tools=Object.fromEntries(prepared.definitions.map(definition=>[definition.name,{version:definition.version,effect:definition.effect,parameters:prepared.parameters[definition.name]!.parameters,parameterSchema:prepared.parameters[definition.name]!.schema}]));
 const source=createChatProposalSourceService(db,{tools,parseCandidate(name,value){
  const candidate=name==='system.action.propose'?assistantActionCandidateSchema.omit({source:true}).parse(value):name==='canvas.create.propose'?canvasCreateCandidateSchema.omit({source:true}).parse(value):name==='canvas.generate.propose'?canvasGenerateUnsignedCandidateSchema.parse(value):null;
  if(!candidate)throw new ConflictError('该来源不是当前已装配的完整候选');
  return {...candidate,request:z.json().parse(candidate.request)};
 }});
 function actionOwner(action:AssistantActionInput){const owner=ports.actions[action.kind];if(!owner)throw new ConflictError('本次改动还没有可用的正式保存端口，请从能力目录查看原功能入口');return owner;}
 function generationDeadline(confirmedAt:string,policyMs:number,parentDeadline:string|null){
  const policy=Date.parse(confirmedAt)+policyMs;
  return new Date(parentDeadline===null?policy:Math.min(policy,Date.parse(parentDeadline))).toISOString();
 }
 function assertGenerationScope(verified:Source,candidate:z.infer<typeof canvasGenerateCandidateSchema>){
  const context=verified.hostContext.chatContext,snapshot=candidate.snapshot;
  if(context.surface!=='canvas'||context.selection?.kind!=='canvas'||context.selection.ids.length!==1||context.selection.ids[0]!==snapshot.canvasId||snapshot.sourceExecutionTaskId!==verified.executionTask.id||snapshot.parentDeadlineAt!==verified.executionTask.deadlineAt)throw new ConflictError('生图候选缺少原单画布与父任务证明');
 }
 function buildAdoption(confirmation?:{canvasId:string;nodeId:string;confirmedAt:string}){return createAssistantActionAdoptionService(db,{source,now:deps.now,
  async resolveScope(ctx,verified){if(verified.toolName!=='system.action.propose')return ctx;const candidate=assistantActionCandidateSchema.parse({...verified.candidate,source:verified.source});return await actionOwner(candidate.request.action).resolveScope?.(ctx,candidate.request.action,candidate.observations)??ctx;},
  async apply(ctx,verified,tx){
   if(verified.toolName==='canvas.create.propose'){
    const candidate=canvasCreateCandidateSchema.parse({...verified.candidate,source:verified.source});
    const canvas=await ports.canvas.createWithDocumentInTransaction(ctx,{...candidate.request,document:candidate.document},tx as unknown as Db);
    return {status:'adopted',operationId:'canvas.create',result:canvas};
   }
   if(verified.toolName==='canvas.generate.propose'){
    if(!ports.generation||!confirmation)throw new ConflictError('请在原画布生成候选上确认生成');
    const candidate=canvasGenerateCandidateSchema.parse({...verified.candidate,source:verified.source}),snapshot=candidate.snapshot;
    assertGenerationScope(verified,candidate);
    if(confirmation.canvasId!==snapshot.canvasId||confirmation.nodeId!==candidate.request.nodeId)throw new ConflictError('确认目标与原画布节点不符');
    const deadlineAt=generationDeadline(confirmation.confirmedAt,snapshot.assetLimit.deadlineMs,verified.executionTask.deadlineAt);
    const admission=canvasProposalAdmissionSchema.parse({source:verified.source,sourceExecutionTaskId:verified.executionTask.id,confirmedAt:confirmation.confirmedAt,deadlineAt,assetLimit:snapshot.assetLimit});
    if(Date.parse(deps.now())>=Date.parse(deadlineAt))throw new ConflictError('原生成确认期限已耗尽');
    const attemptId=`canvas-proposal:${verified.source.callId}`;
    const reserved=await ports.generation.reserve(ctx,snapshot.canvasId,candidate.request.nodeId,{expectedRevision:candidate.request.baseRevision,attemptId,snapshot,proposalAdmission:admission},tx as unknown as Db);
    const task=await ports.generation.createTask(reserved.context,{attemptId,inputData:reserved.inputData},tx as unknown as Db);
    if(Date.parse(task.requestedAt)>=Date.parse(deadlineAt)||Date.parse(deps.now())>=Date.parse(deadlineAt))throw new ConflictError('原生成确认期限已耗尽');
    const generated=await ports.generation.attach(ctx,reserved.link.id,task.id,tx as unknown as Db);
    return {status:'accepted',operationId:'canvas.node.generate',result:generated,afterCommit:()=>ports.generation!.wake(reserved.context,task.id),assertBeforeCommit:async()=>{if(Date.parse(deps.now())>=Date.parse(deadlineAt))throw new ConflictError('原生成确认期限已耗尽');}};
   }
   const candidate=assistantActionCandidateSchema.parse({...verified.candidate,source:verified.source});
   return actionOwner(candidate.request.action).adopt(ctx,candidate.request.action,candidate.observations,verified.source,tx);
  },
 });}
 const adoption=buildAdoption();
 const host:ChatSystemToolPorts={
  async features(_ctx,input,frozen){
   const parsed=assistantFeaturesInputSchema.parse(input),availableTools=frozen.modelInput.tools.map(tool=>({name:tool.name,effect:tool.effect,execution:tool.execution??'host'}));
   const visible=features.map(feature=>({
    feature:feature.feature,title:feature.title,page:feature.page,
    reads:Object.keys(assistantReadEndpoints).filter(id=>feature.reads.some(prefix=>id.startsWith(prefix))),
    actions:feature.actions.filter(kind=>Object.hasOwn(ports.actions,kind)),
    tools:availableTools.filter(tool=>tool.name.startsWith(feature.feature==='canvas'?'canvas.':feature.feature==='video'?'work.editor.':'system.')),
    prerequisites:feature.feature==='canvas'?'新建可在任何页提出；修改与生成先打开并读取已保存画布':feature.feature==='video'?'打开已导入真实录像的项目视频，读取选区、时间轴与转写后精调':'读取当前账号组真实对象和版本；正式写入需用户采用',
   }));
   // SEMANTIC_BOUNDARY_ALLOW:只按固定域或已开放完整read/action ID查目录身份；不做别名、前缀或内容语义匹配，不扩大执行权限。
   const rows=visible.filter(row=>!parsed.feature||row.feature===parsed.feature||row.reads.includes(parsed.feature)||row.actions.some(kind=>kind===parsed.feature));
   const page=rows.slice(parsed.offset,parsed.offset+parsed.limit);return {rows:page,total:rows.length,nextOffset:parsed.offset+page.length<rows.length?parsed.offset+page.length:null};
  },
  async read(ctx,input){
   const parsed=assistantReadInputSchema.parse(input),request=parsed.request as {kind:string;params?:unknown;query?:unknown};
   const endpoint=assistantReadEndpoints[request.kind];if(!endpoint)throw new ConflictError('读取操作不在已审固定目录');
   const response=await ports.read(ctx,endpoint,{...(request.params?{params:request.params}:{}),...(request.query?{query:request.query}:{})});
   let data=response.data,readMeta=response.meta??null,total:number|null=null,nextOffset:number|null=null,nextInput:typeof parsed|null=null;
   if(request.kind==='assets.get'&&ports.actions['asset.tag']&&ports.assetTags){
    // 只核本适配消费的身份/状态；保留原owner DTO与合法无文件素材的读取行为。
    const asset=z.object({id:z.string().min(1),status:z.enum(['active','archived','deleted','pending'])}).passthrough().parse(data);
    if(asset.status==='active'){
     const assetId=(request.params as {assetId:string}).assetId;
     if(asset.id!==assetId)throw new ConflictError('素材读取目标与真实素材不同');
     const targets=await ports.assetTags.prepare(ctx,[assetId]);
     const current=await ports.read(ctx,endpoint,{params:request.params});
     // SEMANTIC_BOUNDARY_ALLOW:比较同一真实DTO观察，防并发字段变化；不判断素材内容或标签语义。
     if(!isDeepStrictEqual(response.data,current.data))throw new ConflictError('素材在观察期间发生变化，请读取原素材后再提出候选');
     const [tagTarget]=targets;
     if(targets.length!==1||tagTarget?.assetId!==assetId||!tagTarget.expectedVersion)throw new ConflictError('原标签观察目标无效');
     data={...asset,tagTarget};
    }
   }
   if(endpoint.isList&&Array.isArray(data)){
    const query=(request.query??{}) as Record<string,unknown>,meta=(response.meta??{}) as Record<string,unknown>;
    const pageSize=typeof query.pageSize==='number'?query.pageSize:typeof query.limit==='number'?query.limit:parsed.limit;
    const page=typeof query.page==='number'?query.page:1;
    const offset=typeof query.pageSize==='number'?(page-1)*pageSize:typeof query.offset==='number'?query.offset:parsed.offset;
    // SEMANTIC_BOUNDARY_ALLOW:原固定合同分页适配，仅切分页窗口，不筛选、排名或判断业务内容。
    // 这四个原transport返回全量数组；其余真实分页页不能再次按全局offset裁切。
    const fullArray=!('pageSize' in query||'limit' in query)||['projects.list','artifacts.list','artifacts.versions.list','knowledge.list'].includes(endpoint.id);
    if(fullArray){total=data.length;data=data.slice(offset,offset+pageSize);}
    else{
     data=data.slice(0,pageSize);
     // 三个原meta.total只表示本页行数，不能当全库总数，也不能据它误判第一页即终页。
     if(!['assets.list','outputs.publications.list','publications.revisions.list'].includes(endpoint.id)&&typeof meta.total==='number')total=meta.total;
    }
    readMeta={...meta,page:Math.floor(offset/pageSize)+1,pageSize,total};
     const count=(data as unknown[]).length,hasMore=total!==null?offset+count<total:count===pageSize;
    nextOffset=hasMore?offset+count:null;
    if(nextOffset!==null){
     const nextRequest=typeof query.pageSize==='number'?{...request,query:{...query,page:page+1}}:typeof query.limit==='number'?{...request,query:{...query,offset:nextOffset}}:request;
     nextInput={request:nextRequest,offset:typeof query.pageSize==='number'||typeof query.limit==='number'?0:nextOffset,limit:parsed.limit} as typeof parsed;
    }
   }
   const value=z.json().parse(JSON.parse(JSON.stringify(data))),full=JSON.stringify(value),offset=parsed.window?.offsetUtf16??0,length=parsed.window?.lengthUtf16??12000;
   if(offset>full.length)throw new ConflictError('读取窗口超出本次结果，请从原目标重新读取');
   const text=full.slice(offset,offset+length),nextWindowOffset=offset+text.length<full.length?offset+text.length:null;
   return {kind:'system.read',requestKind:request.kind,text,complete:nextWindowOffset===null,totalUtf16:full.length,nextWindowOffset,total,nextOffset,nextInput,meta:z.json().parse(JSON.parse(JSON.stringify(readMeta)))};
  },
  async propose(ctx,input,frozen){
   const parsed=assistantActionProposeInputSchema.parse(input),action=parsed.action;
   const editorTarget=frozen.hostContext.chatContext.editorTarget;
   if((action.kind==='article.save'||action.kind==='graphic.save')&&editorTarget){
    if(editorTarget.outputId!==action.outputId||editorTarget.owner!==(action.kind==='article.save'?'wechat_article':'graphic_post')||editorTarget.savedBase.kind!=='artifact'||editorTarget.savedBase.versionId!==action.expectedCurrentVersionId)
     throw new ConflictError('当前编辑器与候选作品或版本不同，请核对原稿后重新提出候选');
   }
   const observations=await actionOwner(action).prepare(ctx,action,frozen);
   return assistantActionCandidateSchema.omit({source:true}).parse({schemaVersion:1,kind:'system.action.proposal',request:parsed,observations});
  },
  async createCanvas(ctx,input){const request=canvasCreateProposalInputSchema.parse(input),prepared=await ports.canvas.prepareCreateProposal(ctx,request);return canvasCreateCandidateSchema.omit({source:true}).parse({schemaVersion:1,kind:'canvas.create.proposal',request,document:prepared.document});},
  ...(ports.generation?{async generateCanvas(ctx:RequestContext,input:Parameters<NonNullable<ChatSystemToolPorts['generateCanvas']>>[1],frozen:Host){
   const request=canvasGenerateProposalInputSchema.parse(input),selection=frozen.hostContext.chatContext.selection;
   if(frozen.hostContext.chatContext.surface!=='canvas'||selection?.kind!=='canvas'||selection.ids.length!==1)throw new ConflictError('请先打开要生成的画布并读取已保存节点');
   const [business]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,frozen.aiTaskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
   if(!business?.executionTaskId||business.taskType!=='copilot.assist')throw new ConflictError('生图候选缺少原聊天任务');
   const [parent]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,business.executionTaskId),eq(executionTasks.ownerId,business.id),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
   if(!parent||parent.kind!=='ai_task'||parent.ownerType!=='ai_task')throw new ConflictError('生图候选父任务映射无效');
   const prepared=await ports.generation!.prepare(ctx,selection.ids[0]!,request);
   return canvasGenerateUnsignedCandidateSchema.parse({schemaVersion:1,kind:'canvas.generate.proposal',request,snapshot:{...prepared,sourceExecutionTaskId:parent.id,parentDeadlineAt:parent.deadlineAt,assetLimit:ports.generation!.assetLimit}});
  }}:{}),
 };
 const service={...adoption,
  async adoptCanvas(ctx:RequestContext,raw:unknown){const verified=await source.read(ctx,raw);if(verified.toolName!=='canvas.create.propose')throw new ConflictError('请采用原画布创建候选');return adoption.adopt(ctx,raw);},
  async confirmGeneration(ctx:RequestContext,canvasId:string,nodeId:string,raw:unknown){
   // 第一次请求入口即固定；锁等待、runtime准备及重放不能重计时。
   const confirmedAt=deps.now(),verified=await source.read(ctx,raw);
   if(verified.toolName!=='canvas.generate.propose')throw new ConflictError('请确认原画布生成候选');
   const candidate=canvasGenerateCandidateSchema.parse({...verified.candidate,source:verified.source});
   if(candidate.snapshot.canvasId!==canvasId||candidate.request.nodeId!==nodeId)throw new ConflictError('确认目标与原画布节点不符');
   return buildAdoption({canvasId,nodeId,confirmedAt}).adopt(ctx,raw);
  },
  /** 原Canvas/asset准备端口；所有来源和采用回执读取都绑定调用方store。 */
  async assertGenerationAdmission(ctx:RequestContext,input:{attemptId:string;inputData:import('../../modules/creative-canvas/creative-canvas.service').CanvasTaskInput;taskId:string;generationLinkId:string},store:Db){
   const admission=canvasProposalAdmissionSchema.parse(input.inputData.canvasOwner.proposalAdmission);
   const [origin]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,admission.source.taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
   if(!origin)throw new ConflictError('原生成候选不属于当前工作区');
   const proposalContext={...ctx,accountId:origin.accountId,groupId:origin.groupId,groupVersion:origin.groupVersion??undefined,membershipVersion:origin.membershipVersion??undefined};
   const verified=await source.read(proposalContext,admission.source,store);
   if(verified.toolName!=='canvas.generate.propose')throw new ConflictError('原生成缺少已确认候选');
   const candidate=canvasGenerateCandidateSchema.parse({...verified.candidate,source:verified.source});assertGenerationScope(verified,candidate);
   const expectedDeadline=generationDeadline(admission.confirmedAt,candidate.snapshot.assetLimit.deadlineMs,verified.executionTask.deadlineAt);
   if(admission.sourceExecutionTaskId!==verified.executionTask.id||!isDeepStrictEqual(admission.assetLimit,candidate.snapshot.assetLimit)||admission.deadlineAt!==expectedDeadline||input.attemptId!==`canvas-proposal:${verified.source.callId}`)throw new ConflictError('生成确认事实与原候选期限不符');
   const {proposalAdmission:_,...owner}=input.inputData.canvasOwner;
   const original={...input.inputData,canvasOwner:{...owner,inputDigest:candidate.snapshot.inputDigest}};
   if(!isDeepStrictEqual(original,candidate.snapshot.inputData))throw new ConflictError('生成输入与已确认候选不符');
   const result=await adoption.receipt({...proposalContext,source:'user'},admission.source,store);
   const link=result.receipt?.result as {id?:string;taskId?:string;attemptId?:string;canvasId?:string;nodeId?:string;inputDigest?:string}|undefined;
   if(result.receipt?.status!=='accepted'||result.receipt.operationId!=='canvas.node.generate'||!link||link.id!==input.generationLinkId||link.taskId!==input.taskId||link.attemptId!==input.attemptId||link.canvasId!==candidate.snapshot.canvasId||link.nodeId!==candidate.request.nodeId||link.inputDigest!==input.inputData.canvasOwner.inputDigest)throw new ConflictError('原生成任务缺少正式确认回执');
  },
 };

 // 装配仅需要完整合同和可用性；实际执行必须经原持久host重新验来源，不能在请求装配时旁路执行。
 const unbound=async():Promise<never>=>{throw new ConflictError('该工具需要原持久聊天任务与宿主来源，请继续原任务');};
 const preparation:NonNullable<ChatToolDeps['assistantSystem']>={features:unbound,read:unbound,propose:unbound,createCanvas:unbound,...(ports.generation?{generateCanvas:unbound}:{})};
 return {host,service,source,preparation,transport:createAssistantActionTransport(service)};
}
