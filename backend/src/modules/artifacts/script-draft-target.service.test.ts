import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,artifacts,artifactVersions,eq,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createProjectsService,createProjectRepository} from '../projects';
import {createArtifactsService} from './artifacts.service';
import {createScriptDraftTargetService} from './script-draft-target.service';
import {createConfirmedProjectScriptReader} from '../../application/context/confirmed-project-script';
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>new Date(1791043200000+seq++).toISOString(),nextId=(prefix:string)=>`${prefix}-t1331-${++seq}`;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(){
 const ctx:RequestContext={userId:'t1331-owner',accountId:nextId('account'),requestId:'test',source:'user'};
 const projects=createProjectsService(createProjectRepository(db),{now,nextId});
 const project=await projects.createProject(ctx,{title:'预留边界'});
 const serviceFor=(store:Db)=>createArtifactsService({db:store,now,nextId,assertProjectOwned:(c,id)=>createProjectsService(createProjectRepository(store),{now,nextId}).getProject(c,id),resolveOutputProjectId:(c,id)=>createProjectsService(createProjectRepository(store),{now,nextId}).getProjectIdByOutput(c,id)});
 const service=serviceFor(db),targets=createScriptDraftTargetService({now,nextId});
 const ensure=()=>db.transaction(tx=>targets.ensure(tx as unknown as Db,ctx,project.id));
 const raw=async(id:string)=>(await db.select().from(artifacts).where(eq(artifacts.id,id)))[0]!;
 const read=createConfirmedProjectScriptReader({projectsService:projects,artifactsService:service});
 return {ctx,projects,project,service,serviceFor,targets,ensure,raw,read};
}
it('T1382 写入目标排除来源，采纳正式稿不改变来源正文和版本',async()=>{
 const f=await fixture(),source=await f.service.createArtifact(f.ctx,{projectId:f.project.id,title:'来源',artifactType:'output_script',stage:'script',initialContentText:'来源原文',initialContentData:{purpose:'project_preparation_source'}});
 const before=await f.service.listVersions(f.ctx,source.id),id=await f.ensure();expect(id).not.toBe(source.id);expect(await f.ensure()).toBe(id);
 await f.service.createVersion(f.ctx,id,{contentText:'用户采纳的候选'});expect(await f.read(f.ctx,f.project.id)).toMatchObject({artifactId:id,fullText:'用户采纳的候选'});
 expect(await f.service.listVersions(f.ctx,source.id)).toEqual(before);
});
it('只有新ensure空v1预留，原事务失败回滚；普通公开空v1复用且正式权威',async()=>{
 const f=await fixture();await expect(db.transaction(async tx=>{await f.targets.ensure(tx as unknown as Db,f.ctx,f.project.id);throw Error('原父事务回滚');})).rejects.toThrow('回滚');
 expect(await f.service.listProjectArtifacts(f.ctx,f.project.id)).toEqual([]);
 const id=await f.ensure(),row=await f.service.getArtifact(f.ctx,id),raw=await f.raw(id);
 expect(row.currentVersionIsReserved).toBe(true);expect(row).not.toHaveProperty('scriptDraftReservationVersionId');expect(raw.scriptDraftReservationVersionId).toBe(row.currentVersionId);
 expect((await f.service.listVersions(f.ctx,id))).toHaveLength(1);expect(await f.ensure()).toBe(id);expect(await f.read(f.ctx,f.project.id)).toBeNull();
 const g=await fixture(),empty=await g.service.createArtifact(g.ctx,{projectId:g.project.id,title:'用户正式新建空稿',artifactType:'output_script',stage:'script'});
 expect(await g.ensure()).toBe(empty.id);expect((await g.raw(empty.id)).scriptDraftReservationVersionId).toBeNull();
 expect(await g.read(g.ctx,g.project.id)).toMatchObject({artifactId:empty.id,versionId:empty.currentVersionId,fullText:''});
});
it('明确保存空稿与restore当前初始空均同事务解除；内部材料化不确认',async()=>{
 const f=await fixture(),id=await f.ensure(),initial=await f.service.getArtifact(f.ctx,id),original=await f.service.listVersions(f.ctx,id);
 await f.service.replaceStructuredContent(f.ctx,id,initial.currentVersionId!,{scriptSections:[{sectionType:'body',content:'内部材料化不是采纳',position:0}]});
 expect((await f.raw(id)).scriptDraftReservationVersionId).toBe(initial.currentVersionId);expect(await f.read(f.ctx,f.project.id)).toBeNull();
 const saved=await f.service.createVersion(f.ctx,id,{expectedCurrentVersionId:initial.currentVersionId!,contentText:'',contentData:{}});
 expect((await f.raw(id)).scriptDraftReservationVersionId).toBeNull();expect((await f.service.listVersions(f.ctx,id))[0]).toEqual(original[0]);expect(await f.read(f.ctx,f.project.id)).toMatchObject({versionId:saved.id,fullText:''});
 const g=await fixture(),other=await g.ensure(),v1=(await g.service.getArtifact(g.ctx,other)).currentVersionId!;
 await g.service.restoreVersion(g.ctx,other,v1,v1);expect((await g.raw(other)).scriptDraftReservationVersionId).toBeNull();expect(await g.service.listVersions(g.ctx,other)).toHaveLength(1);expect(await g.read(g.ctx,g.project.id)).toMatchObject({versionId:v1,fullText:''});
});
it('CAS冲突不清预留；并发保存恰一赢家，明确AI采用解除，旧回执只读不清后来状态',async()=>{
 const f=await fixture(),id=await f.ensure(),v1=(await f.service.getArtifact(f.ctx,id)).currentVersionId!;
 await expect(f.service.createVersion(f.ctx,id,{expectedCurrentVersionId:'foreign-version',contentText:'不能落库'})).rejects.toThrow('更新');expect((await f.raw(id)).scriptDraftReservationVersionId).toBe(v1);expect(await f.service.listVersions(f.ctx,id)).toHaveLength(1);
 const input={expectedCurrentVersionId:v1,contentText:'用户明确采纳',createdByType:'ai',aiTaskId:'owned-confirm-task',adoptionKey:'t1331-receipt',adoptionSourceDigest:'sha256:'+'1'.repeat(64)};
 const result=await f.service.createVersion(f.ctx,id,input);expect((await f.raw(id)).scriptDraftReservationVersionId).toBeNull();
 // 受控持久状态注入，仅证明原receipt的early return没有更新副作用；ensure不会制造此历史。
 await db.update(artifacts).set({currentVersionId:v1,scriptDraftReservationVersionId:v1}).where(eq(artifacts.id,id));
 const before=await f.raw(id);expect(await f.service.createVersion(f.ctx,id,input)).toEqual(result);expect(await f.raw(id)).toEqual(before);
 const outcomes=await Promise.allSettled(['甲','乙'].map(contentText=>f.service.createVersion(f.ctx,id,{expectedCurrentVersionId:v1,contentText})));
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);expect((await f.raw(id)).scriptDraftReservationVersionId).toBeNull();
});
it('跨账号/项目output不能创建或读取，损坏预留真实拒绝而不猜旧稿',async()=>{
 const f=await fixture(),id=await f.ensure();await expect(f.service.getArtifact({...f.ctx,accountId:'foreign'},id)).rejects.toThrow();
 const second=await f.projects.createProject(f.ctx,{title:'别的项目'}),output=await f.projects.createOutput(f.ctx,second.id,{title:'别的视频',contentType:'video'});
 await expect(db.transaction(tx=>f.targets.ensure(tx as unknown as Db,f.ctx,f.project.id,output.id))).rejects.toThrow('匹配');
 await db.update(artifacts).set({scriptDraftReservationVersionId:'missing-version'}).where(eq(artifacts.id,id));
 await expect(f.service.getArtifact(f.ctx,id)).rejects.toThrow('预留');await expect(f.read(f.ctx,f.project.id)).rejects.toThrow('预留');
});
