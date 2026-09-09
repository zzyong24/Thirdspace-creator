import {beforeEach, describe, expect, it, vi} from "vitest";
import {createDb, eq, executionTasks, type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createPersistentTaskService} from "../execution";
import {createRadarProjectQueueService} from "./radar-project-queue.service";
import type {IntelligenceService} from "./intelligence.service";

const ctx: RequestContext = {userId: "u", accountId: "a", requestId: "r", source: "user"};
let db: Db;
let clock: number;
let seq: number;
let tasks: ReturnType<typeof createPersistentTaskService>;
const output = {title: "我的项目", hook: "开头", structureSteps: ["问题", "方法"], coreClaims: ["判断"], reusablePattern: "结构", factRisks: [], adaptationStrategy: {keep:[],replace:[],add:[],avoid:[]}, adaptedDraft: {contentText: "候选初稿", generatedFromTranscriptHash: "sha256:a", strategyHash: "a", templateVersion: "v1"}};
function fixture() {
  const transforms = new Map<string, any>();
  const details = new Map<string, any>();
  const item = (id: string) => {
    if (!details.has(id)) details.set(id, {item: {id, title: id, type: "video", platform: "douyin", canonicalUrl: `https://douyin.com/${id}`}, snapshots: [{id:`snapshot-${id}`}], transcript: {status:"done",text:"完整逐字稿",executionTaskId:null}, transforms:[]});
    return {...details.get(id), transforms: [...transforms.values()].filter(t=>t.itemId===id)};
  };
  const intelligence = {
    getItem: vi.fn(async (c: RequestContext,id:string) => {if(c.accountId!=="a")throw new Error("ownership");return item(id);}),
    enqueueTranscripts: vi.fn(async (_c: RequestContext, input: {itemIds:string[];idempotencyKey:string}) => {
      const id=input.itemIds[0]!;
      const child = await tasks.enqueue(ctx,{kind:"transcribe",ownerType:"item",ownerId:id,idempotencyKey:input.idempotencyKey,payload:{}});
      item(id);details.get(id).transcript={status:"queued",text:null,executionTaskId:child.id};
      return {tasks:[child],skipped:[]};
    }),
    startTopicPreview: vi.fn(async (_c: RequestContext,input:any) => {
      const task=await tasks.enqueue(ctx,{kind:"topic_preview",ownerType:"transform",ownerId:input.itemId,idempotencyKey:input.idempotencyKey,payload:{}});
      const transform={id:`transform-${input.itemId}`,itemId:input.itemId,outputSnapshot:output};transforms.set(transform.id,transform);
      return {task,transform};
    }),
  };
  const projects={ensureRadarProject:vi.fn(async(_ctx: RequestContext, _input: any)=>({id:"project-1"}))};
  const queue=createRadarProjectQueueService({tasks,intelligence:intelligence as unknown as IntelligenceService,assertPositioning:async()=>{},projects});
  const tick=async()=>{clock+=3000;await queue.tick({shouldStop:()=>false});};
  return {queue,tick,intelligence,projects,details,item};
}
beforeEach(async()=>{({db}=await createDb());clock=Date.parse("2026-09-08T00:00:00Z");seq=0;tasks=createPersistentTaskService(db,{now:()=>new Date(clock).toISOString(),nextId:p=>`${p}-${String(++seq).padStart(4,"0")}`});});
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
    expect(f.projects.ensureRadarProject.mock.calls[0]?.[1]?.briefDetail.contentRadarEvidence.adaptedDraftSeed.contentText).toBe("候选初稿");
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
});
