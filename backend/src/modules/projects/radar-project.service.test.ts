import {afterEach,beforeEach,describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {createDb,eq,executionTasks,projects,projectStages,projectActivities,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createRadarProjectService} from "./radar-project.service";
import {createProjectRepository} from "./projects.repository";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createAccountGroupService} from "../platform-account/account-group.service";
import {createPlatformAccountService} from "../platform-account/platform-account.service";

const base:RequestContext={userId:"u",accountId:"a",requestId:"proof-test",source:"user"};
let db:Db,clock:number,seq:number,close:()=>Promise<unknown>;
const now=()=>new Date(clock).toISOString(),nextId=(p:string)=>`${p}-${++seq}`;
const deps={now,nextId};
beforeEach(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();clock=Date.parse("2026-09-08T00:00:00Z");seq=0;});
afterEach(async()=>{await close?.();});
async function group(){const api=createAccountGroupService({db,...deps});const row=await api.create({...base,accountId:null},{name:"中性测试组",idempotencyKey:`g-${++seq}`});return {api,row,scope:{...base,accountId:null,groupId:row.id,groupVersion:row.version}};}
async function account(){const g=await group();const api=createPlatformAccountService({db,...deps});const row=await api.createAccount(g.scope,{platform:"douyin",accountHandle:"中性隔离账号",followerBaseline:0});const member=await g.api.forAccount(g.scope,row.id);return {...g,accounts:api,account:row,scope:{...g.scope,accountId:row.id,membershipVersion:member.version}};}
/** 底层proof/事务夹具：真实任务/claim/finish；不冒充intelligence源或供应商执行。完整来源由queue组合和公共fixture另验。 */
async function fixture(scope:RequestContext=base){
 const tasks=createPersistentTaskService(db,deps),itemId=`item-${++seq}`;
 const parent=await tasks.enqueue(scope,{kind:"radar_project_upgrade",ownerType:"item",ownerId:itemId,idempotencyKey:`parent-${seq}`,payload:{itemId,positioningVersionId:"positioning"}});
 const child=await tasks.enqueue(scope,{kind:"topic_preview",ownerType:"transform",ownerId:itemId,idempotencyKey:`${parent.id}:preview`,payload:{}});
 const childClaim=await tasks.claimTask({taskId:child.id,workerId:"child-worker",leaseSeconds:60});expect(childClaim).not.toBeNull();
 await tasks.finish({taskId:child.id,workerId:"child-worker",attempt:childClaim!.lease.attempt,status:"succeeded"});
 const claim=await tasks.claimTask({taskId:parent.id,workerId:"parent-worker",leaseSeconds:60});expect(claim).not.toBeNull();
 const frozen=claim!.task,context:RequestContext={...scope,userId:frozen.userId,accountId:frozen.accountId,groupId:frozen.groupId,groupVersion:frozen.groupVersion??undefined,membershipVersion:frozen.membershipVersion??undefined};
 const checkpoint={stage:"creating_project",topicTaskId:child.id,transformId:`transform-${++seq}`};
 const lease={taskId:parent.id,workerId:claim!.lease.workerId,attempt:claim!.lease.attempt};
 await tasks.saveCheckpoint({...lease,checkpoint});
 const input={queueTaskId:parent.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken,workerId:claim!.lease.workerId,itemId,topicTaskId:child.id,transformId:checkpoint.transformId,title:"初始项目",briefDetail:{coreMessage:"本次原候选内容"}};
 return {tasks,parent,child,claim:claim!,context,checkpoint,lease,input,service:createRadarProjectService(db,deps)};
}
async function empty(){expect(await db.select().from(projects)).toEqual([]);expect(await db.select().from(projectStages)).toEqual([]);expect(await db.select().from(projectActivities)).toEqual([]);}
function wrapped(intercept:(table:unknown,builder:any)=>any):Db{
 const decorate=(store:any):any=>new Proxy(store,{get(target,key){if(key==="transaction")return (body:any,...rest:any[])=>target.transaction((tx:any)=>body(decorate(tx)),...rest);if(key==="insert")return (table:unknown)=>intercept(table,target.insert(table));const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 return decorate(db);
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
function heldInsert(){const entered=deferred(),release=deferred();const held=wrapped((table,builder)=>table!==projects?builder:new Proxy(builder,{get(target,key){if(key==="values")return (...args:any[])=>{const query=target.values(...args);return new Proxy(query,{get(q,k){if(k==="returning")return async(...fields:any[])=>{entered.resolve();await release.promise;return q.returning(...fields);};const v=Reflect.get(q,k,q);return typeof v==="function"?v.bind(q):v;}});};const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}}));return {entered,release,service:createRadarProjectService(held,deps)};}

describe("雷达项目真实父凭证与原子幂等",()=>{
 it("legacy同父并发、服务重建与checkpoint未写回保持精确旧ID、七阶段、一次activity和原Brief",async()=>{
  const f=await fixture();const [one,two]=await Promise.all([f.service.ensureRadarProject(f.context,f.input),f.service.ensureRadarProject(f.context,f.input)]);
  const seed=createHash("sha256").update(JSON.stringify(["u","a",f.parent.id])).digest("hex").slice(0,32);expect(one.id).toBe(`project-radar-${seed}`);expect(two).toEqual(one);
  expect(await createRadarProjectService(db,deps).ensureRadarProject(f.context,{...f.input,title:"不得覆盖",briefDetail:{coreMessage:"不得覆盖"}})).toEqual(one);
  const stages=await createProjectRepository(db).listStages(f.context,one.id);expect(stages.map(r=>r.id).sort()).toEqual(Array.from({length:7},(_,i)=>`stage-radar-${seed}-${i+1}`).sort());expect(await db.select().from(projectActivities)).toHaveLength(1);
  clock+=61_000;await f.tasks.recoverExpiredLeases({kinds:["radar_project_upgrade"],taskId:f.parent.id});const recovered=await f.tasks.claimTask({taskId:f.parent.id,workerId:"recovered-host",leaseSeconds:60});expect(recovered).not.toBeNull();expect(recovered!.lease.attempt).toBeGreaterThan(f.input.attempt);await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();
  expect(await createRadarProjectService(db,deps).ensureRadarProject(f.context,{...f.input,attempt:recovered!.lease.attempt,fenceToken:recovered!.lease.fenceToken,workerId:recovered!.lease.workerId,title:"恢复不得覆盖"})).toEqual(one);
  const other=await fixture({...base,accountId:"b"});expect((await other.service.ensureRadarProject(other.context,other.input)).id).not.toBe(one.id);
 });
 it("纯组tag隔离、合法改名不杀原任务；有账号仍保旧tuple",async()=>{
  const g=await group(),f=await fixture(g.scope);await g.api.update(g.scope,g.row.id,{name:"只改名",expectedVersion:g.row.version});
  const row=await f.service.ensureRadarProject(f.context,f.input),seed=createHash("sha256").update(JSON.stringify([base.userId,"group",g.row.id,f.parent.id])).digest("hex").slice(0,32);expect(row.id).toBe(`project-radar-${seed}`);expect(row.accountId).toBeNull();expect(row.groupId).toBe(g.row.id);
  const a=await account(),af=await fixture(a.scope),ar=await af.service.ensureRadarProject(af.context,af.input);const old=createHash("sha256").update(JSON.stringify([base.userId,a.account.id,af.parent.id])).digest("hex").slice(0,32);expect(ar.id).toBe(`project-radar-${old}`);
  const g2=await group(),f2=await fixture(g2.scope);expect((await f2.service.ensureRadarProject(f2.context,f2.input)).id).not.toBe(row.id);
 });
 it.each(["user","group","account","groupVersion","membershipVersion","no-workspace"] as const)("已有项目也不能用错误%s调用范围读取",async variant=>{
  const a=await account(),f=await fixture(a.scope),original=await f.service.ensureRadarProject(f.context,f.input),bad={...f.context};
  if(variant==="user")bad.userId="other";if(variant==="group")bad.groupId="other";if(variant==="account")bad.accountId="other";if(variant==="groupVersion")bad.groupVersion=999;if(variant==="membershipVersion")bad.membershipVersion=999;if(variant==="no-workspace"){bad.accountId=null;bad.groupId=null;}
  await expect(f.service.ensureRadarProject(bad,f.input)).rejects.toThrow();expect(await createProjectRepository(db).get(f.context,original.id)).toEqual(original);
 });
 it.each(["attempt","fenceToken","workerId","itemId","topicTaskId","transformId","queueTaskId"] as const)("错误%s凭证没有项目副作用",async field=>{
  const f=await fixture(),bad={...f.input,[field]:field==="attempt"?f.input.attempt+1:"foreign"};await expect(f.service.ensureRadarProject(f.context,bad)).rejects.toThrow();await empty();
 });
 it.each(["kind","ownerType","ownerId","payload","stage","topic","transform","project"] as const)("损坏存储族%s不能越过真实父关联",async variant=>{
  const f=await fixture(),patch:any={};if(variant==="kind")patch.kind="source_sync";if(variant==="ownerType")patch.ownerType="source";if(variant==="ownerId")patch.ownerId="foreign";if(variant==="payload")patch.payload={itemId:"foreign"};
  if(["stage","topic","transform","project"].includes(variant))patch.checkpoint={...f.checkpoint,...(variant==="stage"?{stage:"generating"}:variant==="topic"?{topicTaskId:"foreign"}:variant==="transform"?{transformId:"foreign"}:{projectId:"foreign"})};
  await db.update(executionTasks).set(patch).where(eq(executionTasks.id,f.parent.id));await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();await empty();
 });
 it.each(["cancel","pause"] as const)("真实%s先提交，旧proof连已有项目也不能返回或改稿",async command=>{
  const f=await fixture(),original=await f.service.ensureRadarProject(f.context,f.input);await f.tasks.command(f.context,{taskIds:[f.parent.id],command,idempotencyKey:command});await expect(f.service.ensureRadarProject(f.context,{...f.input,title:"错误覆盖"})).rejects.toThrow();expect(await createProjectRepository(db).get(f.context,original.id)).toEqual(original);
 });
 it.each(["lease-expired","deadline-expired","deadline-invalid","new-attempt"] as const)("%s不能创建",async variant=>{
  const f=await fixture();if(variant==="lease-expired")clock+=61_000;else await db.update(executionTasks).set(variant==="new-attempt"?{attempt:f.input.attempt+1,fenceToken:"new-fence",leaseOwner:"new-worker"}:{deadlineAt:variant==="deadline-invalid"?"invalid":"2026-09-07T00:00:00Z"}).where(eq(executionTasks.id,f.parent.id));await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();await empty();
 });
 it("真实成员版本失效及真实账号归档拒绝；活跃父阻止真实转组",async()=>{
  const a=await account(),f=await fixture(a.scope);await db.update(executionTasks).set({membershipVersion:999}).where(eq(executionTasks.id,f.parent.id));await expect(f.service.ensureRadarProject({...f.context,membershipVersion:999},f.input)).rejects.toThrow();await empty();
  await db.update(executionTasks).set({membershipVersion:f.context.membershipVersion}).where(eq(executionTasks.id,f.parent.id));const target=await group(),preview=await a.api.previewTransfer(a.scope,{accountId:a.account.id,toGroupId:target.row.id});expect(preview.activeTaskCount).toBeGreaterThan(0);await expect(a.api.transfer(a.scope,{...preview,idempotencyKey:"actual-transfer"})).rejects.toThrow("进行中的任务");
  await a.accounts.archiveAccount(a.scope,a.account.id);await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();await empty();
 });
 it("组归档先提交拒绝；创建持真实锁先提交后归档保留完整项目",async()=>{
  const g=await group(),f=await fixture(g.scope);await g.api.archive(g.scope,g.row.id,g.row.version);await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();await empty();
  const h=await group(),hf=await fixture(h.scope),held=heldInsert();const creating=held.service.ensureRadarProject(hf.context,hf.input);await held.entered.promise;let archived=false;const archiving=h.api.archive(h.scope,h.row.id,h.row.version).then(x=>{archived=true;return x;});await Promise.resolve();expect(archived).toBe(false);held.release.resolve();const row=await creating;await archiving;expect((await createProjectRepository(db).get(hf.context,row.id)).id).toBe(row.id);expect(await db.select().from(projectStages)).toHaveLength(7);
 });
 it("创建先持锁提交后真实cancel不删项目，取消后旧proof被拒绝",async()=>{
  const f=await fixture(),held=heldInsert();const creating=held.service.ensureRadarProject(f.context,f.input);await held.entered.promise;let cancelled=false;const control=f.tasks.command(f.context,{taskIds:[f.parent.id],command:"cancel",idempotencyKey:"cancel-after-lock"}).then(x=>{cancelled=true;return x;});await Promise.resolve();expect(cancelled).toBe(false);held.release.resolve();const row=await creating;await control;expect(await createProjectRepository(db).get(f.context,row.id)).toEqual(row);await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();
 });
 it("项目后阶段写入故障整笔回滚，不吞错补读；同原proof后续合法创建",async()=>{
  const f=await fixture();let injected=false;const faulty=wrapped((table,builder)=>{if(table===projectStages){injected=true;throw new Error("T1332_TEST_STAGE_INSERT_FAULT");}return builder;});await expect(createRadarProjectService(faulty,deps).ensureRadarProject(f.context,f.input)).rejects.toThrow("T1332_TEST_STAGE_INSERT_FAULT");expect(injected).toBe(true);await empty();expect((await f.service.ensureRadarProject(f.context,f.input)).title).toBe("初始项目");
 });
 it("同主键跨属主不可见不洗成成功且不覆盖原完整项目",async()=>{
  const f=await fixture(),row=await f.service.ensureRadarProject(f.context,f.input);await db.update(projects).set({userId:"foreign-user"}).where(eq(projects.id,row.id));await expect(f.service.ensureRadarProject(f.context,f.input)).rejects.toThrow();expect(await db.select().from(projects)).toEqual([{...row,userId:"foreign-user"}]);expect(await db.select().from(projectStages)).toHaveLength(7);expect(await db.select().from(projectActivities)).toHaveLength(1);
 });
 it("真实项目读取故障原样失败，不靠catch-all返回已有数据",async()=>{
  const f=await fixture(),original=await f.service.ensureRadarProject(f.context,f.input);const decorate=(store:any):any=>new Proxy(store,{get(target,key){if(key==="transaction")return(body:any,...rest:any[])=>target.transaction((tx:any)=>body(decorate(tx)),...rest);if(key==="select")return(...args:any[])=>{const builder=target.select(...args);return new Proxy(builder,{get(b,k){if(k==="from")return(table:unknown)=>{if(table===projects)throw new Error("T1332_TEST_PROJECT_READ_FAULT");return b.from(table);};const v=Reflect.get(b,k,b);return typeof v==="function"?v.bind(b):v;}});};const v=Reflect.get(target,key,target);return typeof v==="function"?v.bind(target):v;}});await expect(createRadarProjectService(decorate(db),deps).ensureRadarProject(f.context,f.input)).rejects.toThrow("T1332_TEST_PROJECT_READ_FAULT");expect(await createProjectRepository(db).get(f.context,original.id)).toEqual(original);
 });
});
