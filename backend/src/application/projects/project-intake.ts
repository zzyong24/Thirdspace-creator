import {readLegacyRadarPendingCalls} from '../../modules/execution/retired-radar-upgrade.service';
import {createHash} from 'node:crypto';
import {ENDPOINTS,platformId,assistantActionInputSchema,type ProjectEnsureInput,type ProjectSourceReference,type RequestContext} from '@creatoros/contract';
import type {Db} from '../../db';
import {workspaceKey} from '../../workspace-scope';
import {and,eq} from 'drizzle-orm';
import {createPlatformAccountService} from '../../modules/platform-account/platform-account.service';
import {createMembershipLockService} from '../../modules/platform-account/membership-lock.service';
import {projectIntakes} from '../../modules/projects/projects.db-schema';
import {saveImportedProjectText} from '../../modules/projects/project-intake.service';
import {ConflictError,OwnershipError} from '../../errors';
import {lockWorkspaceMembership} from '../../modules/platform-account/membership-lock.service';
import {createProjectRepository} from '../../modules/projects/projects.repository';
import {createProjectsService,type ServiceDeps,type CreateProjectCommand} from '../../modules/projects/projects.service';
import {createProjectIntakeService,projectIntakeDigest,type ProjectIntakeReference,type ProjectIntakeResolution,type ProjectPreparationReservationPort,type IntakeTransaction} from '../../modules/projects/project-intake.service';
import {createIntelligenceService} from '../../modules/intelligence/intelligence.service';
import {createCandidateService} from '../../modules/candidate/candidate.service';
import {createPersistentTaskService} from '../../modules/execution/persistent-task.service';
import {createLegacyRadarProjectLookupService} from '../../modules/execution/legacy-radar-project-lookup.service';
import {createPositioningService} from '../../modules/positioning/positioning.service';
import {createPublishingService} from '../../modules/publishing/publishing.service';
import {createUnavailablePublisher} from '../../modules/publishing/platform-publisher';

type PublicCreate=(typeof ENDPOINTS.createProject.body)['_output'];
/** 单一事务组合；这里仅绑定领域服务，无模型调用、无 worker 或第二条任务队列。 */
export function createProjectIntakeApplication(db:Db,deps:ServiceDeps,options:{preparation?:ProjectPreparationReservationPort}={}){
 const intakeFor=(store:Db)=>createProjectIntakeService(store,deps,{lockWorkspace:(ctx,tx)=>lockWorkspaceMembership(tx,ctx),preparation:options.preparation});
 const intake=intakeFor(db);
 const projectsFor=(tx:Db)=>createProjectsService(createProjectRepository(tx),deps);
 const positioningFor=(tx:Db)=>createPositioningService({db:tx,...deps,projects:{getProjectSubject:async(c,id)=>{const row=await projectsFor(tx).getProject(c,id);return {title:row.title,brief:row.brief};}}});
 const candidatesFor=(tx:Db)=>createCandidateService({db:tx,...deps,projects:projectsFor(tx),topicWorkspace:{assertProject:(c,id)=>projectsFor(tx).getProject(c,id),currentPositioningVersion:async c=>(await positioningFor(tx).readPositioningCenter(c)).currentStatement?.id??null},ingestion:{assertRunExists:async()=>{throw new ConflictError('项目入口不创建采集记录');}}});
 const intelligenceFor=(tx:Db)=>createIntelligenceService(tx,{...deps,tasks:createPersistentTaskService(tx,deps)});
 async function raw(ctx:RequestContext,itemId:string,tx:Db,previous:ProjectSourceReference[],snapshotId?:string):Promise<ProjectIntakeReference & {sourceKind:'intelligence_item'}>{
  const pinned=previous.find((ref):ref is Extract<ProjectSourceReference,{sourceKind:'intelligence_item'}>=>ref.sourceKind==='intelligence_item'&&ref.itemId===itemId);
  const source=await intelligenceFor(tx).getProjectIntakeSource(ctx,itemId,pinned?.snapshotId??snapshotId);
  return {sourceKey:`intelligence_item:${source.itemId}`,sourceKind:'intelligence_item',itemId:source.itemId,snapshotId:source.snapshotId,url:source.url||null,bodyAvailable:source.bodyAvailable,sourceDigest:source.sourceDigest,transcriptHash:source.transcriptHash};
 }
 async function resolve(ctx:RequestContext,input:ProjectEnsureInput,tx:IntakeTransaction,previous:ProjectSourceReference[]):Promise<ProjectIntakeResolution>{
  const store=tx as unknown as Db;
  if(input.source==='manual'||input.source==='quick_create'){
   const {idempotencyKey:_key,source:_source,...fields}=input;
   const references=input.source==='quick_create'&&input.sourceItemId?[await raw(ctx,input.sourceItemId,store,previous)]:[];
   const briefDetail=fields.briefDetail?{...fields.briefDetail}:undefined;if(briefDetail)delete briefDetail.contentRadarEvidence;
   return {command:{...fields,briefDetail},references};
  }
  if(input.source==='topic'){
   const candidates=candidatesFor(store),{candidate,promotion}=await candidates.getProjectIntakeCandidate(ctx,input.candidateId);
   const itemIds=[...new Set((candidate.card.sourceReferences??[]).flatMap(r=>r.intelligenceItemId?[r.intelligenceItemId]:[]))];
   const selectedSnapshot=itemIds.length===1&&candidate.card.adaptedDraft&&'sourceSnapshotId' in candidate.card.adaptedDraft?candidate.card.adaptedDraft.sourceSnapshotId:undefined;
   const references:ProjectIntakeReference[]=[];for(const itemId of itemIds)references.push(await raw(ctx,itemId,store,previous,selectedSnapshot));
   const card=candidate.card, audience=card.audienceTask;
   // 用户已选卡片字段属于明确选择；AI 初稿/来源 seed 仍保留在候选里，不能变成正式稿。
   const role=candidate.contentRole;
   // SEMANTIC_BOUNDARY_ALLOW: 只呈现用户已选内容目的枚举，不判断选题语义。
   const purpose=role?({traffic:"流量型",trust:"信任型",conversion:"获客型"})[role]:null;
   const briefDetail={...(card.teardown?{benchmarkRef:card.teardown}:{}),targetAudience:audience?.audience??card.targetAudience,contentGoal:[purpose?`当前内容目的：${purpose}（用户已选，优先于原推荐及参考初稿）`:null,card.proposal].filter(Boolean).join("\n")||undefined,contentFormat:card.format,coreMessage:audience?.job??card.oneLiner??candidate.angle,successCriteria:audience?.acceptance};
   const brief=[candidate.angle,audience?`观众任务：${audience.job}\n输入：${audience.input}\n操作：${audience.steps.join('；')}\n输出：${audience.output}\n验收：${audience.acceptance}\n入口：${audience.entryUrl}\n限制：${audience.costAndLimits}\n实测计划：${JSON.stringify(audience.testPlan)}\n状态：${audience.route}`:''].filter(Boolean).join('\n');
   return {command:{title:candidate.title,brief,briefDetail},references,existingProjects:promotion?[{projectId:promotion.projectId,required:true}]:[],commitRelations:projectId=>candidates.commitProjectIntakePromotion(ctx,input.candidateId,projectId)};
  }
  if(input.positioningVersionId&&previous.length===0)await positioningFor(store).getStatement(ctx,input.positioningVersionId);
  const reference=await raw(ctx,input.itemId,store,previous),source=await intelligenceFor(store).getProjectIntakeSource(ctx,input.itemId,reference.snapshotId);
  const pointers=await createLegacyRadarProjectLookupService(store).listForItem(ctx,input.itemId);
  const existingProjects=pointers.map(task=>{
   // SEMANTIC_BOUNDARY_ALLOW: 旧公式仅定位已提交行；新建始终使用 intake 身份，不根据内容猜测。
   const identity=task.accountId!==null?[task.userId,task.accountId,task.id]:[task.userId,'group',task.groupId,task.id];
   const id=`project-radar-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,32)}`;
   return {projectId:task.projectId??id,required:task.projectId!==null,itemId:input.itemId};
  });
  return {command:{title:source.title||'未命名项目',brief:''},references:[reference],existingProjects,preparationReviewOnly:(await readLegacyRadarPendingCalls(store,ctx,input.itemId)).length>0,positioningVersionId:input.positioningVersionId??null};
 }
 const application={
  /** 仅由已核真实动作收据的采纳宿主调用；模型输入仍沿原严格白名单。 */
  async ensureAssistantCreate(ctx:RequestContext,body:unknown,actionKey:string){
   const action=assistantActionInputSchema.parse({...(body as object),kind:'project.create'});
   if(action.kind!=='project.create'||!actionKey.trim())throw new ConflictError('编导采纳缺少真实动作身份');
   const {kind:_kind,...command}=action;
   return intake.ensure(ctx,{source:'assistant',intakeKey:projectIntakeDigest(['action',actionKey]),request:command,resolve:async()=>({command,references:[]})});
  },
  /** 仅 ingestion service port 可达；真实账号、平台与 canonical publication 均在事务重核。 */
  async ensureImportedProject(ctx:RequestContext,input:Parameters<ReturnType<typeof createProjectsService>['ensureImportedProject']>[1]){
   if(ctx.source!=='ingestion'||!ctx.accountId||!input.externalId.trim())throw new OwnershipError('导入缺少真实采集账号或作品身份');
   return db.transaction(async transaction=>{
    const store=transaction as unknown as Db,repo=createProjectRepository(store),projects=projectsFor(store);
    await lockWorkspaceMembership(transaction,ctx,{allowArchived:true});
    await createPlatformAccountService({db:store,...deps}).assertOwnedAccount(ctx,ctx.accountId!,input.platform);
    const publishing=createPublishingService({db:store,...deps,publisher:createUnavailablePublisher(),resolveOutputOwner:(c,id)=>projects.getOutputOwnerSummary(c,id),membership:createMembershipLockService(store),assertTargetAccount:(c,t)=>createPlatformAccountService({db:store,...deps}).assertOwnedAccount(c,t.accountId,t.platform)});
    let canonicalOutputId:string|null=null;
    const identity={accountId:ctx.accountId!,platform:platformId.parse(input.platform),externalId:input.externalId};
    const matchesWork=(ref:ProjectSourceReference)=>ref.sourceKind==='platform_work'&&ref.accountId===identity.accountId&&ref.platform===identity.platform&&ref.externalId===identity.externalId;
    const scope=workspaceKey(ctx),baseKey=projectIntakeDigest(identity);
    const [original]=await store.select().from(projectIntakes).where(and(eq(projectIntakes.userId,ctx.userId),eq(projectIntakes.scopeKind,scope.kind),eq(projectIntakes.scopeId,scope.id),eq(projectIntakes.source,'imported'),eq(projectIntakes.intakeKey,baseKey)));
    const currentPublication=original?await publishing.resolveCollectedPublication(ctx,input):null;
    const canonicalProjectId=currentPublication?.contentOutputId?(await projects.getOutput(ctx,currentPublication.contentOutputId)).projectId:null;
    // 用户明确登记新属主后，为新属主登记来源；旧项目、旧回执及原始正文仍保留。
    const intakeKey=original&&canonicalProjectId&&canonicalProjectId!==original.projectId?projectIntakeDigest([identity,'canonical',canonicalProjectId]):baseKey;
    const result=await createProjectIntakeService(store,deps,{lockWorkspace:(c,tx)=>lockWorkspaceMembership(tx,c,{allowArchived:true})}).ensure(ctx,{source:'imported',intakeKey,request:identity,resolve:async(tx,previous)=>{
     const txStore=tx as unknown as Db,txProjects=projectsFor(txStore),publication=await publishing.resolveCollectedPublication(ctx,input);
     let existingId:string|undefined;
     if(publication?.contentOutputId){
      if((publication.groupId??null)!==(ctx.groupId??null))throw new ConflictError('发布作品归属已变化，请按原项目核对');
      canonicalOutputId=publication.contentOutputId;existingId=(await txProjects.getOutput(ctx,canonicalOutputId)).projectId;
     }else{const matches=(await createProjectRepository(txStore).listImportedByRef(ctx,input)).filter(p=>p.accountId===ctx.accountId);if(matches.length>1)throw new ConflictError('同一真实账号存在多个旧导入项目，请核对归属');existingId=matches[0]?.id;}
     const ref:ProjectIntakeReference=previous.find(matchesWork)??{sourceKind:'platform_work',sourceKey:`platform_work:${ctx.accountId}:${input.platform}:${input.externalId}`,...identity,url:input.shareUrl??null,bodyAvailable:!!input.brief?.trim(),sourceDigest:projectIntakeDigest(identity),transcriptHash:null};
     return {command:{title:input.title,brief:input.brief,platformRef:{platform:input.platform,externalId:input.externalId,shareUrl:input.shareUrl,publishedAt:input.publishedAt}},references:[...previous.filter(r=>!matchesWork(r)),ref],existingProjects:existingId?[{projectId:existingId,required:true}]:[]};
    }});
    const outputs=await repo.listOutputs(ctx,result.project.id),output=canonicalOutputId?await projects.getOutput(ctx,canonicalOutputId):outputs[0]??await projects.createOutput(ctx,result.project.id,{title:input.title});
    if(output.projectId!==result.project.id)throw new ConflictError('发布作品属主在本次采集期间改变，请重读真实属主');
    const publication=await publishing.createImportedPublication(ctx,output.id,{platform:input.platform,externalId:input.externalId,externalUrl:input.shareUrl??null,publishedAt:input.publishedAt??null,title:input.title});
    if(publication.contentOutputId!==output.id)throw new ConflictError('发布作品已有其他真实属主，请重新读取原项目');
    // intake 只登记来源与发布事实；已有正式资料仍由用户维护。
    await projects.mergePublishedWork(ctx,result.project.id,{...input,title:result.project.title,brief:result.project.brief});
    const [receipt]=await store.select().from(projectIntakes).where(and(eq(projectIntakes.projectId,result.project.id),eq(projectIntakes.source,'imported'),eq(projectIntakes.intakeKey,intakeKey)));
    if(!receipt)throw new ConflictError('导入回执未提交');
    const reference=result.sourceReferences.find(matchesWork);
    if(!reference)throw new ConflictError('导入回执缺少该平台作品原始来源');
    if(input.brief?.trim())await saveImportedProjectText(store,deps,ctx,{intakeId:receipt.id,projectId:result.project.id,reference,contentText:input.brief});
    return {projectId:result.project.id,outputId:output.id,created:!result.reused,publicationId:publication.id};
   });
  },
  ensureProject(ctx:RequestContext,body:unknown){
   const input=ENDPOINTS.ensureProject.body.parse(body),{idempotencyKey:_key,...fields}=input;
   // 同一雷达作品重点击复用原冻结计划；新定位仅供首建核对，不重定义既有 intake。
   const request=input.source==='radar'?{source:input.source,itemId:input.itemId}:fields;
   const key=input.source==='radar'?['item',input.itemId]:input.source==='topic'?['candidate',input.candidateId]:['action',input.idempotencyKey];
   const ensure=(context:RequestContext,service=intake)=>service.ensure(context,{source:input.source,intakeKey:projectIntakeDigest(key),request,resolve:(tx,previous)=>resolve(context,input,tx,previous)});
   if(input.source!=='radar'||ctx.groupId)return ensure(ctx);
   // 初始组的账号入口是同一授权workspace的别名；身份派生前持有原membership锁，
   // 转组不能插入解析与提交之间。无法解析时拒绝，不另建legacy-account回执。
   return db.transaction(async tx=>{
    const frozen=await lockWorkspaceMembership(tx,ctx);
    if(!frozen.groupId)throw new OwnershipError('账号组不可用，请重新选择');
    const context={...ctx,groupId:frozen.groupId,membershipVersion:frozen.membershipVersion??undefined};
    return ensure(context,intakeFor(tx as unknown as Db));
   });
  },
  /** 旧公开create的三值请求与可信内部imported入口分开；每次无键手写创建仍是一次独立动作。 */
  ensurePublicCreate(ctx:RequestContext,body:unknown){
   const input:PublicCreate=ENDPOINTS.createProject.body.parse(body);
   if(input.source==='imported')throw new OwnershipError('公开创建不能声明采集导入来源');
   const {idempotencyKey,source='manual',platformRef,...fields}=input;
   const briefDetail=fields.briefDetail?{...fields.briefDetail}:undefined;if(briefDetail)delete briefDetail.contentRadarEvidence;
   const command:CreateProjectCommand={...fields,briefDetail,...(platformRef?{platformRef}:{})};
   const request={...fields,...(briefDetail?{briefDetail}:{}),source,...(platformRef?{platformRef}:{})};
   return intake.ensure(ctx,{source,intakeKey:projectIntakeDigest(['action',idempotencyKey??deps.nextId('project-action')]),request,resolve:async tx=>{
    const references:ProjectIntakeReference[]=[];
    if(platformRef&&(!platformRef.platform||!platformRef.externalId)&&(platformRef.platform||platformRef.externalId||platformRef.shareUrl||platformRef.publishedAt||platformRef.hidden!==undefined))throw new OwnershipError('平台来源缺少真实作品标识');
    if(platformRef&&platformRef.platform&&platformRef.externalId){
     const publication=await createPublishingService({db:tx as unknown as Db,...deps,publisher:createUnavailablePublisher()}).resolvePublication(ctx,platformRef);
     if(!publication)throw new OwnershipError('平台作品不存在或不属于当前工作区');
     command.platformRef={platform:publication.platform,externalId:publication.externalId!,...(publication.externalUrl?{shareUrl:publication.externalUrl}:{}),...(publication.publishedAt?{publishedAt:publication.publishedAt}:{}),...(publication.hiddenAt?{hidden:true}:{})};
     references.push({sourceKind:'platform_work',sourceKey:`platform_work:${publication.accountId}:${platformRef.platform}:${platformRef.externalId}`,accountId:publication.accountId,platform:platformId.parse(publication.platform),externalId:publication.externalId!,url:publication.externalUrl??null,bodyAvailable:false,sourceDigest:projectIntakeDigest([publication.accountId,publication.platform,publication.externalId]),transcriptHash:null});
    }
    return {command,references};
   }});
  },
 };
 return application;
}
