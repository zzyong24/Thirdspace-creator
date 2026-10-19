import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,type Db,reviews,reviewInsights,learnings,learningApplications,aiMessages,aiTasks,aiConversations,contentOutputs,eq} from '@creatoros/backend';
import {createAccountGroupService,createGroupMigrationService} from '../modules/platform-account';
import {createProjectsService,createProjectRepository} from '../modules/projects';
import {createReviewsService} from '../modules/reviews';
import {createLearningsService} from '../modules/learnings';
import {createAiService,type ServiceDeps as AiDeps} from '../modules/ai';
import type {RequestContext} from '@creatoros/contract';
const url=process.env.CREATOROS_TEST_POSTGRES_URL;
const cleanups:Array<()=>Promise<unknown>>=[],releases:Array<()=>void>=[];
afterEach(async()=>{for(const release of releases.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);releases.push(release);return {promise,release};}
function outcome(p:Promise<unknown>){let done=false;const result=p.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};});return {result,done:()=>done};}
// 仅观察并暂停真实SQL执行阶段；不替换SQL、授权结果或事务。递归代理保留公共服务创建的PG事务。
function observeInsert(db:Db,table:unknown,reached:ReturnType<typeof gate>,resume:ReturnType<typeof gate>):Db {
 let paused=false;
 function statement(query:any):any{return new Proxy(query,{get(target,key){if(key==='then')return async(resolve:any,reject:any)=>{if(!paused){paused=true;reached.release();await resume.promise;}return target.then(resolve,reject);};const value=target[key];return typeof value==='function'?(...args:any[])=>{const result=value.apply(target,args);return result&&typeof result==='object'?statement(result):result;}:value;}});}
 function database(actual:any):any{return new Proxy(actual,{get(target,key){const value=target[key];if(key==='transaction')return (work:any,...args:any[])=>value.call(target,(tx:any)=>work(database(tx)),...args);if(key==='insert')return (selected:unknown)=>{const result=value.call(target,selected);return selected===table?statement(result):result;};return typeof value==='function'?value.bind(target):value;}});}
 return database(db);
}
const families=['review-create','review-insight','learning-create','learning-application','conversation-message','ai-task','conversation-create','learning-review','learning-adoption-source','review-output','ai-task-output'] as const;
for(const family of families)for(const order of ['writer-checked-first','migration-validated-first'] as const){
 it.skipIf(!url)(`${family} / ${order}：公共服务必须锁真实父行，拒绝旧scope迟到写入`,async()=>{
  const parsed=new URL(url!);assertOwnedPostgresUrl(parsed.toString());
  const name='t1022_shared_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
  await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname='/'+name;
  const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());
  const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_writer'});cleanups.push(()=>writerPool.end());
  const migrationPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_migration'});cleanups.push(()=>migrationPool.end());
  const writer=drizzle(writerPool) as unknown as Db,migrationDb=drizzle(migrationPool) as unknown as Db;
  let n=0;const deps={db:runtime.db,now:()=>new Date().toISOString(),nextId:(p:string)=>p+'-'+ ++n};
  const base:RequestContext={userId:'owner-'+name,source:'user',requestId:'shared-parent-race'},groups=createAccountGroupService(deps);
  const from=(await groups.create(base,{name:'来源',idempotencyKey:'from'})).id,to=(await groups.create(base,{name:'目标',idempotencyKey:'to'})).id,ctx={...base,groupId:from},targetCtx={...base,groupId:to};
  const projects=createProjectsService(createProjectRepository(runtime.db),deps);
  const project=await projects.createProject(ctx,{title:'迁移项目',creationMode:'free',targetPlatforms:[]}),other=await projects.createProject(ctx,{title:'留原组项目',creationMode:'free',targetPlatforms:[]});
  // 授权与活动端口调用真实公共Projects服务；发布/分析外部事实为空，明确无指标或发布。
  const reviewsService=(db:Db)=>createReviewsService({...deps,db,projects:{verifyProjectOwned:async(c,id)=>{await projects.getProject(c,id);},verifyOutputOwned:async(c,id)=>{await projects.getOutput(c,id);},recordActivity:async()=>{}},publishing:{listProjectPublications:async()=>[]},analytics:{getProjectSnapshots:async()=>({})}});
  const learningService=(db:Db)=>createLearningsService({...deps,db,assertReviewOwned:(c,id)=>reviewsService(runtime.db).getReview(c,id),projects:{assertOwnsProject:async(c,id)=>{await projects.getProject(c,id);},recordActivity:async()=>{}}});
  // 本测试不执行AI采纳；未使用端口一旦被调用就明确失败，不伪造领域事实。
  const unavailable=new Proxy({}, {get:()=>()=>{throw new Error("此探针不装配AI采纳端口");}});
  const aiService=(db:Db)=>createAiService({...deps,db,artifacts:unavailable as AiDeps["artifacts"],knowledge:unavailable as AiDeps["knowledge"],candidate:unavailable as AiDeps["candidate"],learnings:unavailable as AiDeps["learnings"],publishing:unavailable as AiDeps["publishing"],materialLinks:unavailable as AiDeps["materialLinks"],positioning:unavailable as AiDeps["positioning"],calibration:unavailable as AiDeps["calibration"]});
  const review=await reviewsService(runtime.db).createReview(ctx,project.id,{reviewType:'project'}),learning=await learningService(runtime.db).createLearning(ctx,{title:'来源经验',projectId:project.id}),conversation=await aiService(runtime.db).createConversation(ctx,{title:'独立会话'});
  await runtime.db.insert(contentOutputs).values({id:'selected-output',projectId:project.id,groupId:from,title:'真实目标作品',contentType:'video',status:'draft',createdAt:deps.now(),updatedAt:deps.now()});
  const sourceTask=await aiService(runtime.db).createTask(ctx,{taskType:'custom.source.test',attemptId:'source-task-attempt-123',inputData:{projectId:project.id}});
  await runtime.db.update(aiTasks).set({status:'succeeded',completedAt:deps.now()}).where(eq(aiTasks.id,sourceTask.id));
  const selection={fromGroupId:from,toGroupId:to,projectIds:family==='conversation-message'?[]:[project.id],knowledgeIds:[],conversationIds:family==='conversation-message'?[conversation.id]:[]};
  const reached=gate(),resume=gate(),migrationPaused=gate(),migrationResume=gate();
  const table=(family==='review-create'||family==='review-output')?reviews:family==='review-insight'?reviewInsights:family==='learning-create'?learnings:family==='learning-application'?learningApplications:(family==='ai-task'||family==='ai-task-output')?aiTasks:family==='conversation-create'?aiConversations:family==='learning-review'||family==='learning-adoption-source'?learnings:aiMessages;
  const dbForWriter=order==='writer-checked-first'?observeInsert(writer,table,reached,resume):writer;
  const write=()=>family==='review-output'?reviewsService(dbForWriter).createReview(ctx,project.id,{reviewType:'output',contentOutputId:'selected-output'}):family==='ai-task-output'?aiService(dbForWriter).createTask(ctx,{taskType:'custom.parent.test',attemptId:'shared-task-attempt-123',inputData:{projectId:project.id,contentOutputId:'selected-output'}}):family==='review-create'?reviewsService(dbForWriter).createReview(ctx,project.id,{reviewType:'project'}):family==='review-insight'?reviewsService(dbForWriter).createInsight(ctx,review.id,{insightType:'strategy',title:'迟到洞察'}):family==='learning-create'?learningService(dbForWriter).createLearning(ctx,{title:'迟到经验',projectId:project.id}):family==='learning-application'?learningService(dbForWriter).applyLearning(ctx,learning.id,{projectId:other.id}):family==='conversation-create'?aiService(dbForWriter).createConversation(ctx,{title:'迟到项目会话',projectId:project.id}):family==='learning-review'?learningService(dbForWriter).promoteReviewInsight(ctx,{reviewId:review.id,insightTitle:'迟到复盘经验',insightBody:'源自真实复盘',learningType:'strategy',recommendation:''}):family==='learning-adoption-source'?learningService(dbForWriter).createLearning(ctx,{title:'迟到无项目采纳',adoptionKey:'source-adoption-key',sourceTaskId:sourceTask.id}):family==='ai-task'?aiService(dbForWriter).createTask(ctx,{taskType:'custom.parent.test',attemptId:'shared-task-attempt-123',inputData:{projectId:project.id}}):aiService(dbForWriter).createMessage(ctx,conversation.id,{content:'迟到消息'});
  const moves=createGroupMigrationService({...deps,db:migrationDb,observePhase:order==='migration-validated-first'?async phase=>{if(phase==='apply:validated'){migrationPaused.release();await migrationResume.promise;}}:undefined});
  const preview=await moves.preview(ctx,selection);
  async function waiting(app:string,done:()=>boolean){for(let attempt=0;attempt<300;attempt++){const stat=await runtime.pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name=$2',[name,name+'_'+app]);if(stat.rows.some(r=>r.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(r=>setTimeout(r,10));}throw new Error('真实PG未完成或未进入Lock等待');}
  let wrote:ReturnType<typeof outcome>,moved:ReturnType<typeof outcome>;
  if(order==='writer-checked-first'){
   wrote=outcome(write());await reached.promise;moved=outcome(moves.apply(ctx,{...selection,digest:preview.digest,idempotencyKey:'move'}));
   let blocked=false;try{blocked=await waiting('migration',moved.done);}finally{resume.release();}
   expect(blocked).toBe(true);expect((await wrote.result).error).toBeUndefined();expect((await moved.result).error).toMatchObject({code:'ConflictError'});
  }else{
   moved=outcome(moves.apply(ctx,{...selection,digest:preview.digest,idempotencyKey:'move'}));await migrationPaused.promise;wrote=outcome(write());
   let blocked=false;try{blocked=await waiting('writer',wrote.done);}finally{migrationResume.release();}
   expect(blocked).toBe(true);expect((await moved.result).error).toBeUndefined();expect((await wrote.result).error).toBeDefined();
  }
  const rows=(family==='review-create'||family==='review-output')?await runtime.pool.query('SELECT r.group_id,p.group_id AS parent_group FROM reviews r JOIN projects p ON p.id=r.project_id WHERE r.project_id=$1',[project.id]):family==='review-insight'?await runtime.pool.query('SELECT i.group_id,r.group_id AS parent_group FROM review_insights i JOIN reviews r ON r.id=i.review_id WHERE i.review_id=$1',[review.id]):family==='learning-create'?await runtime.pool.query('SELECT l.group_id,p.group_id AS parent_group FROM learnings l JOIN projects p ON p.id=l.project_id WHERE l.project_id=$1',[project.id]):family==='learning-application'?await runtime.pool.query('SELECT a.group_id,l.group_id AS parent_group,p.group_id AS target_project_group FROM learning_applications a JOIN learnings l ON l.id=a.learning_id JOIN projects p ON p.id=a.project_id WHERE a.learning_id=$1',[learning.id]):family==='conversation-create'?await runtime.pool.query('SELECT c.group_id,p.group_id AS parent_group FROM ai_conversations c JOIN projects p ON p.id=c.project_id WHERE c.project_id=$1',[project.id]):family==='learning-review'?await runtime.pool.query('SELECT l.group_id,r.group_id AS parent_group FROM learnings l JOIN reviews r ON r.id=l.review_id WHERE l.review_id=$1',[review.id]):family==='learning-adoption-source'?await runtime.pool.query('SELECT l.group_id FROM learnings l WHERE l.user_id=$1 AND l.title=$2',[ctx.userId,'迟到无项目采纳']):(family==='ai-task'||family==='ai-task-output')?await runtime.pool.query('SELECT a.group_id,p.group_id AS parent_group FROM ai_tasks a JOIN projects p ON p.id=a.project_id WHERE a.project_id=$1 AND a.attempt_id=$2',[project.id,'shared-task-attempt-123']):await runtime.pool.query('SELECT m.content,c.group_id AS parent_group FROM ai_messages m JOIN ai_conversations c ON c.id=m.conversation_id WHERE c.id=$1',[conversation.id]);
  for(const row of rows.rows){if('group_id' in row && 'parent_group' in row)expect(row.group_id).toBe(row.parent_group);if(family==='learning-adoption-source')expect(row.group_id).toBe(from);if('target_project_group' in row)expect(row.group_id).toBe(row.target_project_group);}
  if(order==='migration-validated-first')expect(family==='review-create'||family==='review-output'||family==='learning-create'?rows.rowCount:rows.rowCount).toBe(family==='review-create'||family==='review-output'||family==='learning-create'?1:0);
  const readCtx=order==='writer-checked-first'?ctx:targetCtx;
  if(family==='review-create'||family==='review-output')expect((await reviewsService(runtime.db).listReviews(readCtx,project.id)).length).toBe(rows.rowCount);
  if(family==='review-insight')expect((await reviewsService(runtime.db).listReviewInsights(readCtx,review.id)).length).toBe(rows.rowCount);
  if(family==='learning-create')expect((await learningService(runtime.db).listLearnings(readCtx,{limit:100,offset:0},{projectId:project.id})).rows.length).toBe(rows.rowCount);
  if(family==='learning-application')expect((await learningService(runtime.db).getLearning(readCtx,learning.id)).reuseCount).toBe(rows.rowCount);
  if(family==='ai-task'||family==='ai-task-output')expect((await aiService(runtime.db).listTasks(readCtx,{limit:100,offset:0,projectId:project.id})).rows.filter(row=>row.attemptId==='shared-task-attempt-123').length).toBe(rows.rowCount);
  if(family==='learning-adoption-source')expect((await learningService(runtime.db).listLearnings(ctx,{limit:100,offset:0})).rows.filter(row=>row.title==='迟到无项目采纳').length).toBe(rows.rowCount);
  if(family==='conversation-message')expect((await aiService(runtime.db).listMessages(readCtx,conversation.id)).length).toBe(rows.rowCount);
 },180000);
}

async function archiveFixture(){
 const parsed=new URL(url!);assertOwnedPostgresUrl(parsed.toString());
 const name='t1022_archive_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname='/'+name;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());
 const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_writer'}),otherPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_other'});cleanups.push(()=>writerPool.end(),()=>otherPool.end());
 const writer=drizzle(writerPool) as unknown as Db,other=drizzle(otherPool) as unknown as Db;
 let n=0;const deps={db:runtime.db,now:()=>new Date().toISOString(),nextId:(p:string)=>p+'-'+ ++n},base:RequestContext={userId:name,source:'user',requestId:'archive-race'};
 const groups=createAccountGroupService(deps),group=await groups.create(base,{name:'可归档组',idempotencyKey:'group'}),ctx={...base,groupId:group.id};
 const unavailable=new Proxy({}, {get:()=>()=>{throw new Error('本探针不执行AI采纳');}});
 const ai=(db:Db,extra:Partial<AiDeps>={})=>createAiService({...deps,db,...extra,artifacts:unavailable as AiDeps['artifacts'],knowledge:unavailable as AiDeps['knowledge'],candidate:unavailable as AiDeps['candidate'],learnings:unavailable as AiDeps['learnings'],publishing:unavailable as AiDeps['publishing'],materialLinks:unavailable as AiDeps['materialLinks'],positioning:unavailable as AiDeps['positioning'],calibration:unavailable as AiDeps['calibration']});
 const projects=createProjectsService(createProjectRepository(runtime.db),deps);
 const learning=(db:Db)=>createLearningsService({...deps,db,projects:{assertOwnsProject:async(c,id)=>{await projects.getProject(c,id);},recordActivity:async()=>{}}});
 const waiting=async(app:string,done:()=>boolean)=>{for(let attempt=0;attempt<300;attempt++){const stat=await runtime.pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name=$2',[name,name+'_'+app]);if(stat.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(r=>setTimeout(r,10));}throw Error('真实PG未进入锁等待或完成');};
 return {runtime,writer,other,deps,base,group,ctx,ai,learning,projects,waiting};
}
for(const family of ['learning-create','learning-adopt','conversation-create'] as const)for(const order of ['writer-first','archive-first'] as const){
 it.skipIf(!url)(`无parent ${family} / ${order}：组归档与公共创建使用同一真实组锁`,async()=>{
  const f=await archiveFixture(),paused=gate(),resume=gate();
  const write=(db:Db)=>family==='conversation-create'?f.ai(db).createConversation(f.ctx,{title:'归档竞争会话'}):family==='learning-adopt'?f.learning(db).adoptLearning(f.ctx,{title:'归档竞争采纳'}):f.learning(db).createLearning(f.ctx,{title:'归档竞争经验'});
  if(order==='writer-first'){
   const table=family==='conversation-create'?aiConversations:learnings,child=outcome(write(observeInsert(f.writer,table,paused,resume)));await paused.promise;
   const archived=outcome(createAccountGroupService({...f.deps,db:f.other}).archive(f.base,f.group.id,f.group.version));
   let blocked=false;try{blocked=await f.waiting('other',archived.done);}finally{resume.release();}
   expect(blocked).toBe(true);expect((await child.result).error).toBeUndefined();expect((await archived.result).error).toBeUndefined();
  }else{
   const archived=outcome(f.other.transaction(async tx=>{await createAccountGroupService({...f.deps,db:tx as unknown as Db}).archive(f.base,f.group.id,f.group.version);paused.release();await resume.promise;}));await paused.promise;
   const child=outcome(write(f.writer));let blocked=false;try{blocked=await f.waiting('writer',child.done);}finally{resume.release();}
   expect(blocked).toBe(true);expect((await archived.result).error).toBeUndefined();expect((await child.result).error).toMatchObject({code:'OwnershipError'});
  }
  expect((await createAccountGroupService(f.deps).get(f.base,f.group.id)).status).toBe('archived');
  const rows=family==='conversation-create'?(await f.ai(f.runtime.db).listConversations(f.ctx,{limit:100,offset:0})).rows:(await f.learning(f.runtime.db).listLearnings(f.ctx,{limit:100,offset:0})).rows;
  expect(rows).toHaveLength(order==='writer-first'?1:0);
 },180000);
}
it.skipIf(!url)('同组两个真实公共AI任务创建：先取得成员组UPDATE，禁止SHARE升级死锁',async()=>{
 const f=await archiveFixture(),paused=gate(),resume=gate();
 const first=await f.projects.createProject(f.ctx,{title:'项目一',creationMode:'free',targetPlatforms:[]}),second=await f.projects.createProject(f.ctx,{title:'项目二',creationMode:'free',targetPlatforms:[]});
 const one=outcome(f.ai(observeInsert(f.writer,aiTasks,paused,resume)).createTask(f.ctx,{taskType:'custom.parallel',attemptId:'parallel-task-first-123',inputData:{projectId:first.id}}));await paused.promise;
 const two=outcome(f.ai(f.other).createTask(f.ctx,{taskType:'custom.parallel',attemptId:'parallel-task-second-123',inputData:{projectId:second.id}}));
 let blocked=false;try{blocked=await f.waiting('other',two.done);}finally{resume.release();}
 expect(blocked).toBe(true);expect((await one.result).error).toBeUndefined();expect((await two.result).error).toBeUndefined();
 expect((await f.ai(f.runtime.db).listTasks(f.ctx,{limit:100,offset:0})).rows).toHaveLength(2);
},180000);
it.skipIf(!url)('AI任务真实运行准备先读旧项目：移组可提交，落库锁内必须重验实际项目拒绝旧scope',async()=>{
 const f=await archiveFixture(),paused=gate(),resume=gate();
 const project=await f.projects.createProject(f.ctx,{title:'准备期移组项目',creationMode:'free',targetPlatforms:[]});
 const to=await createAccountGroupService(f.deps).create(f.base,{name:'移入组',idempotencyKey:'target'});
 const selection={fromGroupId:f.group.id,toGroupId:to.id,projectIds:[project.id],knowledgeIds:[],conversationIds:[]},moves=createGroupMigrationService({...f.deps,db:f.other}),preview=await moves.preview(f.ctx,selection);
 const write=outcome(f.ai(f.writer,{resolveTaskRuntimeData:async(ctx,_type,input)=>{await f.projects.getProject(ctx,String(input.projectId));paused.release();await resume.promise;return {};}}).createTask(f.ctx,{taskType:'custom.prepared',attemptId:'prepared-task-attempt-123',inputData:{projectId:project.id}}));
 await paused.promise;try{expect((await moves.apply(f.ctx,{...selection,digest:preview.digest,idempotencyKey:'move'})).status).toBe('applied');}finally{resume.release();}
 expect((await write.result).error).toMatchObject({code:'OwnershipError'});
 expect((await f.ai(f.runtime.db).listTasks(f.ctx,{limit:100,offset:0})).rows).toHaveLength(0);
 expect((await f.ai(f.runtime.db).listTasks({...f.ctx,groupId:to.id},{limit:100,offset:0})).rows).toHaveLength(0);
},180000);
