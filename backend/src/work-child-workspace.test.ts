import {it,expect} from 'vitest';
import {createDb,projects,workCompositions,eq,and} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createProjectRepository,createProjectsService} from './modules/projects';
import {createPlatformAccountService} from './modules/platform-account/platform-account.service';
import {createAccountGroupService} from './modules/platform-account/account-group.service';
import {accountGroupMemberships} from './schema/account-groups';
import {withWorkspaceWrite} from './workspace-write';
import {createWorkChildWorkspaceAuthority,readWorkLegacyOrigin,projectChildWhere} from './work-child-workspace';

it('T1338 私有作品授权只接受真实父/历史来源，NULL桥与新stamp不扩大工作区',async()=>{
 const opened=await createDb(),db=opened.db;let n=0;const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-t1338-${++n}`,deps={db,now,nextId};
 const user:RequestContext={userId:'t1338-parent-user',requestId:'owned-helper',source:'user'},accounts=createPlatformAccountService(deps),groups=createAccountGroupService(deps),service=createProjectsService(createProjectRepository(db),{now,nextId});
 const authority=createWorkChildWorkspaceAuthority({readProject:(c,id,tx,lock)=>createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,lock),readLegacyOrigin:readWorkLegacyOrigin});
 try{
  const a=await accounts.createAccount(user,{platform:'bilibili',accountHandle:'真实原来源A',followerBaseline:0}),b=await accounts.createAccount(user,{platform:'bilibili',accountHandle:'另一来源B',followerBaseline:0});
  const legacy={...user,accountId:a.id},group={...user,groupId:`grp_legacy_${a.id}`,accountId:null},parent=await service.createProject(legacy,{title:'原父项目'}),otherGroup=await groups.create(user,{name:'纯组',idempotencyKey:'t1338-pure-parent-group'}),pure={...user,groupId:otherGroup.id,accountId:null},pureParent=await service.createProject(pure,{title:'纯组父项目'});
  const row=(id:string,projectId:string,accountId:string|null,groupId:string|null)=>({id,userId:user.userId,groupId,accountId,projectId,currentRevision:0,createdAt:now(),updatedAt:now()});
  // 明确的owned隔离故障/旧数据输入；非公开主证，parent授权仍全部走真实ProjectsService。
  await db.insert(workCompositions).values([row('old-null-a',parent.id,a.id,null),row('wrong-null-b',parent.id,b.id,null),row('foreign-explicit',parent.id,a.id,otherGroup.id),row('correct-stamped',parent.id,null,group.groupId),row('pure-null',pureParent.id,a.id,null)]);
  const original=await authority.authorizeProject(group,parent.id,db);expect(original.legacyOrigin).toEqual({groupId:group.groupId,accountId:a.id});expect(original.newStamp).toEqual({groupId:group.groupId,accountId:null});
  const rows=await db.select().from(workCompositions).where(projectChildWhere(workCompositions,group,original));expect(rows.map(r=>r.id).sort()).toEqual(['correct-stamped','old-null-a']);
  const accountRead=await authority.authorizeProject(legacy,parent.id,db);expect(accountRead.newStamp).toEqual({groupId:group.groupId,accountId:a.id});expect((await db.select().from(workCompositions).where(projectChildWhere(workCompositions,legacy,accountRead))).map(r=>r.id)).toEqual(['old-null-a']);
  await expect(authority.authorizeProject(pure,parent.id,db)).rejects.toThrow();await expect(authority.authorizeProject({...group,userId:'another-user'},parent.id,db)).rejects.toThrow();await expect(authority.authorizeProject(user,parent.id,db)).rejects.toThrow();await expect(authority.authorizeProject(group,'missing-parent',db)).rejects.toThrow();
  const pureFact=await authority.authorizeProject(pure,pureParent.id,db);expect(pureFact.legacyOrigin).toBeNull();expect(await db.select().from(workCompositions).where(projectChildWhere(workCompositions,pure,pureFact))).toEqual([]);
  const [membership]=await db.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.groupId,group.groupId),eq(accountGroupMemberships.accountId,a.id)));if(!membership)throw Error('真实原membership缺失');
  await db.update(accountGroupMemberships).set({leftAt:now()}).where(eq(accountGroupMemberships.id,membership.id));
  expect((await authority.authorizeProject(group,parent.id,db)).legacyOrigin).toEqual(original.legacyOrigin);
  await db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.id,membership.id));const unproved=await authority.authorizeProject(group,parent.id,db);expect(unproved.legacyOrigin).toBeNull();expect((await db.select().from(workCompositions).where(projectChildWhere(workCompositions,group,unproved))).map(r=>r.id)).toEqual(['correct-stamped']);
  await db.insert(accountGroupMemberships).values({...membership,leftAt:now()});
  await db.update(projects).set({groupId:otherGroup.id}).where(eq(projects.id,parent.id));const moved=await authority.authorizeProject(pure,parent.id,db);expect(moved.legacyOrigin).toBeNull();expect((await db.select().from(workCompositions).where(projectChildWhere(workCompositions,pure,moved))).map(r=>r.id)).toEqual(['foreign-explicit']);await expect(authority.authorizeProject(group,parent.id,db)).rejects.toThrow();
  await db.update(projects).set({groupId:group.groupId}).where(eq(projects.id,parent.id));const currentGroup=await groups.get(user,group.groupId);await groups.archive(user,currentGroup.id,currentGroup.version);expect((await authority.authorizeProject(group,parent.id,db)).projectId).toBe(parent.id);await expect(withWorkspaceWrite(db,group,async()=>{})).rejects.toThrow();
 }finally{await opened.client.close();}
},120000);
