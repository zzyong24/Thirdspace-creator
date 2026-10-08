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
});
