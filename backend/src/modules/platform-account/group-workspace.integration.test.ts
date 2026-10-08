import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createDb,type RequestContext} from "@creatoros/backend";
import {createAccountGroupService} from "./account-group.service";
import {createProjectsService,createProjectRepository} from "../projects";
import {createKnowledgeService,createKnowledgeRepository} from "../knowledge";
import {createPositioningService} from "../positioning";
let store:Awaited<ReturnType<typeof createDb>>;let seq=0;
const now=()=>"2026-10-04T00:00:00.000Z";const nextId=(p:string)=>`${p}-${++seq}`;
const base:RequestContext={userId:"creator",requestId:"shared",source:"user"};
let ctx:RequestContext,other:RequestContext;
beforeAll(async()=>{store=await createDb();const service=createAccountGroupService({db:store.db,now,nextId});ctx={...base,groupId:(await service.create(base,{name:"一个创作者",idempotencyKey:"one"})).id};other={...base,groupId:(await service.create(base,{name:"另一个创作者",idempotencyKey:"two"})).id};});
afterAll(async()=>{await store?.client.close();});
describe("空组共享创作且跨组隔离",()=>{
 it("无需平台账号即可建项目，同组切平台不会隐藏项目",async()=>{
  const projects=createProjectsService(createProjectRepository(store.db),{now,nextId});
  const p=await projects.createProject(ctx,{title:"一期内容"});
  expect(p.accountId).toBeNull();expect(p.groupId).toBe(ctx.groupId);
  expect((await projects.getProject({...ctx,accountId:"platform-filter-only"},p.id)).id).toBe(p.id);
  await expect(projects.getProject(other,p.id)).rejects.toMatchObject({code:"OwnershipError"});
 });
 it("知识按组保存与读回，不串入另一个组",async()=>{
  const knowledge=createKnowledgeService(createKnowledgeRepository(store.db,{now,nextId}));
  const item=await knowledge.createKnowledge(ctx,{knowledgeType:"experience",title:"经验",content:"写给当前创作者"});
  expect((await knowledge.getKnowledge(ctx,item.id)).title).toBe("经验");
  await expect(knowledge.getKnowledge(other,item.id)).rejects.toMatchObject({code:"OwnershipError"});
 });
 it("定位在组内复用且空组互不覆盖",async()=>{
  const positioning=createPositioningService({db:store.db,now,nextId,projects:{async getProjectSubject(ctx,id){const p=await createProjectsService(createProjectRepository(store.db),{now,nextId}).getProject(ctx,id);return {title:p.title,brief:p.brief};}}});
  await positioning.upsertProfile(ctx,{persona:"月明",field:"工具",audience:"创作者",differentiation:"实测",capabilities:[]});
  expect((await positioning.getPositioningCenter({...ctx,accountId:"other-platform"})).profile?.persona).toBe("月明");
  expect((await positioning.getPositioningCenter(other)).profile).toBeNull();
 });
});
