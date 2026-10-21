import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,type Db} from '../../db';
import {createProjectsService} from './projects.service';
import {createProjectRepository} from './projects.repository';
import {createArtifactsService} from '../artifacts/artifacts.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {eq} from 'drizzle-orm';
import {executionTasks} from '../../schema/intelligence';
import type {RequestContext} from '@creatoros/contract';
import type {ProjectPreparationGenerationTarget} from '@creatoros/contract/execution-worker';
let db:Db,close:()=>Promise<void>,seq=0;const now=()=> '2026-10-21T03:00:00.000Z',nextId=(p:string)=>`${p}-generation-${++seq}`;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);afterAll(async()=>close?.(),120000);
async function fixture(){
 const ctx:RequestContext={userId:'generation-test',accountId:nextId('account'),requestId:'test',source:'user'},deps={now,nextId};
 const projects=createProjectsService(createProjectRepository(db),deps),project=await projects.createProject(ctx,{title:'来源准备',brief:'原资料'}),tasks=createPersistentTaskService(db,deps);
 const artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>projects.getProject(c,id)}),source=await artifacts.createArtifact(ctx,{projectId:project.id,title:'来源',artifactType:'output_script',stage:'script'});
 const version=await artifacts.createVersion(ctx,source.id,{contentText:'真实来源正文',contentData:{purpose:'project_preparation_source',skipMasterScript:true}}),hash=`sha256:${createHash('sha256').update(version.contentText).digest('hex')}`;
 const target:ProjectPreparationGenerationTarget={ownerType:'project',projectId:project.id,source:{kind:'project_artifact',projectId:project.id,artifactId:source.id,artifactVersion:version.versionNumber,contentHash:hash,title:'来源',authorName:null,url:null},generationMode:'rewrite_only',transcript:{text:version.contentText,hash}};
 const parent=await tasks.enqueue(ctx,{kind:'project_preparation',ownerType:'project',ownerId:project.id,idempotencyKey:'parent',payload:{schemaVersion:1,projectId:project.id,sourceReferenceIds:[],inputRevision:0},executionBudget:{maxCalls:10,maxTokens:100000,deadlineMs:1800000}}),claim=(await tasks.claimTask({taskId:parent.id,workerId:'parent'}))!;
 const module=await import('./project-preparation-generation.service');const service=module.createProjectPreparationGenerationService(db,{...deps,tasks});
 return {ctx,deps,projects,project,tasks,artifacts,source,version,target,parent,claim,service};
}
it('真实来源预约project-owner子，候选只保存子checkpoint；原父/期限不变，正式资料不变',async()=>{
 const f=await fixture(),reserved=await f.service.reserve(f.ctx,{parentClaim:f.claim,projectId:f.project.id,referenceId:null,inputRevision:0,target:f.target});
 const before=await f.artifacts.listVersions(f.ctx,f.source.id);
 const claim=(await f.tasks.claimTask({taskId:reserved.childTaskId,workerId:'model'}))!;
 expect(await f.service.getContext(f.ctx,claim)).toEqual(f.target);
 await f.service.saveCandidate(f.ctx,claim,{stage:'draft',value:{contentText:'候选初稿'}});await f.service.finish(f.ctx,claim,{generationMode:'rewrite_only',adaptedDraft:'候选初稿'});
 await f.tasks.finish({taskId:claim.task.id,...claim.lease,status:'succeeded'});
 expect(await f.service.collect(f.ctx,f.project.id,claim.task.id)).toEqual([expect.objectContaining({candidate:expect.objectContaining({sourceTaskId:claim.task.id,checkpointPath:'result.adaptedDraft'}),content:{kind:'draft',text:'候选初稿'}})]);
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('原资料');expect(await f.artifacts.listVersions(f.ctx,f.source.id)).toEqual(before);
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,claim.task.id));const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parent.id));expect(child!.deadlineAt).toBe(parent!.deadlineAt);
});
it('跨项目工件、伪造正文摘要与无真实导入事实拒绝；父暂停后失租写入拒绝',async()=>{
 const f=await fixture();
 for(const target of [{...f.target,projectId:'foreign'},{...f.target,transcript:{...f.target.transcript,text:'伪造正文'}},{...f.target,source:{kind:'imported_text',projectId:f.project.id,intakeId:'fabricated',contentText:f.target.transcript.text,contentHash:f.target.transcript.hash,title:null,authorName:null,url:null}}])await expect(f.service.reserve(f.ctx,{parentClaim:f.claim,projectId:f.project.id,referenceId:null,inputRevision:0,target:target as ProjectPreparationGenerationTarget})).rejects.toThrow();
 const reserved=await f.service.reserve(f.ctx,{parentClaim:f.claim,projectId:f.project.id,referenceId:null,inputRevision:0,target:f.target}),claim=(await f.tasks.claimTask({taskId:reserved.childTaskId,workerId:'model'}))!;
 await f.tasks.command(f.ctx,{taskIds:[f.parent.id],command:'pause',idempotencyKey:'pause-parent'});
 await expect(f.service.saveCandidate(f.ctx,claim,{stage:'draft',value:{contentText:'迟到候选'}})).rejects.toThrow();
});
