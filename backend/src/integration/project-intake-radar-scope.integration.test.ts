import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {eq, sql} from 'drizzle-orm';
import {ENDPOINTS, type RequestContext} from '@creatoros/contract';
import {createDb, type Db} from '../db';
import {accountGroups, accountGroupMemberships} from '../schema/account-groups';
import {platformAccounts} from '../schema/platform-account';
import {projects, projectIntakes} from '../schema/projects';
import {intelligenceItems, intelligenceSources, intelligenceSyncRuns, sourceSnapshots, executionTasks} from '../schema/intelligence';
import {createProjectIntakeApplication} from '../application/projects/project-intake';
import {createProjectIntakeService, projectIntakeDigest, type ProjectPreparationReservationPort} from '../modules/projects/project-intake.service';
import {lockWorkspaceMembership} from '../modules/platform-account/membership-lock.service';
import {createProjectsTransport} from '../modules/projects/projects.transport';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createProjectsService} from '../modules/projects/projects.service';

vi.setConfig({testTimeout:180000, hookTimeout:180000});
let db:Db, close:()=>Promise<void>, seq=0;
const now=()=> '2026-10-21T09:25:00.000Z';
const nextId=(prefix:string)=>`${prefix}-radar-scope-${++seq}`;
const deps={now,nextId};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
async function fixture(){
 const accountId=nextId('account'),groupId=`grp_legacy_${accountId}`,userId='radar-scope-user';
 await db.insert(platformAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:accountId,status:'active',createdAt:now(),updatedAt:now()});
 await db.insert(accountGroups).values({id:groupId,userId,name:'初始组',createdAt:now(),updatedAt:now()});
 await db.insert(accountGroupMemberships).values({id:nextId('member'),userId,groupId,accountId,joinedAt:now()});
 const ctx:RequestContext={userId,groupId,accountId,requestId:nextId('request'),source:'user'};
 const itemId=nextId('item'),sourceId=nextId('source'),runId=nextId('run'),owner={userId,groupId,accountId};
 await db.insert(intelligenceSources).values({...owner,id:sourceId,type:'rss',platform:'web',displayName:'隔离来源',externalKey:sourceId,createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceSyncRuns).values({...owner,id:runId,sourceId,executionTaskId:nextId('source-task'),trigger:'manual',status:'succeeded',createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceItems).values({...owner,id:itemId,type:'article',platform:'web',canonicalUrl:`https://example.test/${itemId}`,canonicalUrlHash:itemId,title:'雷达来源',capturedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(sourceSnapshots).values({...owner,id:nextId('snapshot'),itemId,sourceId,runId,capturedAt:now(),finalUrl:`https://example.test/${itemId}`,contentHash:itemId,safeExtract:'隔离正文'});
 const reserve=vi.fn<ProjectPreparationReservationPort['reserve']>(async(c,input,tx)=>{
  const id=nextId('preparation');
  await tx.insert(executionTasks).values({id,userId:c.userId,groupId:c.groupId,accountId:c.accountId,kind:'project_preparation',ownerType:'project',ownerId:input.project.id,idempotencyKey:input.intakeId,status:'queued',payload:{projectId:input.project.id},createdAt:now(),updatedAt:now()});
  return id;
 });
 const repo=createProjectRepository(db),intake=createProjectIntakeApplication(db,deps,{preparation:{reserve}});
 const transport=createProjectsTransport(()=>({repo,service:createProjectsService(repo,deps),intake}));
 const ensure=async(c:RequestContext)=>{
  const result=await transport.request(ENDPOINTS.ensureProject,{params:undefined,query:undefined,body:{source:'radar',itemId,idempotencyKey:nextId('click')}},c) as {data:unknown};
  return ENDPOINTS.ensureProject.response.parse(result.data);
 };
 return {ctx,itemId,reserve,ensure};
}
it.each([true,false])('bug8 account-only与group入口复用同项目、回执和一次准备，accountFirst=%s',async accountFirst=>{
 const f=await fixture(),account={...f.ctx,groupId:undefined},group={...f.ctx,accountId:null};
 const one=await f.ensure(accountFirst?account:group),two=await f.ensure(accountFirst?group:account);
 expect(two.project.id).toBe(one.project.id);
 expect(two.preparationTaskId).toBe(one.preparationTaskId);
 expect(two.sourceReferences).toEqual(one.sourceReferences);
 expect(two.reused).toBe(true);
 expect(f.reserve).toHaveBeenCalledTimes(1);
 const rows=await db.select().from(projectIntakes).where(eq(projectIntakes.scopeId,f.ctx.groupId!));
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({scopeKind:'group',projectId:one.project.id});
 expect((await db.execute(sql`SELECT id FROM projects WHERE user_id=${f.ctx.userId} AND (group_id=${f.ctx.groupId!} OR account_id=${f.ctx.accountId!})`)).rows).toHaveLength(1);
});
it('bug8 account-only与group并发进入只预约一次准备',async()=>{
 const f=await fixture();
 const results=await Promise.all([f.ensure({...f.ctx,groupId:undefined}),f.ensure({...f.ctx,accountId:null})]);
 expect(new Set(results.map(r=>r.project.id)).size).toBe(1);
 expect(new Set(results.map(r=>r.preparationTaskId)).size).toBe(1);
 expect(results.filter(r=>!r.reused)).toHaveLength(1);
 expect(f.reserve).toHaveBeenCalledTimes(1);
 expect(await db.select().from(projectIntakes).where(eq(projectIntakes.scopeId,f.ctx.groupId!))).toHaveLength(1);
});
it('bug8 未授权组及account/group冲突拒绝，零项目/回执/准备写入',async()=>{
 const f=await fixture(),other=await fixture(),before=(await db.select().from(projects)).length;
 for(const ctx of [{...f.ctx,groupId:'foreign-group'},{...f.ctx,userId:'foreign-user'},{...f.ctx,groupId:other.ctx.groupId}])await expect(f.ensure(ctx)).rejects.toThrow();
 expect((await db.select().from(projects)).length).toBe(before);expect(f.reserve).not.toHaveBeenCalled();
 expect(await db.select().from(projectIntakes).where(eq(projectIntakes.scopeId,f.ctx.groupId!))).toEqual([]);
});
it.each(['account','membership','moved','archived'] as const)('bug8 account-only无法安全解析%s时拒绝，不能回落legacy-account新建',async variant=>{
 const f=await fixture();
 if(variant==='account')await db.delete(platformAccounts).where(eq(platformAccounts.id,f.ctx.accountId!));
 if(variant==='membership')await db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.ctx.accountId!));
 if(variant==='moved')await db.update(accountGroupMemberships).set({groupId:'ordinary-group'}).where(eq(accountGroupMemberships.accountId,f.ctx.accountId!));
 if(variant==='archived')await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.ctx.groupId!));
 const before=(await db.select().from(projects)).length;
 await expect(f.ensure({...f.ctx,groupId:undefined})).rejects.toThrow();
 expect((await db.select().from(projects)).length).toBe(before);expect(f.reserve).not.toHaveBeenCalled();
 expect((await db.execute(sql`SELECT id FROM project_intakes WHERE scope_id IN (${f.ctx.groupId!},${f.ctx.accountId!})`)).rows).toEqual([]);
});
it('bug8 不同授权组的相同雷达intakeKey仍各自独立，不全局按item合并',async()=>{
 const a=await fixture(),b=await fixture();
 // 来源读取端口已在公开入口测试；本例只隔离验证真实数据库中的workspace唯一键。
 const intake=createProjectIntakeService(db,deps,{lockWorkspace:(c,tx)=>lockWorkspaceMembership(tx,c)});
 const command={source:'radar' as const,intakeKey:projectIntakeDigest(['item','same-item']),request:{itemId:'same-item'},resolve:async()=>({command:{title:'组内项目'},references:[]})};
 const one=await intake.ensure(a.ctx,command),two=await intake.ensure(b.ctx,command);
 expect(two.project.id).not.toBe(one.project.id);
 expect((await intake.ensure(a.ctx,command)).project.id).toBe(one.project.id);
 expect((await intake.ensure(b.ctx,command)).project.id).toBe(two.project.id);
});
