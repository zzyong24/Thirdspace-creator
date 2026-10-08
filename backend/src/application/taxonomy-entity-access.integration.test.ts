import {it,expect} from 'vitest';
import {createDb} from '../db';
import {createAccountGroupService} from '../modules/platform-account';
import {createProjectRepository,createProjectsService} from '../modules/projects';
import {createKnowledgeRepository,createKnowledgeService} from '../modules/knowledge';
import {createTaxonomyRepository,createTaxonomyService} from '../modules/taxonomy';
import {createTaxonomyEntityAccess} from './taxonomy-entity-access';
import {resourceAccessGrants} from '../schema/resource-access';
import type {RequestContext} from '@creatoros/contract';
it('真实组合端口在标签事务内验证父项目，跨组及只读知识授权不能变成标签编辑权',async()=>{
 const store=await createDb();let n=0;const now=()=> '2026-10-04T00:00:00.000Z',nextId=(p:string)=>`${p}-${++n}`;
 try{
  const groups=createAccountGroupService({db:store.db,now,nextId}),base:RequestContext={userId:'tag-application-owner',requestId:'tags',source:'user'};
  const a={...base,groupId:(await groups.create(base,{name:'甲组',idempotencyKey:'a'})).id};
  const b={...base,groupId:(await groups.create(base,{name:'乙组',idempotencyKey:'b'})).id};
  const projects=createProjectsService(createProjectRepository(store.db),{now,nextId});
  const pa=await projects.createProject(a,{title:'甲组项目'}),pb=await projects.createProject(b,{title:'乙组项目'});
  const knowledge=createKnowledgeService(createKnowledgeRepository(store.db,{now,nextId}));
  const kb=await knowledge.createKnowledge(b,{title:'乙组共享知识',content:'真实fixture正文'});
  await store.db.insert(resourceAccessGrants).values({id:nextId('grant'),userId:base.userId,resourceType:'knowledge',resourceId:kb.id,originGroupId:b.groupId,targetGroupId:a.groupId,migrationId:'migration-resource-permission-fixture',createdAt:now(),revokedAt:null});
  const unavailable=async()=>{throw Error('此用例未装配的实体端口');};
  const access=createTaxonomyEntityAccess(store.db,{project:(ctx,id)=>projects.getProject(ctx,id),knowledge:(ctx,id)=>knowledge.getKnowledge(ctx,id),asset:unavailable,artifact:unavailable,learning:unavailable,publication:unavailable});
  const tags=createTaxonomyService(createTaxonomyRepository(store.db,{now,nextId}),access);
  const tag=await tags.createTag(a,{name:'测试标签'});
  expect(await tags.assignTags(a,{entityType:'project',entityId:pa.id,tagIds:[tag.id]})).toHaveLength(1);
  await expect(tags.assignTags(a,{entityType:'project',entityId:pb.id,tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});
  expect(await tags.listTagsForEntity(a,{entityType:'knowledge',entityId:kb.id})).toEqual([]);
  await expect(tags.assignTags(a,{entityType:'knowledge',entityId:kb.id,tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});
  expect((await tags.listEntitiesForTag(a,tag.id,{})).map(r=>r.entityId)).toEqual([pa.id]);
 }finally{await store.client.close();}
},30000);
