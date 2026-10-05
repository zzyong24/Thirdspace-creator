import {createArtifactsService} from '../artifacts';
import {createArticlesService} from '../articles/articles.service';
import {createGraphicPostsService} from '../graphic-posts/graphic-posts.service';
import {articleAnchors} from '../../schema/articles';
import {graphicPostAnchors} from '../graphic-posts/graphic-posts.schema';
import {intelligenceItems,intelligenceSources,sourceSnapshots,intelligenceTransforms,projectIntelligenceReferences} from '../../schema/intelligence';
import {candidates,topicProposalFeedback} from '../../schema/candidate';
import {contentCalendarEntries} from '../../schema/content-calendar';
import {creatorProfiles,positioningStatements} from '../../schema/positioning';
import {rubrics,rubricVersions,predictions,calibrationRuleSuggestions} from '../../schema/calibration';
import {learnings,learningApplications} from '../../schema/learnings';
import {workspaceFilter} from '../../workspace-scope';
import {createCreativeCanvasService,type CanvasTaskInput} from '../creative-canvas/creative-canvas.service';
import {canvasGenerationLinks,canvasAgentProposals} from '../../schema/creative-canvas';
import {aiTasks,aiTaskReferences} from '../../schema/ai';
import {productions,productionSegments,exportRecords} from '../../schema/production';
import {platformAccounts} from '../../schema/platform-account';
import {publications,publicationRevisions} from '../../schema/publishing';
import {metricSnapshots,metricValues,retentionPoints,publicationTraffic,publicationSyncState} from '../../schema/analytics';
import {reviews,reviewPublications} from '../../schema/reviews';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {eq,and} from 'drizzle-orm';
import {artifacts,artifactVersions,artifactRelations} from '../../schema/artifacts';
import {resourceAccessGrants,resourceAccessGrantUses} from '../../schema/resource-access';
import {createWorkspaceBlobService} from '../assets';
import {createPersistentTaskService} from '../execution';
import {assets,assetFiles} from '../../schema/assets';
import {contentOutputs,projects as projectRows} from '../../schema/projects';
import {knowledgeItems,knowledgeRevisions,knowledgeRelations,knowledgeFolders} from '../../schema/knowledge';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createProjectRepository,createProjectsService} from '../projects';
import {createAccountGroupService} from './account-group.service';
import {createGroupMigrationService} from './group-migration.service';
import type {RequestContext} from '@creatoros/contract';
let store:Awaited<ReturnType<typeof createDb>>;let groups:ReturnType<typeof createAccountGroupService>;let migration:ReturnType<typeof createGroupMigrationService>;let projects:ReturnType<typeof createProjectsService>;let source:string,target:string;
const base:RequestContext={userId:'migration-user',requestId:'migration',source:'user'};
beforeEach(async()=>{store=await createDb();let seq=0;const deps={db:store.db,now:()=>new Date().toISOString(),nextId:(p:string)=>p+'-'+ ++seq};groups=createAccountGroupService(deps);migration=createGroupMigrationService(deps);projects=createProjectsService(createProjectRepository(store.db),deps);source=(await groups.create(base,{name:'来源',idempotencyKey:'source'})).id;target=(await groups.create(base,{name:'目标',idempotencyKey:'target'})).id;});
afterEach(async()=>store?.client.close());
describe('显式项目闭包归组',()=>{
 it('画布公共生成预约和建议搬组后仍读取原冻结任务，undo不重签原AI身份',async()=>{
  const ctx={...base,groupId:source},targetCtx={...base,groupId:target};const originalContexts:RequestContext[]=[];
  const parent=await projects.createProject(ctx,{title:'真实画布迁移父'});
  const unused=async():Promise<never>=>{throw Error('此测试不调用素材或模型');};
  const canvas=createCreativeCanvasService(store.db,{now:()=> '2026-10-05T00:00:00.000Z',assertProject:async(c,id,tx=store.db,locked)=>{await createProjectRepository(tx).get(c,id,locked);},assertMediaAsset:unused,assertReferenceAsset:unused,getMediaFileDownloadUrl:unused,getReference:async()=>null,resolveCapability:async()=>({provider:'minimax',model:'image-01'}),
   submitTask:async(c,input:{attemptId:string;inputData:CanvasTaskInput})=>{const id='migration-canvas-task';await store.db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId??null,groupVersion:c.groupVersion??1,membershipVersion:null,projectId:parent.id,taskType:'asset.generate',status:'succeeded',idempotencyKey:input.attemptId,attemptId:input.attemptId,inputData:input.inputData,requestedAt:'2026-10-05T00:00:00.000Z'});return {id};},
   readTask:async(c,id,tx=store.db)=>{originalContexts.push(c);const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,id),eq(aiTasks.userId,c.userId),workspaceFilter(aiTasks,c)));return task??null;},readTaskResults:async()=>[]});
  const created=await canvas.create(ctx,{title:'真实画布',projectId:parent.id});
  const saved=await canvas.save(ctx,created.id,{expectedRevision:created.revision,document:{schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:'migration-node',type:'image_generation',label:'真实节点',position:{x:0,y:0},prompt:'原冻结主题',mode:'text_to_image'}],edges:[]}});
  const link=await canvas.generate(ctx,saved.id,'migration-node',{expectedRevision:saved.revision,attemptId:'migration-canvas-attempt'});
  const proposal=await canvas.propose(ctx,saved.id,saved.revision,[{type:'addNode',operationId:'migration-op',tempId:'new-node',node:{id:'temp',type:'text',label:'原建议',text:'原建议正文',position:{x:1,y:2}}}]);
  const originalTask=(await store.db.select().from(aiTasks).where(eq(aiTasks.id,link.taskId!)))[0]!;
  const originalLink=(await store.db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,link.id)))[0]!;
  const body={fromGroupId:source,toGroupId:target,projectIds:[parent.id],knowledgeIds:[],conversationIds:[]},preview=await migration.preview(ctx,body);
  expect(preview.counts.canvas_generation_links).toBe(1);expect(preview.counts.canvas_agent_proposals).toBe(1);
  const moved=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'canvas-move'});
  await expect(canvas.getGenerationMaterial(ctx,saved.id,link.id)).rejects.toThrow();
  expect(await canvas.getGenerationMaterial(targetCtx,saved.id,link.id)).toMatchObject({status:'not_ready',taskId:link.taskId});
  expect(await canvas.listTasks(targetCtx,saved.id)).toMatchObject([{id:link.id,taskId:link.taskId}]);
  expect(await canvas.listProposals(targetCtx,saved.id)).toMatchObject([{id:proposal.id}]);
  expect(originalContexts.every(c=>c.groupId===source)).toBe(true);
  expect((await store.db.select().from(aiTasks).where(eq(aiTasks.id,link.taskId!)))[0]).toEqual(originalTask);
  expect((await store.db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,link.id)))[0]).toEqual({...originalLink,groupId:target});
  await migration.undo(targetCtx,moved.id);
  expect((await store.db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,link.id)))[0]).toEqual(originalLink);
  const again=await migration.preview(ctx,body);await migration.apply(ctx,{...body,digest:again.digest,idempotencyKey:'canvas-move-again'});
  expect((await canvas.applyProposal(targetCtx,saved.id,proposal.id,saved.revision)).document.nodes).toHaveLength(2);
  expect((await store.db.select().from(aiTasks).where(eq(aiTasks.id,link.taskId!)))[0]).toEqual(originalTask);
 });

 it.each(['article','graphic'] as const)('公共创建%s→preview/apply→目标读取→undo保持output主键锚点及原版本',async kind=>{
  const ctx={...base,groupId:source},targetCtx={...base,groupId:target};let seq=0;
  const deps={now:()=> '2026-10-04T00:00:00.000Z',nextId:(p:string)=>`migration-domain-${p}-${++seq}`};
  const projectPort=(db:typeof store.db)=>createProjectsService(createProjectRepository(db),deps);
  const artifactPort=(db:typeof store.db)=>createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>projectPort(db).getProject(c,id),resolveOutputProjectId:(c,id)=>projectPort(db).getProjectIdByOutput(c,id)});
  const unused=async():Promise<never>=>{throw Error('此迁移测试不调用模型或素材');};
  const article=createArticlesService(store.db,{...deps,projects:projectPort,artifacts:artifactPort,assertAssetFile:unused,resolveDocumentSource:unused,resolveSelectedBrand:unused,submitGeneration:unused,readGeneration:unused});
  const graphic=createGraphicPostsService(store.db,{...deps,projects:projectPort,artifacts:artifactPort,assertAssetFile:unused});
  const parent=await projects.createProject(ctx,{title:'真实创作迁移父',creationMode:'free',targetPlatforms:[]});
  const output=kind==='article'?await article.createOutput(ctx,parent.id,{title:'真实文章',clientRequestId:'migration-create'}):await graphic.createOutput(ctx,parent.id,{title:'真实图文',clientRequestId:'migration-create'});
  const requestOutput=await projects.createOutput(ctx,parent.id,{title:'真实公共创建回执',contentType:'video',clientRequestId:'migration-project-create'});
  const read=(c:RequestContext)=>kind==='article'?article.getArticle(c,output.id):graphic.getGraphicPost(c,output.id);
  const before=await read(ctx),table=kind==='article'?articleAnchors:graphicPostAnchors;
  const originalAnchor=(await store.db.select().from(table))[0]!;
  const body={fromGroupId:source,toGroupId:target,projectIds:[parent.id],knowledgeIds:[],conversationIds:[]},preview=await migration.preview(ctx,body);
  expect(preview.counts[kind==='article'?'article_anchors':'graphic_post_anchors']).toBe(1);
  const done=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'migration-domain'});
  await expect(read(ctx)).rejects.toMatchObject({code:'OwnershipError'});
  expect(await projects.getOutputByCreationRequest(targetCtx,'migration-project-create')).toMatchObject({id:requestOutput.id,projectId:parent.id});
  const moved=await read(targetCtx);expect(moved.current).toEqual(before.current);expect(moved.currentVersionId).toBe(before.currentVersionId);expect(moved.artifactId).toBe(before.artifactId);
  expect((await store.db.select().from(table))[0]).toEqual({...originalAnchor,groupId:target});
  await migration.undo(targetCtx,done.id);expect(await read(ctx)).toEqual(before);await expect(read(targetCtx)).rejects.toMatchObject({code:'OwnershipError'});
  expect((await store.db.select().from(table))[0]).toEqual(originalAnchor);
 });

 it('完整项目与子稿件保持真实ID；digest过期拒绝；事务幂等，原组不可读，目标重读，未改版本可undo',async()=>{
  const ctx={...base,groupId:source};const p=await projects.createProject(ctx,{title:'同一期内容',creationMode:'free',targetPlatforms:[]});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  const preview=await migration.preview(ctx,body);expect(preview.projects.map(x=>x.id)).toEqual([p.id]);
  await expect(migration.apply(ctx,{...body,digest:'stale',idempotencyKey:'move'})).rejects.toMatchObject({code:'ConflictError'});
  const applied=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'move'});
  expect((await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'move'})).id).toBe(applied.id);
  await expect(projects.getProjectOverviewCore(ctx,p.id)).rejects.toMatchObject({code:'OwnershipError'});
  expect((await projects.getProjectOverviewCore({...base,groupId:target},p.id)).project.id).toBe(p.id);
  expect((await migration.undo({...base,groupId:target},applied.id)).status).toBe('undone');
  expect((await projects.getProjectOverviewCore(ctx,p.id)).project.id).toBe(p.id);
 });
 it('未选择项目、其它用户或在途项目拒绝；迁移后新写入阻止undo',async()=>{
  const ctx={...base,groupId:source};const p=await projects.createProject(ctx,{title:'不可覆盖后续编辑',creationMode:'free',targetPlatforms:[]});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  await expect(migration.preview({...ctx,userId:'other'},body)).rejects.toMatchObject({code:'OwnershipError'});
  const preview=await migration.preview(ctx,body);const done=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'other'});
  await projects.patchProject({...base,groupId:target},p.id,{title:'新内容'});
  await expect(migration.undo({...base,groupId:target},done.id)).rejects.toMatchObject({code:'ConflictError'});
  expect((await projects.getProjectOverviewCore({...base,groupId:target},p.id)).project.title).toBe('新内容');
 });
 it('同用户也必须在来源组预览和提交，不能用目标组上下文搬别组资料',async()=>{
  const p=await projects.createProject({...base,groupId:source},{title:'来源资料',creationMode:'free',targetPlatforms:[]});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  await expect(migration.preview({...base,groupId:target},body)).rejects.toMatchObject({code:'OwnershipError'});
 });
 it('真实执行队列owner项目无project_id列也阻止迁移，取消后才可预览',async()=>{
  const ctx={...base,groupId:source},p=await projects.createProject(ctx,{title:'执行中的创作',creationMode:'free',targetPlatforms:[]});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},before=await migration.preview(ctx,body);
  const tasks=createPersistentTaskService(store.db);const task=await tasks.enqueue(ctx,{kind:'script_candidate',ownerType:'project',ownerId:p.id,idempotencyKey:'active-migration',payload:{projectId:p.id}});
  await expect(migration.preview(ctx,body)).rejects.toMatchObject({code:'ConflictError'});
  await expect(migration.apply(ctx,{...body,digest:before.digest,idempotencyKey:'task-after-preview'})).rejects.toMatchObject({code:'ConflictError'});
  await tasks.command(ctx,{taskIds:[task.id],command:'cancel',idempotencyKey:'cancel-migration-task'});
  expect((await migration.preview(ctx,body)).projects).toHaveLength(1);
 });
 it('知识双端关系进入闭包，保留真实ID并能同库undo',async()=>{
  const at='2026-10-04T00:00:00.000Z';
  for(const id of ['knowledge-a','knowledge-b']){
   await store.db.insert(knowledgeItems).values({id,userId:base.userId,groupId:source,accountId:null,currentRevisionId:`${id}-rev`,title:id,status:'active',createdAt:at,updatedAt:at});
   await store.db.insert(knowledgeRevisions).values({id:`${id}-rev`,knowledgeItemId:id,revisionNumber:1,content:'真实知识',createdAt:at});
  }
  await store.db.insert(knowledgeRelations).values({id:'knowledge-edge',sourceKnowledgeId:'knowledge-a',targetKnowledgeId:'knowledge-b',relationType:'related'});
  const ctx={...base,groupId:source},body={fromGroupId:source,toGroupId:target,projectIds:[],knowledgeIds:['knowledge-a','knowledge-b'],conversationIds:[]};
  const preview=await migration.preview(ctx,body);expect(preview.counts.knowledge_relations).toBe(1);
  const applied=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'knowledge-move'});
  await expect(migration.undo({...base,groupId:target},applied.id)).resolves.toMatchObject({status:'undone'});
 });
 it('grant被新项目output真实引用后不能undo，无material_link也必须守住',async()=>{
  const ctx={...base,groupId:source},at='2026-10-04T00:00:00.000Z';
  const p=await projects.createProject(ctx,{title:'使用素材的原项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(assets).values({id:'migration-asset',userId:base.userId,groupId:source,accountId:null,assetType:'image',name:'真实封面',status:'active',createdAt:at,updatedAt:at});
  await store.db.insert(contentOutputs).values({id:'original-output',projectId:p.id,title:'原稿',contentType:'image',status:'draft',primaryAssetId:'migration-asset',createdAt:at,updatedAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},preview=await migration.preview(ctx,body);
  expect(preview.grants).toContainEqual({resourceType:'asset',resourceId:'migration-asset',originGroupId:source});
  const done=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'asset-move'});
  const next=await projects.createProject({...base,groupId:target},{title:'使用授权素材的新项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(contentOutputs).values({id:'later-output',projectId:next.id,title:'后续稿',contentType:'image',status:'draft',primaryAssetId:'migration-asset',createdAt:at,updatedAt:at});
  await expect(migration.undo({...base,groupId:target},done.id)).rejects.toMatchObject({code:'ConflictError'});
  expect((await projects.getProjectOverviewCore({...base,groupId:target},p.id)).project.id).toBe(p.id);
  // 模拟升级前未登记消费的历史引用；现存真实外键仍必须阻挡撤回。
  await store.db.delete(resourceAccessGrantUses);
  await expect(migration.undo({...base,groupId:target},done.id)).rejects.toMatchObject({code:'ConflictError'});
 });

 it('知识目录祖先及兄弟子树必须补选全部笔记，迁移后新增笔记阻止撤回',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source};
  for(const [id,parentId] of [['folder-root',null],['folder-a','folder-root'],['folder-b','folder-root']] as const)
   await store.db.insert(knowledgeFolders).values({id,parentId,userId:base.userId,groupId:source,accountId:null,name:id,createdAt:at,updatedAt:at});
  for(const [id,folderId] of [['note-a','folder-a'],['note-b','folder-b']] as const){
   await store.db.insert(knowledgeItems).values({id,userId:base.userId,groupId:source,accountId:null,folderId,currentRevisionId:`${id}-rev`,title:id,createdAt:at,updatedAt:at});
   await store.db.insert(knowledgeRevisions).values({id:`${id}-rev`,knowledgeItemId:id,revisionNumber:1,content:id,createdAt:at});
  }
  const body={fromGroupId:source,toGroupId:target,projectIds:[],knowledgeIds:['note-a'],conversationIds:[]};
  const incomplete=await migration.preview(ctx,body);
  expect(incomplete.requiredKnowledgeIds).toEqual(['note-b']);expect(incomplete.counts.knowledge_folders).toBe(3);
  await expect(migration.apply(ctx,{...body,digest:incomplete.digest,idempotencyKey:'incomplete-folders'})).rejects.toMatchObject({code:'ConflictError'});
  const complete={...body,knowledgeIds:['note-a','note-b']},preview=await migration.preview(ctx,complete);
  const done=await migration.apply(ctx,{...complete,digest:preview.digest,idempotencyKey:'complete-folders'});
  expect((await store.db.select().from(knowledgeFolders)).map(f=>f.groupId)).toEqual([target,target,target]);
  await store.db.insert(knowledgeItems).values({id:'new-folder-note',userId:base.userId,groupId:target,accountId:null,folderId:'folder-b',currentRevisionId:'new-folder-note-rev',title:'迁移后的新笔记',createdAt:at,updatedAt:at});
  await store.db.insert(knowledgeRevisions).values({id:'new-folder-note-rev',knowledgeItemId:'new-folder-note',revisionNumber:1,content:'新增内容',createdAt:at});
  await expect(migration.undo({...base,groupId:target},done.id)).rejects.toMatchObject({code:'ConflictError'});
 });
 it('关联产物需显式选择另一个项目，版本和双端关系保持ID一起迁移',async()=>{
  const ctx={...base,groupId:source},at='2026-10-04T00:00:00.000Z';
  const p=await projects.createProject(ctx,{title:'项目一',creationMode:'free',targetPlatforms:[]});
  const q=await projects.createProject(ctx,{title:'项目二',creationMode:'free',targetPlatforms:[]});
  for(const [id,projectId] of [['artifact-a',p.id],['artifact-b',q.id]] as const){
   await store.db.insert(artifacts).values({id,userId:base.userId,groupId:source,accountId:null,projectId,currentVersionId:`${id}-version`,stage:'writing',artifactType:'script',title:id,createdAt:at,updatedAt:at});
   await store.db.insert(artifactVersions).values({id:`${id}-version`,artifactId:id,versionNumber:1,contentText:'真实脚本版本',createdAt:at});
  }
  await store.db.insert(artifactRelations).values({id:'artifact-edge',sourceArtifactId:'artifact-a',targetArtifactId:'artifact-b',relationType:'derived_from',createdAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  const incomplete=await migration.preview(ctx,body);expect(incomplete.requiredProjectIds).toEqual([q.id]);
  await expect(migration.apply(ctx,{...body,digest:incomplete.digest,idempotencyKey:'incomplete-artifacts'})).rejects.toMatchObject({code:'ConflictError'});
  const complete={...body,projectIds:[p.id,q.id]},preview=await migration.preview(ctx,complete);
  expect(preview.counts.artifact_relations).toBe(1);expect(preview.counts.artifact_versions).toBe(2);
  const done=await migration.apply(ctx,{...complete,digest:preview.digest,idempotencyKey:'complete-artifacts'});
  expect((await store.db.select().from(artifacts)).map(a=>a.groupId)).toEqual([target,target]);
  await migration.undo({...base,groupId:target},done.id);
  expect((await store.db.select().from(artifactRelations))[0]?.id).toBe('artifact-edge');
  expect((await store.db.select().from(artifactVersions)).map(v=>v.contentText)).toEqual(['真实脚本版本','真实脚本版本']);
 });
 it('资源新消费的真实trigger ledger在引用删除后仍保留并阻止撤回',async()=>{
  const ctx={...base,groupId:source},at='2026-10-04T00:00:00.000Z';
  const p=await projects.createProject(ctx,{title:'原素材项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(assets).values({id:'ledger-asset',userId:base.userId,groupId:source,accountId:null,assetType:'image',name:'消费素材',createdAt:at,updatedAt:at});
  await store.db.insert(contentOutputs).values({id:'ledger-original-output',projectId:p.id,title:'原稿',contentType:'image',status:'draft',primaryAssetId:'ledger-asset',createdAt:at,updatedAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},preview=await migration.preview(ctx,body);
  const done=await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'ledger-move'});
  const [grant]=await store.db.select().from(resourceAccessGrants).where(eq(resourceAccessGrants.migrationId,done.id));
  expect(await store.db.select().from(resourceAccessGrantUses)).toHaveLength(0);
  const next=await projects.createProject({...base,groupId:target},{title:'新消费者',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(contentOutputs).values({id:'ledger-consumer',projectId:next.id,title:'新稿',contentType:'image',status:'draft',primaryAssetId:'ledger-asset',createdAt:at,updatedAt:at});
  const [use]=await store.db.select().from(resourceAccessGrantUses).where(eq(resourceAccessGrantUses.grantId,grant!.id));
  expect(use).toMatchObject({userId:base.userId,consumerType:'content_outputs',consumerId:'ledger-consumer'});
  await store.db.delete(contentOutputs).where(eq(contentOutputs.id,'ledger-consumer'));
  expect(await store.db.select().from(resourceAccessGrantUses).where(eq(resourceAccessGrantUses.grantId,grant!.id))).toHaveLength(1);
  await expect(migration.undo({...base,groupId:target},done.id)).rejects.toMatchObject({code:'ConflictError'});
 });
 it('隔离持久库关闭重开后保留迁移和原storageKey授权；撤回恢复来源并撤销目标读取',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'creatoros-group-migration-'));
  let durable:Awaited<ReturnType<typeof createDb>>|undefined;
  try{
   durable=await createDb({dataDir:dir});let seq=0;
   const deps=()=>({db:durable!.db,now:()=>new Date().toISOString(),nextId:(p:string)=>`durable-${p}-${++seq}`});
   const accountGroups=createAccountGroupService(deps());
   const from=(await accountGroups.create(base,{name:'持久来源',idempotencyKey:'durable-source'})).id,to=(await accountGroups.create(base,{name:'持久目标',idempotencyKey:'durable-target'})).id;
   const ctx={...base,groupId:from},targetCtx={...base,groupId:to},at='2026-10-04T00:00:00.000Z';
   const svc=createProjectsService(createProjectRepository(durable.db),deps());
   const p=await svc.createProject(ctx,{title:'持久项目',creationMode:'free',targetPlatforms:[]});
   await durable.db.insert(assets).values({id:'durable-asset',userId:base.userId,groupId:from,accountId:null,assetType:'image',name:'不移动字节',createdAt:at,updatedAt:at});
   await durable.db.insert(assetFiles).values({id:'durable-file',assetId:'durable-asset',versionNumber:1,storageKey:'assets/original/opaque-file.jpg',mimeType:'image/jpeg',fileSize:13,checksum:'fixture-metadata',createdAt:at});
   await durable.db.insert(contentOutputs).values({id:'durable-output',projectId:p.id,title:'持久稿',contentType:'image',status:'draft',primaryAssetId:'durable-asset',createdAt:at,updatedAt:at});
   const body={fromGroupId:from,toGroupId:to,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},moves=createGroupMigrationService(deps()),preview=await moves.preview(ctx,body);
   const done=await moves.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'durable-move'});
   await durable.client.close();durable=undefined;
   durable=await createDb({dataDir:dir});
   const restoredMoves=createGroupMigrationService(deps()),restoredProjects=createProjectsService(createProjectRepository(durable.db),deps()),blobs=createWorkspaceBlobService(durable.db,()=>at);
   expect(await restoredMoves.status(targetCtx,done.id)).toMatchObject({status:'applied'});
   await expect(restoredProjects.getProjectOverviewCore(ctx,p.id)).rejects.toMatchObject({code:'OwnershipError'});
   expect((await restoredProjects.getProjectOverviewCore(targetCtx,p.id)).project.id).toBe(p.id);
   await expect(blobs.authorize(targetCtx,'assets/original/opaque-file.jpg','GET')).resolves.toBeUndefined();
   await expect(blobs.authorize({...targetCtx,userId:'other-user'},'assets/original/opaque-file.jpg','GET')).rejects.toMatchObject({code:'OwnershipError'});
   expect((await durable.db.select().from(assetFiles))[0]?.storageKey).toBe('assets/original/opaque-file.jpg');
   expect(await durable.db.select().from(resourceAccessGrantUses)).toHaveLength(0);
   await restoredMoves.undo(targetCtx,done.id);
   expect((await restoredProjects.getProjectOverviewCore(ctx,p.id)).project.id).toBe(p.id);
   await expect(blobs.authorize(targetCtx,'assets/original/opaque-file.jpg','GET')).rejects.toMatchObject({code:'OwnershipError'});
   await expect(blobs.authorize(ctx,'assets/original/opaque-file.jpg','GET')).resolves.toBeUndefined();
  }finally{await durable?.client.close();await rm(dir,{recursive:true,force:true});}
 },30_000);

 it('目录中已有其它组笔记时拒绝迁移，不能将其父授权链搬走',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source};
  await store.db.insert(knowledgeFolders).values({id:'inconsistent-folder',userId:base.userId,groupId:source,accountId:null,name:'已有异常归属的目录',createdAt:at,updatedAt:at});
  for(const [id,groupId] of [['source-folder-note',source],['other-group-folder-note',target]] as const){
   await store.db.insert(knowledgeItems).values({id,userId:base.userId,groupId,accountId:null,folderId:'inconsistent-folder',currentRevisionId:`${id}-rev`,title:id,createdAt:at,updatedAt:at});
   await store.db.insert(knowledgeRevisions).values({id:`${id}-rev`,knowledgeItemId:id,revisionNumber:1,content:id,createdAt:at});
  }
  await expect(migration.preview(ctx,{fromGroupId:source,toGroupId:target,projectIds:[],knowledgeIds:['source-folder-note'],conversationIds:[]})).rejects.toMatchObject({code:'ConflictError'});
 });
 it('软关联指向其它用户的产物时拒绝迁移，不能默默漏掉外国主根',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source},other={...base,userId:'other-artifact-user'};
  const p=await projects.createProject(ctx,{title:'当前用户项目',creationMode:'free',targetPlatforms:[]});
  const otherGroup=await groups.create(other,{name:'其它用户组',idempotencyKey:'other-user-group'});
  const q=await projects.createProject({...other,groupId:otherGroup.id},{title:'其它用户项目',creationMode:'free',targetPlatforms:[]});
  for(const item of [{id:'owned-artifact',userId:base.userId,groupId:source,projectId:p.id},{id:'foreign-artifact',userId:other.userId,groupId:otherGroup.id,projectId:q.id}])
   await store.db.insert(artifacts).values({...item,accountId:null,stage:'writing',artifactType:'script',title:item.id,createdAt:at,updatedAt:at});
  await store.db.insert(artifactRelations).values({id:'foreign-artifact-edge',sourceArtifactId:'owned-artifact',targetArtifactId:'foreign-artifact',relationType:'derived_from',createdAt:at});
  await expect(migration.preview(ctx,{fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]})).rejects.toMatchObject({code:'OwnershipError'});
 });

 it('复盘所附另一项目需补选；真实发布及明细复合键、留存和指标保持平台账号及ID',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source};
  const p=await projects.createProject(ctx,{title:'复盘项目',creationMode:'free',targetPlatforms:[]}),q=await projects.createProject(ctx,{title:'被复盘作品项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(platformAccounts).values({id:'fact-real-account',userId:base.userId,platform:'douyin',accountHandle:'真实平台账号fixture',externalAccountId:'sec_fixture',createdAt:at,updatedAt:at});
  await groups.registerAccount(ctx,'fact-real-account');
  await store.db.insert(contentOutputs).values({id:'fact-output',projectId:q.id,title:'发布内容',contentType:'video',status:'draft',createdAt:at,updatedAt:at});
  await store.db.insert(productions).values({id:'fact-production',userId:base.userId,contentOutputId:'fact-output',status:'ready',updatedAt:at});
  await store.db.insert(productionSegments).values({id:'fact-segment',userId:base.userId,productionId:'fact-production',title:'片段'});
  await store.db.insert(exportRecords).values({id:'fact-export',userId:base.userId,productionId:'fact-production',format:'mp4',resolution:'1080p',aspectRatio:'16:9',status:'ready',createdAt:at});
  await store.db.insert(publications).values({id:'fact-publication',userId:base.userId,groupId:source,groupVersion:1,membershipVersion:1,accountId:'fact-real-account',contentOutputId:'fact-output',platform:'douyin',accountReference:'sec_fixture',status:'published',currentRevisionId:'fact-revision',externalId:'aweme_fixture',publishedAt:at,createdAt:at,updatedAt:at});
  await store.db.insert(publicationRevisions).values({id:'fact-revision',userId:base.userId,publicationId:'fact-publication',revisionNumber:1,title:'发布版本',createdAt:at});
  await store.db.insert(metricSnapshots).values({id:'fact-snapshot',userId:base.userId,groupId:source,accountId:'fact-real-account',publicationId:'fact-publication',capturedAt:at,source:'platform',createdAt:at});
  await store.db.insert(metricValues).values({id:'fact-metric',userId:base.userId,groupId:source,accountId:'fact-real-account',metricSnapshotId:'fact-snapshot',metricKey:'views',numericValue:7});
  await store.db.insert(retentionPoints).values({id:'fact-retention',userId:base.userId,groupId:source,accountId:'fact-real-account',publicationId:'fact-publication',capturedAt:at,positionMs:1000,retentionRate:0.5,viewerCount:3});
  await store.db.insert(publicationTraffic).values({userId:base.userId,groupId:source,accountId:'fact-real-account',publicationId:'fact-publication',externalId:'aweme_fixture',requestedAt:at,status:'succeeded',data:{views:7}});
  for(const capability of ['metrics','content'])await store.db.insert(publicationSyncState).values({userId:base.userId,groupId:source,accountId:'fact-real-account',publicationId:'fact-publication',capability,externalId:'aweme_fixture',attemptedAt:at,lastSucceededAt:at});
  await store.db.insert(reviews).values({id:'fact-review',userId:base.userId,groupId:source,accountId:null,projectId:p.id,reviewType:'project',status:'completed',periodStart:at,periodEnd:at,createdAt:at});
  await store.db.insert(reviewPublications).values({id:'fact-review-edge',userId:base.userId,reviewId:'fact-review',publicationId:'fact-publication'});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},incomplete=await migration.preview(ctx,body);
  expect(incomplete.requiredProjectIds).toEqual([q.id]);
  await expect(migration.apply(ctx,{...body,digest:incomplete.digest,idempotencyKey:'incomplete-facts'})).rejects.toMatchObject({code:'ConflictError'});
  const complete={...body,projectIds:[p.id,q.id]},preview=await migration.preview(ctx,complete);
  expect(preview.counts.productions).toBe(1);expect(preview.counts.production_segments).toBe(1);expect(preview.counts.export_records).toBe(1);expect(preview.counts.retention_points).toBe(1);expect(preview.counts.publication_sync_state).toBe(2);expect(preview.counts.publication_traffic).toBe(1);
  const done=await migration.apply(ctx,{...complete,digest:preview.digest,idempotencyKey:'complete-facts'});
  expect((await store.db.select().from(publicationTraffic))[0]).toMatchObject({groupId:target,accountId:'fact-real-account',publicationId:'fact-publication',data:{views:7}});
  expect((await store.db.select().from(publicationSyncState)).map(s=>s.groupId)).toEqual([target,target]);
  expect((await store.db.select().from(retentionPoints))[0]).toMatchObject({groupId:target,accountId:'fact-real-account',retentionRate:0.5});
  await migration.undo({...base,groupId:target},done.id);
  expect((await store.db.select().from(publications))[0]).toMatchObject({groupId:source,accountId:'fact-real-account',externalId:'aweme_fixture',membershipVersion:1});
  expect((await store.db.select().from(publicationSyncState)).map(s=>s.groupId)).toEqual([source,source]);
  expect((await store.db.select().from(metricValues))[0]).toMatchObject({id:'fact-metric',groupId:source,numericValue:7});
 });

 it('仅通过AI references关联项目的任务及其真实execution也阻挡，取消后旧冻结不被迁移',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source};
  const p=await projects.createProject(ctx,{title:'通过references关联的项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(aiTasks).values({id:'reference-ai-task',userId:base.userId,groupId:source,groupVersion:1,accountId:null,taskType:'script.draft',status:'queued',idempotencyKey:'ai-ref-migration',requestedAt:at});
  await store.db.insert(aiTaskReferences).values({id:'reference-project-edge',aiTaskId:'reference-ai-task',entityType:'project',entityId:p.id,relationType:'input'});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  await expect(migration.preview(ctx,body)).rejects.toMatchObject({code:'ConflictError'});
  await store.db.update(aiTasks).set({status:'succeeded',completedAt:at}).where(eq(aiTasks.id,'reference-ai-task'));
  const execution=createPersistentTaskService(store.db),task=await execution.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'reference-ai-task',idempotencyKey:'ai-ref-execution',payload:{aiTaskId:'reference-ai-task'}});
  await store.db.update(aiTasks).set({executionTaskId:task.id}).where(eq(aiTasks.id,'reference-ai-task'));
  await expect(migration.preview(ctx,body)).rejects.toMatchObject({code:'ConflictError'});
  await execution.command(ctx,{taskIds:[task.id],command:'cancel',idempotencyKey:'cancel-ai-ref-execution'});
  const preview=await migration.preview(ctx,body);
  await migration.apply(ctx,{...body,digest:preview.digest,idempotencyKey:'move-ai-referenced-project'});
  expect((await store.db.select().from(aiTasks).where(eq(aiTasks.id,'reference-ai-task')))[0]).toMatchObject({groupId:source,groupVersion:1,executionTaskId:task.id});
 });

 it('真实雷达根仍属来源组时预览和提交明确阻挡；正文同名字符串不触发引用判断',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source};
  const p=await projects.createProject(ctx,{title:'雷达项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(candidates).values({id:'external-topic',userId:base.userId,groupId:source,accountId:null,title:'共享选题',source:'idea',createdAt:at,updatedAt:at});
  await store.db.insert(intelligenceItems).values({id:'external-item',userId:base.userId,groupId:source,accountId:null,type:'video',platform:'douyin',canonicalUrl:'https://example.com/item',canonicalUrlHash:'item-fixture-hash',capturedAt:at,createdAt:at,updatedAt:at});
  await store.db.insert(intelligenceSources).values({id:'external-source',userId:base.userId,groupId:source,accountId:null,type:'creator',platform:'douyin',displayName:'真实情报来源fixture',externalKey:'external-fixture',createdAt:at,updatedAt:at});
  await store.db.insert(sourceSnapshots).values({id:'external-snapshot',userId:base.userId,groupId:source,accountId:null,sourceId:'external-source',runId:'historical-run-provenance',itemId:'external-item',capturedAt:at,finalUrl:'https://example.com/item',contentHash:'snapshot-fixture-hash'});
  await store.db.insert(intelligenceTransforms).values({id:'external-transform',userId:base.userId,groupId:source,accountId:null,itemId:'external-item',sourceSnapshotId:'external-snapshot',idempotencyKey:'external-transform-fixture',createdAt:at,updatedAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},plain=await migration.preview(ctx,body);
  await store.db.insert(projectIntelligenceReferences).values({id:'external-radar-reference',userId:base.userId,groupId:source,accountId:null,projectId:p.id,topicId:'external-topic',itemId:'external-item',sourceSnapshotId:'external-snapshot',transformId:'external-transform',transcriptHash:'transcript-fixture-hash',createdAt:at});
  await expect(migration.preview(ctx,body)).rejects.toThrow('选题');
  await expect(migration.apply(ctx,{...body,digest:plain.digest,idempotencyKey:'blocked-external-radar'})).rejects.toMatchObject({code:'ConflictError'});
  await store.db.delete(projectIntelligenceReferences).where(eq(projectIntelligenceReferences.id,'external-radar-reference'));
  await store.db.update(projectRows).set({briefDetail:{coreMessage:'external-item'}}).where(eq(projectRows.id,p.id));
  expect((await migration.preview(ctx,body)).projects).toHaveLength(1);
  // 仅明确协议字段是活引用：同一真实ID置于正文不会被解释成雷达依赖。
  await store.db.update(projectRows).set({briefDetail:{contentRadarEvidence:{sourceReferences:[{kind:'original_video',platform:'douyin',label:'来源',url:'https://example.com/item',intelligenceItemId:'external-item'}]}}}).where(eq(projectRows.id,p.id));
  await expect(migration.preview(ctx,body)).rejects.toThrow('雷达作品');
 });
 it('真实校准量表和独立经验不可隐式搬走；目标组同用户已有量表可读才允许引用',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source},p=await projects.createProject(ctx,{title:'带校准的项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(contentOutputs).values({id:'external-predicted-output',projectId:p.id,title:'待校准稿',contentType:'video',status:'draft',createdAt:at,updatedAt:at});
  await store.db.insert(rubrics).values({id:'external-rubric',userId:base.userId,groupId:source,accountId:null,name:'独立校准量表',currentVersionId:'external-rubric-version',createdAt:at});
  await store.db.insert(rubricVersions).values({id:'external-rubric-version',userId:base.userId,groupId:source,accountId:null,rubricId:'external-rubric',versionNumber:1,createdAt:at});
  await store.db.insert(predictions).values({id:'external-prediction',userId:base.userId,groupId:source,accountId:null,subjectType:'content_output',subjectId:'external-predicted-output',rubricVersionId:'external-rubric-version',confidence:'high',createdAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  await expect(migration.preview(ctx,body)).rejects.toThrow('校准量表版本');
  // 独立根已有目标组归属的真实fixture；迁移服务不得修改它们。
  await store.db.update(rubrics).set({groupId:target}).where(eq(rubrics.id,'external-rubric'));
  await store.db.update(rubricVersions).set({groupId:target}).where(eq(rubricVersions.id,'external-rubric-version'));
  const allowed=await migration.preview(ctx,body);expect(allowed.counts.rubrics).toBeUndefined();expect(allowed.counts.rubric_versions).toBeUndefined();
  await store.db.insert(learnings).values({id:'external-independent-learning',userId:base.userId,groupId:source,accountId:null,title:'无project根的独立经验',createdAt:at,updatedAt:at});
  await store.db.insert(learningApplications).values({id:'external-learning-use',userId:base.userId,groupId:source,accountId:null,learningId:'external-independent-learning',projectId:p.id,appliedAt:at});
  await expect(migration.preview(ctx,body)).rejects.toThrow('经验');
 });
 it('另一项目的reportArtifact活引用提示明确补选，完整选中才迁移；自闭包不误挡',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source},p=await projects.createProject(ctx,{title:'复盘主体',creationMode:'free',targetPlatforms:[]}),q=await projects.createProject(ctx,{title:'报告归属项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(artifacts).values({id:'external-report-artifact',userId:base.userId,groupId:source,accountId:null,projectId:q.id,stage:'review',artifactType:'review_report',title:'另一项目的报告',createdAt:at,updatedAt:at});
  await store.db.insert(reviews).values({id:'external-report-review',userId:base.userId,groupId:source,accountId:null,projectId:p.id,reportArtifactId:'external-report-artifact',reviewType:'project',status:'completed',periodStart:at,periodEnd:at,createdAt:at});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]},incomplete=await migration.preview(ctx,body);
  expect(incomplete.requiredProjectIds).toEqual([q.id]);
  await expect(migration.apply(ctx,{...body,digest:incomplete.digest,idempotencyKey:'incomplete-report'})).rejects.toMatchObject({code:'ConflictError'});
  const complete={...body,projectIds:[p.id,q.id]},preview=await migration.preview(ctx,complete);
  const done=await migration.apply(ctx,{...complete,digest:preview.digest,idempotencyKey:'complete-report'});
  await migration.undo({...base,groupId:target},done.id);
 });

 it('排期选题、定位版本和待采纳校准建议是独立工作，不能随project隐式搬走',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source},p=await projects.createProject(ctx,{title:'带独立工作引用的项目',creationMode:'free',targetPlatforms:[]});
  const body={fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
  await store.db.insert(candidates).values({id:'calendar-independent-topic',userId:base.userId,groupId:source,accountId:null,title:'独立选题',source:'idea',createdAt:at,updatedAt:at});
  await store.db.insert(contentCalendarEntries).values({id:'independent-topic-plan',userId:base.userId,groupId:source,accountId:null,projectId:p.id,candidateId:'calendar-independent-topic',plannedDate:'2026-10-05',plannedAt:'2026-10-05T09:00:00.000Z',createdAt:at,updatedAt:at});
  await expect(migration.preview(ctx,body)).rejects.toThrow('排期选题');
  await store.db.delete(contentCalendarEntries).where(eq(contentCalendarEntries.id,'independent-topic-plan'));
  await store.db.insert(creatorProfiles).values({id:'independent-profile',userId:base.userId,groupId:source,accountId:null,createdAt:at,updatedAt:at});
  await store.db.insert(positioningStatements).values({id:'independent-positioning-version',userId:base.userId,groupId:source,accountId:null,profileId:'independent-profile',versionNumber:1,createdAt:at});
  await store.db.insert(aiTasks).values({id:'historical-topic-task',userId:base.userId,groupId:source,groupVersion:1,accountId:null,taskType:'topic.propose',status:'succeeded',idempotencyKey:'historical-topic-task',requestedAt:at,completedAt:at});
  await store.db.insert(topicProposalFeedback).values({id:'independent-positioning-feedback',userId:base.userId,groupId:source,accountId:null,projectId:p.id,taskId:'historical-topic-task',proposalId:'proposal-fixture',propositionKey:'proposition-fixture',title:'已确认选题',angle:'角度',reason:'理由',note:'记录',positioningVersionId:'independent-positioning-version',requestHash:'sha256:'+'0'.repeat(64),createdAt:at});
  await expect(migration.preview(ctx,body)).rejects.toThrow('选题定位版本');
  await store.db.delete(topicProposalFeedback).where(eq(topicProposalFeedback.id,'independent-positioning-feedback'));
  await store.db.insert(learnings).values({id:'project-calibration-learning',userId:base.userId,groupId:source,accountId:null,projectId:p.id,title:'项目经验',createdAt:at,updatedAt:at});
  await store.db.insert(rubrics).values({id:'pending-suggestion-rubric',userId:base.userId,groupId:source,accountId:null,name:'来源组量表',createdAt:at});
  await store.db.insert(calibrationRuleSuggestions).values({id:'pending-independent-suggestion',userId:base.userId,groupId:source,accountId:null,learningId:'project-calibration-learning',rubricId:'pending-suggestion-rubric',status:'pending',createdAt:at});
  await expect(migration.preview(ctx,body)).rejects.toThrow('待采纳校准建议');
  expect((await store.db.select().from(calibrationRuleSuggestions))[0]).toMatchObject({groupId:source,status:'pending'});
 });
 it('外部量表版本即使真实存在，也不能跨用户接受其引用',async()=>{
  const at='2026-10-04T00:00:00.000Z',ctx={...base,groupId:source},other={...base,userId:'foreign-rubric-user'},outside=await groups.create(other,{name:'其它用户的量表组',idempotencyKey:'foreign-rubric'});
  const p=await projects.createProject(ctx,{title:'误引用其它用户量表的历史项目',creationMode:'free',targetPlatforms:[]});
  await store.db.insert(contentOutputs).values({id:'foreign-predicted-output',projectId:p.id,title:'稿件',contentType:'video',status:'draft',createdAt:at,updatedAt:at});
  await store.db.insert(rubrics).values({id:'foreign-rubric-root',userId:other.userId,groupId:outside.id,accountId:null,name:'其它用户量表',createdAt:at});
  await store.db.insert(rubricVersions).values({id:'foreign-rubric-version',userId:other.userId,groupId:outside.id,accountId:null,rubricId:'foreign-rubric-root',versionNumber:1,createdAt:at});
  await store.db.insert(predictions).values({id:'foreign-reference-prediction',userId:base.userId,groupId:source,accountId:null,subjectType:'content_output',subjectId:'foreign-predicted-output',rubricVersionId:'foreign-rubric-version',confidence:'high',createdAt:at});
  await expect(migration.preview(ctx,{fromGroupId:source,toGroupId:target,projectIds:[p.id],knowledgeIds:[],conversationIds:[]})).rejects.toMatchObject({code:'OwnershipError'});
 });

});
