import {afterEach,beforeEach, describe, expect, it, vi} from "vitest";
import {createDb, eq, executionTasks, projects, type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createPersistentTaskService} from "../execution";
import {createRadarProjectQueueService} from "./radar-project-queue.service";
import type {IntelligenceService} from "./intelligence.service";
import {createRadarProjectService} from "../projects/radar-project.service";
import {createAccountGroupService} from "../platform-account/account-group.service";
import {createPlatformAccountService} from "../platform-account/platform-account.service";

const ctx: RequestContext = {userId: "u", accountId: "a", requestId: "r", source: "user"};
let db: Db;
let clock: number;
let seq: number;
let tasks: ReturnType<typeof createPersistentTaskService>;
let close:()=>Promise<unknown>;
const output = {title: "我的项目", hook: "开头", structureSteps: ["问题", "方法"], coreClaims: ["判断"], reusablePattern: "结构", factRisks: [], adaptationStrategy: {keep:[],replace:[],add:[],avoid:[]}, adaptedDraft: {contentText: "候选初稿", generatedFromTranscriptHash: "sha256:a", strategyHash: "a", templateVersion: "v1"}};
function fixture(scope:RequestContext=ctx,value:Record<string,any>=structuredClone(output)) {
  const transforms = new Map<string, any>();
  const details = new Map<string, any>();
  const item = (id: string) => {
    if (!details.has(id)) details.set(id, {item: {id,userId:scope.userId,accountId:scope.accountId??null,groupId:scope.groupId??null, title: id, type: "video", platform: "douyin", canonicalUrl: `https://douyin.com/${id}`}, snapshots: [{id:`snapshot-${id}`,itemId:id}], transcript: {status:"done",text:"完整逐字稿",executionTaskId:null}, transforms:[]});
    return {...details.get(id), transforms: [...transforms.values()].filter(t=>t.itemId===id)};
  };
  const intelligence = {
    getItem: vi.fn(async (c: RequestContext,id:string) => {if(c.userId!==scope.userId||(c.accountId??null)!==(scope.accountId??null))throw new Error("ownership");return item(id);}),
    enqueueTranscripts: vi.fn(async (_c: RequestContext, input: {itemIds:string[];idempotencyKey:string}) => {
      const id=input.itemIds[0]!;
      const child = await tasks.enqueue(_c,{kind:"transcribe",ownerType:"item",ownerId:id,idempotencyKey:input.idempotencyKey,payload:{}});
      item(id);details.get(id).transcript={status:"queued",text:null,executionTaskId:child.id};
      return {tasks:[child],skipped:[]};
    }),
    startTopicPreview: vi.fn(async (_c: RequestContext,input:any) => {
      const task=await tasks.enqueue(_c,{kind:"topic_preview",ownerType:"transform",ownerId:input.itemId,idempotencyKey:input.idempotencyKey,payload:{}});
      const transform={id:`transform-${input.itemId}`,userId:scope.userId,accountId:scope.accountId??null,groupId:scope.groupId??null,itemId:input.itemId,aiTaskId:task.id,sourceSnapshotId:input.sourceSnapshotId,positioningVersionId:input.positioningVersionId,idempotencyKey:input.idempotencyKey,outputSnapshot:structuredClone(value)};transforms.set(transform.id,transform);
      return {task,transform};
    }),
  };
  const actual=createRadarProjectService(db,{now:()=>new Date(clock).toISOString(),nextId:p=>`${p}-${++seq}`});
  const projects={ensureRadarProject:vi.fn(actual.ensureRadarProject)};
  const taskReads={...tasks,get:vi.fn(tasks.get)};
  const queue=createRadarProjectQueueService({tasks:taskReads,now:()=>new Date(clock).toISOString(),intelligence:intelligence as unknown as IntelligenceService,assertPositioning:async()=>{},projects});
  const tick=async()=>{clock+=3000;await queue.tick({shouldStop:()=>false});};
  return {queue,tick,intelligence,projects,details,item,transforms,taskReads};
}
beforeEach(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();clock=Date.parse("2026-09-08T00:00:00Z");seq=0;tasks=createPersistentTaskService(db,{now:()=>new Date(clock).toISOString(),nextId:p=>`${p}-${String(++seq).padStart(4,"0")}`});});
afterEach(async()=>{await close?.();});
describe("雷达升级项目持久队列",()=>{
  it("重复点击复用父项，done 转写不重做，原 preview 完成后只建一次项目且不重写稿",async()=>{
    const f=fixture();const input={itemIds:["one"],positioningVersionId:"positioning",idempotencyKey:"click1"};
    const first=(await f.queue.enqueue(ctx,input)).tasks[0]!;
    expect((await f.queue.enqueue(ctx,{...input,idempotencyKey:"click2"})).tasks[0]?.id).toBe(first.id);
    await f.tick();expect(f.intelligence.enqueueTranscripts).not.toHaveBeenCalled();
    const running=await tasks.get(ctx,first.id);expect(running.runtimeStatus).toBe("retry_wait");
    const child=(running.checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status:"succeeded"}).where(eq(executionTasks.id,child));
    await f.tick();expect((await tasks.get(ctx,first.id)).status).toBe("succeeded");
    expect(f.projects.ensureRadarProject).toHaveBeenCalledTimes(1);
    expect(f.projects.ensureRadarProject.mock.calls[0]?.[1]?.briefDetail.contentRadarEvidence?.adaptedDraftSeed.contentText).toBe("候选初稿");
    await f.tick();expect(f.projects.ensureRadarProject).toHaveBeenCalledTimes(1);
  });
  it("FIFO 等待前项子任务，前项 blocked 后继续下一项；重启沿原 child ID",async()=>{
    const f=fixture();const rows=(await f.queue.enqueue(ctx,{itemIds:["one","two"],positioningVersionId:"p",idempotencyKey:"batch"})).tasks;
    await f.tick();await f.tick();expect(f.intelligence.startTopicPreview).toHaveBeenCalledTimes(1);
    const first=await tasks.get(ctx,rows[0]!.id);const child=(first.checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status:"failed",lastErrorCode:"CONFIG"}).where(eq(executionTasks.id,child));
    await f.tick();expect((await tasks.get(ctx,first.id)).status).toBe("blocked");
    await f.tick();expect(f.intelligence.startTopicPreview).toHaveBeenCalledTimes(2);
  });
  it("取消等待父项不启动后续步骤，已有共享转写不会被重新创建或取消",async()=>{
    const f=fixture();f.item("one");const child=await tasks.enqueue(ctx,{kind:"transcribe",ownerType:"item",ownerId:"one",idempotencyKey:"existing",payload:{}});
    f.details.get("one").transcript={status:"running",text:null,executionTaskId:child.id};
    const parent=(await f.queue.enqueue(ctx,{itemIds:["one"],positioningVersionId:"p",idempotencyKey:"x"})).tasks[0]!;
    await f.tick();expect(f.intelligence.enqueueTranscripts).not.toHaveBeenCalled();
    await tasks.command(ctx,{taskIds:[parent.id],command:"cancel",idempotencyKey:"cancel"});
    await f.tick();expect(f.intelligence.startTopicPreview).not.toHaveBeenCalled();expect((await tasks.get(ctx,child.id)).status).toBe("queued");
  });
  it("宿主在父项领取后退出，过期租约恢复到同一父项；显式重试沿用失败子项",async()=>{
    const f=fixture();const parent=(await f.queue.enqueue(ctx,{itemIds:["one"],positioningVersionId:"p",idempotencyKey:"x"})).tasks[0]!;
    await tasks.claimNext({kinds:["radar_project_upgrade"],workerId:"old-host",leaseSeconds:1});
    await f.tick();const original=await tasks.get(ctx,parent.id);expect(original.attempt).toBe(2);
    const child=(original.checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status:"failed",lastErrorCode:"WORKER_EXECUTION_INTERRUPTED"}).where(eq(executionTasks.id,child));
    await f.tick();expect((await tasks.get(ctx,parent.id)).status).toBe("blocked");
    await tasks.command(ctx,{taskIds:[parent.id],command:"retry",idempotencyKey:"user-retry"});
    await f.tick();expect((await tasks.get(ctx,child)).status).toBe("queued");
    expect(f.intelligence.startTopicPreview).toHaveBeenCalledTimes(1);
    expect((await tasks.get(ctx,parent.id)).checkpoint).toMatchObject({topicTaskId:child});
  });
  it("跨账号批次未写入父队列",async()=>{
    const f=fixture();await expect(f.queue.enqueue({...ctx,accountId:"other"},{itemIds:["one"],positioningVersionId:"p",idempotencyKey:"x"})).rejects.toThrow("ownership");
    expect((await tasks.list(ctx,{kind:"radar_project_upgrade"})).total).toBe(0);
  });
  it("用户重试父项可继续等待用户的原子项，未知结果仍不重放",async()=>{
    const f=fixture();const parent=(await f.queue.enqueue(ctx,{itemIds:["one"],positioningVersionId:"p",idempotencyKey:"x"})).tasks[0]!;
    await f.tick();const child=((await tasks.get(ctx,parent.id)).checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status:"waiting_user"}).where(eq(executionTasks.id,child));
    await f.tick();await tasks.command(ctx,{taskIds:[parent.id],command:"retry",idempotencyKey:"retry-auth"});
    await f.tick();expect((await tasks.get(ctx,child)).status).toBe("queued");
    await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,child));
    await f.tick();await tasks.command(ctx,{taskIds:[parent.id],command:"retry",idempotencyKey:"retry-unknown"});
    await f.tick();expect((await tasks.get(ctx,child)).runtimeStatus).toBe("unknown_result");
    expect((await tasks.get(ctx,parent.id)).status).toBe("blocked");
  });
  it("旧tick丢失租约后不会继续创建模型子项",async()=>{
    const f=fixture();const parent=(await f.queue.enqueue(ctx,{itemIds:["one"],positioningVersionId:"p",idempotencyKey:"x"})).tasks[0]!;
    f.intelligence.getItem.mockImplementationOnce(async()=>{
      await db.update(executionTasks).set({attempt:77,leaseOwner:"new-worker"}).where(eq(executionTasks.id,parent.id));
      return f.item("one");
    });
    await f.tick();expect(f.intelligence.startTopicPreview).not.toHaveBeenCalled();expect(f.projects.ensureRadarProject).not.toHaveBeenCalled();
  });
  it.each(['absent-mode-and-progress','strategy-without-progress','complete-progress','sparse-progress'] as const)('旧策略输出兼容%s：真实项目事务不补阶段/不重做子任务',async family=>{
    const value:Record<string,any>=structuredClone(output);
    if(family!=='absent-mode-and-progress')value.generationMode='strategy_backed';
    if(family==='complete-progress')value.generationProgress={decomposition:{status:'completed'},topic:{status:'completed'},draft:{status:'completed'}};
    if(family==='sparse-progress')value.generationProgress={topic:{status:'completed'}};
    const f=fixture(ctx,value),parent=(await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'legacy'})).tasks[0]!;
    await f.tick();const cp=(await tasks.get(ctx,parent.id)).checkpoint as any;
    const before=structuredClone(f.transforms.get(cp.transformId));
    await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,cp.topicTaskId));
    await f.tick();const done=await tasks.get(ctx,parent.id);expect(done.status).toBe('succeeded');
    const projectId=(done.checkpoint as any).projectId;
    expect((await db.select().from(projects).where(eq(projects.id,projectId)))[0]?.briefDetail).toMatchObject({contentRadarEvidence:{adaptedDraftSeed:value.adaptedDraft}});
    expect(f.transforms.get(cp.transformId)).toEqual(before);expect(Object.hasOwn(f.transforms.get(cp.transformId).outputSnapshot,'generationProgress')).toBe(Object.hasOwn(value,'generationProgress'));
    expect((await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'changed',idempotencyKey:'again'})).tasks[0]!.id).toBe(parent.id);
    await f.tick();expect(f.intelligence.startTopicPreview).toHaveBeenCalledTimes(1);expect(f.projects.ensureRadarProject).toHaveBeenCalledTimes(1);
  });
  it.each(['absent','undefined','null'] as const)('真实succeeded child的runtimeStatus=%s不是unknown',async mode=>{
    const f=fixture(),parent=(await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'runtime'})).tasks[0]!;
    await f.tick();const child=((await tasks.get(ctx,parent.id)).checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,child));
    f.taskReads.get.mockImplementation(async(c,id)=>{const row=await tasks.get(c,id);if(id!==child||mode==='absent')return row;return {...row,runtimeStatus:mode==='null'?null:undefined} as any;});
    await f.tick();expect((await tasks.get(ctx,parent.id)).status).toBe('succeeded');
  });
  it.each(['absent-mode-and-progress','strategy-without-progress','complete-progress','sparse-progress'] as const)('旧metadata族%s仍拒绝缺内容/错误child，兼容不扩大授权',async family=>{
    for(const variant of ['missing-hook','missing-strategy','missing-content','wrong-child','failed-child']){
      const value:Record<string,any>=structuredClone(output);
      if(family!=='absent-mode-and-progress')value.generationMode='strategy_backed';
      if(family==='complete-progress')value.generationProgress={decomposition:{status:'completed'},topic:{status:'completed'},draft:{status:'completed'}};
      if(family==='sparse-progress')value.generationProgress={topic:{status:'completed'}};
      if(variant==='missing-hook')delete value.hook;if(variant==='missing-strategy')delete value.adaptationStrategy;if(variant==='missing-content')delete value.adaptedDraft.contentText;
      const f=fixture(ctx,value),itemId=`${family}-${variant}`,parent=(await f.queue.enqueue(ctx,{itemIds:[itemId],positioningVersionId:'p',idempotencyKey:itemId})).tasks[0]!;
      await f.tick();const cp=(await tasks.get(ctx,parent.id)).checkpoint as any,before=structuredClone(f.transforms.get(cp.transformId));
      await db.update(executionTasks).set({status:variant==='failed-child'?'failed':'succeeded',...(variant==='wrong-child'?{ownerId:'foreign'}:{})}).where(eq(executionTasks.id,cp.topicTaskId));
      await f.tick();expect((await tasks.get(ctx,parent.id)).status).toBe('blocked');expect(f.projects.ensureRadarProject).not.toHaveBeenCalled();expect(f.transforms.get(cp.transformId)).toEqual(before);
      expect(await db.select().from(projects)).toEqual([]);
    }
  });
  it.each(['partial','unknown_result'] as const)('真实%s子项不能借映射succeeded创建项目',async status=>{
    const f=fixture(),parent=(await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'partial'})).tasks[0]!;
    await f.tick();const child=((await tasks.get(ctx,parent.id)).checkpoint as any).topicTaskId;
    await db.update(executionTasks).set({status}).where(eq(executionTasks.id,child));
    await f.tick();expect(f.projects.ensureRadarProject).not.toHaveBeenCalled();expect((await tasks.get(ctx,parent.id)).status).toBe('blocked');
  });
  it.each(['child-owner','child-kind','child-key','transform-task','transform-item','transform-snapshot','transform-positioning','transform-key','transform-scope','rewrite-mode','missing-hook'] as const)('%s错误不因旧metadata兼容扩大创建权',async variant=>{
    const f=fixture(),parent=(await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'wrong'})).tasks[0]!;
    await f.tick();const cp=(await tasks.get(ctx,parent.id)).checkpoint as any;const transform=f.transforms.get(cp.transformId);
    await db.update(executionTasks).set({status:'succeeded',...(variant==='child-owner'?{ownerId:'wrong'}:{}),...(variant==='child-kind'?{kind:'script_candidate'}:{}),...(variant==='child-key'?{idempotencyKey:'foreign-preview'}:{})}).where(eq(executionTasks.id,cp.topicTaskId));
    if(variant==='transform-task')transform.aiTaskId='foreign-task';if(variant==='transform-item')transform.itemId='foreign-item';if(variant==='transform-snapshot')transform.sourceSnapshotId='foreign-snapshot';
    if(variant==='transform-positioning')transform.positioningVersionId='foreign-positioning';if(variant==='transform-key')transform.idempotencyKey='foreign-key';if(variant==='transform-scope')transform.userId='foreign-user';
    if(variant==='rewrite-mode')transform.outputSnapshot.generationMode='rewrite_only';if(variant==='missing-hook')delete transform.outputSnapshot.hook;
    await f.tick();expect(f.projects.ensureRadarProject).not.toHaveBeenCalled();expect((await tasks.get(ctx,parent.id)).status).toBe('blocked');
  });
  it('纯组改名导致child新groupVersion仍可创建，真正归档不放行',async()=>{
    const base={...ctx,accountId:null},groups=createAccountGroupService({db,now:()=>new Date(clock).toISOString(),nextId:p=>`${p}-${++seq}`});
    const group=await groups.create(base,{name:'原组',idempotencyKey:'group'}),scope={...base,groupId:group.id};const f=fixture(scope);
    const parent=(await f.queue.enqueue(scope,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'rename'})).tasks[0]!;
    await groups.update(scope,group.id,{name:'只改名字',expectedVersion:group.version});await f.tick();const cp=(await tasks.get(scope,parent.id)).checkpoint as any;
    const child=await tasks.get(scope,cp.topicTaskId);expect(child.groupVersion).not.toBe(parent.groupVersion);
    await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,child.id));await f.tick();expect((await tasks.get(scope,parent.id)).status).toBe('succeeded');
  });
  it('迁移前legacy父null组可沿真实新增legacy成员的child/transform，不换旧父',async()=>{
    const f=fixture(),parent=(await f.queue.enqueue(ctx,{itemIds:['one'],positioningVersionId:'p',idempotencyKey:'legacy-parent'})).tasks[0]!;
    expect(parent.groupId).toBeNull();
    await createPlatformAccountService({db,now:()=>new Date(clock).toISOString(),nextId:p=>p==='acct'?'a':`${p}-${++seq}`}).createAccount({userId:'u',requestId:'legacy-register',source:'user'},{platform:'douyin',accountHandle:'隔离真实legacy账号',followerBaseline:0});
    await f.tick();const cp=(await tasks.get(ctx,parent.id)).checkpoint as any,child=await tasks.get(ctx,cp.topicTaskId);expect(child.groupId).toBe('grp_legacy_a');
    f.transforms.get(cp.transformId).groupId='grp_legacy_a';await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,child.id));await f.tick();expect((await tasks.get(ctx,parent.id)).status).toBe('succeeded');
  });
});
