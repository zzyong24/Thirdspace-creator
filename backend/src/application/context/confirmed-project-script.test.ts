import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,artifacts,eq,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createProjectsService,createProjectRepository} from '../../modules/projects';
import {createArtifactsService} from '../../modules/artifacts';
import {createScriptDraftTargetService} from '../../modules/artifacts/script-draft-target.service';
import {createConfirmedProjectScriptReader,createConfirmedProjectReviewScriptReader} from './confirmed-project-script';
import {createReviewSubjectContext} from './review-subject';
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>new Date(1791043200000+seq++).toISOString(),nextId=(prefix:string)=>`${prefix}-reader-${++seq}`;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(){
 const ctx:RequestContext={userId:'t1331-reader',accountId:nextId('account'),requestId:'test',source:'user'};
 const projectsFor=(store:Db)=>createProjectsService(createProjectRepository(store),{now,nextId});
 const projects=projectsFor(db),project=await projects.createProject(ctx,{title:'确认稿事实'});
 const serviceFor=(store:Db)=>createArtifactsService({db:store,now,nextId,assertProjectOwned:(c,id)=>projectsFor(store).getProject(c,id),resolveOutputProjectId:(c,id)=>projectsFor(store).getProjectIdByOutput(c,id)});
 const service=serviceFor(db),ports={projectsService:projects,artifactsService:service},read=createConfirmedProjectScriptReader(ports);
 const create=(artifactType:string,text='',data:Record<string,unknown>={})=>service.createArtifact(ctx,{projectId:project.id,title:'保存稿',stage:'script',artifactType,initialContentText:text,initialContentData:data});
 return {ctx,projects,projectsFor,project,service,serviceFor,ports,read,create};
}
it('T1382 准备来源不成为确认稿，正式空稿保持权威且来源可显式读取',async()=>{
 const f=await fixture(),source=await f.create('output_script','来源原文',{purpose:'project_preparation_source'});
 expect(await f.read(f.ctx,f.project.id)).toBeNull();
 expect(await createConfirmedProjectReviewScriptReader(f.ports)(f.ctx,f.project.id)).toBeNull();
 const master=await f.create('master_script','人工母稿');expect((await f.read(f.ctx,f.project.id))?.artifactId).toBe(master.id);
 const empty=await f.create('output_script','');expect(await f.read(f.ctx,f.project.id)).toMatchObject({artifactId:empty.id,fullText:''});
 expect((await f.service.listVersions(f.ctx,source.id))[0]?.contentText).toBe('来源原文');
});
it('只有明确预留排除，旧NULL/普通公开空稿仍权威；同tx能读到未提交的新目标状态',async()=>{
 const f=await fixture(),master=await f.create('master_script','旧稿');
 await db.transaction(async tx=>{
  const store=tx as unknown as Db,id=await createScriptDraftTargetService({now,nextId}).ensure(store,f.ctx,f.project.id);
  const read=createConfirmedProjectScriptReader({projectsService:f.projectsFor(store),artifactsService:f.serviceFor(store)});
  expect(await read(f.ctx,f.project.id)).toMatchObject({artifactId:master.id,fullText:'旧稿'});
  await f.serviceFor(store).createVersion(f.ctx,id,{contentText:''});expect(await read(f.ctx,f.project.id)).toMatchObject({artifactId:id,fullText:''});
 });
 const current=await f.read(f.ctx,f.project.id);expect(current?.sha256).toBe(createHash('sha256').update('').digest('hex'));
});
it('精确restore非最高当前版与初始空，旧不可变版本不改；不得取max(versionNumber)',async()=>{
 const f=await fixture(),out=await f.create('output_script'),v1=out.currentVersionId!,v2=await f.service.createVersion(f.ctx,out.id,{contentText:'第二版正文'});
 await f.service.createVersion(f.ctx,out.id,{contentText:'第三版正文'});const before=await f.service.listVersions(f.ctx,out.id);
 await f.service.restoreVersion(f.ctx,out.id,v2.id);expect(await f.read(f.ctx,f.project.id)).toMatchObject({versionId:v2.id,fullText:'第二版正文'});
 await f.service.restoreVersion(f.ctx,out.id,v1);expect(await f.read(f.ctx,f.project.id)).toMatchObject({versionId:v1,fullText:''});expect(await f.service.listVersions(f.ctx,out.id)).toEqual(before);
});
it('原JSON段落/结构表顺序、transcript与纯文本文字和hash逐族保真',async()=>{
 const f=await fixture(),out=await f.create('output_script');
 const families=[{contentText:'旧纯文本',contentData:{transcript:' 原逐字稿\n保留空格 '} ,expected:' 原逐字稿\n保留空格 '},{contentText:'原纯文本\n第二行',contentData:{},expected:'原纯文本\n第二行'},{contentText:'markdown备用',contentData:{sections:[{id:'a',heading:'第一段',body:'正文一'},{id:'b',heading:'第二段',body:'正文二'}]},expected:'第一段\n正文一\n\n第二段\n正文二'}];
 for(const family of families){const version=await f.service.createVersion(f.ctx,out.id,family);expect(await f.read(f.ctx,f.project.id)).toEqual({projectId:f.project.id,artifactId:out.id,versionId:version.id,fullText:family.expected,sha256:createHash('sha256').update(family.expected).digest('hex')});}
 const table=await f.service.createVersion(f.ctx,out.id,{contentText:'',contentData:{}});
 await f.service.replaceStructuredContent(f.ctx,out.id,table.id,{scriptSections:[{sectionType:'body',content:'后段',position:20},{sectionType:'hook',content:'前段',position:2}]});
 expect(await f.read(f.ctx,f.project.id)).toMatchObject({versionId:table.id,fullText:'前段\n\n后段'});
});
it('真实版本损坏、归属失败、复核冲突均拒绝，reviewSubject不吞空且seed零调用',async()=>{
 const f=await fixture(),out=await f.create('output_script','原文');
 await expect(f.read({...f.ctx,accountId:'foreign'},f.project.id)).rejects.toThrow();
 await db.update(artifacts).set({currentVersionId:'missing-current'}).where(eq(artifacts.id,out.id));
 const seed=vi.fn(async()=>'不得回灌'),review=createReviewSubjectContext({...f.ports,readProjectRadarDraftSeed:seed} as never);
 await expect(f.read(f.ctx,f.project.id)).rejects.toThrow('不存在');await expect(review.getScript(f.ctx,f.project.id)).rejects.toThrow('不存在');expect(seed).not.toHaveBeenCalled();
 await db.update(artifacts).set({currentVersionId:out.currentVersionId}).where(eq(artifacts.id,out.id));
 const list=vi.fn(f.service.listProjectArtifacts);list.mockImplementationOnce(f.service.listProjectArtifacts).mockResolvedValueOnce([]);
 const conflict=createConfirmedProjectScriptReader({...f.ports,artifactsService:{...f.service,listProjectArtifacts:list}});
 await expect(conflict(f.ctx,f.project.id)).rejects.toThrow('变化');expect(list).toHaveBeenCalledTimes(2);
 const unavailable=vi.fn(async()=>{throw Error('原连接不可用');});const failure=createReviewSubjectContext({...f.ports,readConfirmedProjectReviewScript:unavailable,readProjectRadarDraftSeed:seed} as never);
 await expect(failure.getScript(f.ctx,f.project.id)).rejects.toThrow('原连接不可用');expect(seed).not.toHaveBeenCalled();
});

it('实际后台transcript service与同项目预留目标并存：不接管空目标、不覆盖旧母稿',async()=>{
 const f=await fixture(),awemeId=nextId('owned-aweme');
 const imported=await f.projects.ensureImportedProject(f.ctx,{title:'受控导入项目',platform:'douyin',externalId:awemeId});
 const projectId=imported.projectId,targets=createScriptDraftTargetService({now,nextId});
 const reservedId=await db.transaction(tx=>targets.ensure(tx as unknown as Db,f.ctx,projectId));
 const before=(await db.select().from(artifacts).where(eq(artifacts.id,reservedId)))[0],beforeVersions=await f.service.listVersions(f.ctx,reservedId);
 const old=await f.service.createArtifact(f.ctx,{projectId,title:'已有人工母稿',artifactType:'master_script',stage:'script',initialContentText:'人工稿不得被机器覆盖'}),oldVersions=await f.service.listVersions(f.ctx,old.id);
 const {createTranscriptArtifactService}=await import('../../modules/projects/transcript-artifact.service');
 const transcripts=createTranscriptArtifactService({db,now,nextId});
 expect(await transcripts.hasExisting(f.ctx,awemeId)).toBe(false);await transcripts.restoreExisting(f.ctx,awemeId);
 const actual=await transcripts.ensure(f.ctx,{awemeId,transcript:'实际转录中性事实'});expect(actual.status).toBe('bound');expect(actual.artifactId).not.toBe(reservedId);expect(await transcripts.hasExisting(f.ctx,awemeId)).toBe(true);
 expect((await transcripts.ensure(f.ctx,{awemeId,transcript:'重放不得覆盖'})).status).toBe('skipped');
 expect((await db.select().from(artifacts).where(eq(artifacts.id,reservedId)))[0]).toEqual(before);expect(await f.service.listVersions(f.ctx,reservedId)).toEqual(beforeVersions);expect(await f.service.listVersions(f.ctx,old.id)).toEqual(oldVersions);
 expect(await f.read(f.ctx,projectId)).toMatchObject({artifactId:actual.artifactId,fullText:'实际转录中性事实'});
});
it('实际review consumer只有确认无稿才读seed；明确保存空仍seed零新增',async()=>{
 const f=await fixture(),seed=vi.fn(async()=>'真实端口的受控seed');
 const review=createReviewSubjectContext({...f.ports,readProjectRadarDraftSeed:seed} as never);
 expect(await review.getScript(f.ctx,f.project.id)).toBe('真实端口的受控seed');expect(seed).toHaveBeenCalledTimes(1);
 const id=await db.transaction(tx=>createScriptDraftTargetService({now,nextId}).ensure(tx as unknown as Db,f.ctx,f.project.id));
 await f.service.createVersion(f.ctx,id,{contentText:''});expect(await review.getScript(f.ctx,f.project.id)).toBe('');expect(seed).toHaveBeenCalledTimes(1);
});

it('真实业务任务失败/取消不等于采纳，不改变预留版本与原稿（无worker/模型执行）',async()=>{
 const f=await fixture(),id=await db.transaction(tx=>createScriptDraftTargetService({now,nextId}).ensure(tx as unknown as Db,f.ctx,f.project.id));
 const before=(await db.select().from(artifacts).where(eq(artifacts.id,id)))[0],versions=await f.service.listVersions(f.ctx,id);
 const {createAiService}=await import('../../modules/ai/ai.service');// 此例只走任务状态生命周期，不装配任何生成/采纳业务端口（与原状态夹具一致）。
 const stateOnly={db,now,nextId} as unknown as import('../../modules/ai/ai.service').ServiceDeps;const ai=createAiService(stateOnly);
 const failed=await ai.createTask(f.ctx,{taskType:'script.draft',attemptId:'t1331-failed-state-'+seq,inputData:{projectId:f.project.id,artifactId:id}});await ai.markRunning(f.ctx,failed.id);await ai.markFailed(f.ctx,failed.id,'受控业务失败，不调用模型');expect((await ai.getTask(f.ctx,failed.id)).status).toBe('failed');
 const cancelled=await ai.createTask(f.ctx,{taskType:'script.draft',attemptId:'t1331-cancelled-state-'+seq,inputData:{projectId:f.project.id,artifactId:id}});expect((await ai.cancelTask(f.ctx,cancelled.id)).status).toBe('cancelled');
 expect((await db.select().from(artifacts).where(eq(artifacts.id,id)))[0]).toEqual(before);expect(await f.service.listVersions(f.ctx,id)).toEqual(versions);expect(await f.read(f.ctx,f.project.id)).toBeNull();
});

it('同一确认快照两投影：review保显式空transcript/原空白/纯文，canonical仍保原全文hash',async()=>{
 const f=await fixture(),out=await f.create('output_script'),readReview=createConfirmedProjectReviewScriptReader(f.ports),seed=vi.fn(async()=>'不得回灌');
 const review=createReviewSubjectContext({...f.ports,readConfirmedProjectReviewScript:readReview,readProjectRadarDraftSeed:seed} as never);
 const families=[
  {contentText:'不得代替口播',contentData:{transcript:' 原口播\n保原空格 '},expected:' 原口播\n保原空格 '},
  {contentText:'不得越过显式空transcript',contentData:{transcript:''},expected:''},
  {contentText:'不得越过空白transcript',contentData:{transcript:' \n '},expected:''},
  {contentText:' 原纯文\n保留尾空格 ',contentData:{},expected:' 原纯文\n保留尾空格 '},
  {contentText:'原纯文回退',contentData:{transcript:null},expected:'原纯文回退'},
 ];
 for(const family of families){const version=await f.service.createVersion(f.ctx,out.id,family);const projected=await readReview(f.ctx,f.project.id),canonical=await f.read(f.ctx,f.project.id);
  expect(projected).toEqual({projectId:f.project.id,artifactId:out.id,versionId:version.id,text:family.expected});expect(await review.getScript(f.ctx,f.project.id)).toBe(family.expected);
  expect(Object.keys(canonical!).sort()).toEqual(['projectId','artifactId','versionId','fullText','sha256'].sort());expect(canonical).toMatchObject({artifactId:out.id,versionId:version.id});expect(canonical?.sha256).toBe(createHash('sha256').update(canonical!.fullText).digest('hex'));
 }
 const structured=await f.service.createVersion(f.ctx,out.id,{contentText:'',contentData:{}});await f.service.replaceStructuredContent(f.ctx,out.id,structured.id,{scriptSections:[{sectionType:'body',content:'仅结构表正文',position:0}]});
 expect(await f.read(f.ctx,f.project.id)).toMatchObject({artifactId:out.id,versionId:structured.id,fullText:'仅结构表正文'});expect(await readReview(f.ctx,f.project.id)).toEqual({projectId:f.project.id,artifactId:out.id,versionId:structured.id,text:''});expect(await review.getScript(f.ctx,f.project.id)).toBe('');expect(seed).not.toHaveBeenCalled();
});
it('完整异步canonical投影之后才重验current；review相同精确版本并发变化同样拒绝',async()=>{
 const f=await fixture(),out=await f.create('output_script'),version=await f.service.createVersion(f.ctx,out.id,{contentText:'',contentData:{}});let release!:()=>void,entered=false;
 const gate=new Promise<void>(resolve=>{release=resolve}),order:string[]=[];
 const list=vi.fn(async(...args:Parameters<typeof f.service.listProjectArtifacts>)=>{order.push('list');return f.service.listProjectArtifacts(...args);});
 const read=createConfirmedProjectScriptReader({...f.ports,artifactsService:{...f.service,listProjectArtifacts:list,getScriptSections:async(...args)=>{entered=true;order.push('projection.begin');const result=await f.service.getScriptSections(...args);await gate;order.push('projection.end');return result;}}});
 const pending=read(f.ctx,f.project.id);const verdict=expect(pending).rejects.toThrow('变化');await vi.waitFor(()=>expect(entered).toBe(true));expect(order).toEqual(['list','projection.begin']);await f.service.createVersion(f.ctx,out.id,{contentText:'读取期间真实新版本'});release();await verdict;expect(order).toEqual(['list','projection.begin','projection.end','list']);
 let changed=false;const reviewReader=createConfirmedProjectReviewScriptReader({...f.ports,artifactsService:{...f.service,listVersions:async(...args)=>{const rows=await f.service.listVersions(...args);if(!changed){changed=true;await f.service.restoreVersion(f.ctx,out.id,version.id);}return rows;}}});await expect(reviewReader(f.ctx,f.project.id)).rejects.toThrow('变化');
});
