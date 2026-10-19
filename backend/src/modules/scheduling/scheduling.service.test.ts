import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createSchedulingService,
  type SchedulingService,
} from "./scheduling.service";
import {
  OwnershipError,
  AccountRequiredError,
  ValidationError,
} from "./scheduling.errors";
import { scheduledJobs } from "../../schema/scheduling";
import {accountGroups} from '../../schema/account-groups';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account/platform-account.service';

async function realGroupFixture(db:Db){
 let n=0;const deps={db,now:()=>NOW,nextId:(prefix:string)=>`${prefix}-real-${++n}`};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const base={userId:'draft-real-user',requestId:'draft-real',source:'user' as const};
 const group=await groups.create(base,{name:'中性自动化组',idempotencyKey:'real-group'});
 const groupOnly={...base,accountId:null,groupId:group.id};
 const a=await accounts.createAccount(groupOnly,{platform:'douyin',accountHandle:'中性A'});
 const b=await accounts.createAccount(groupOnly,{platform:'xiaohongshu',accountHandle:'中性B'});
 const target=async(accountId:string)=>({...groupOnly,accountId,membershipVersion:(await groups.forAccount(groupOnly,accountId)).version});
 return {groupOnly,a:await target(a.id),b:await target(b.id),groups,accounts,owner:createSchedulingService(deps)};
}

describe('T1074 自动化草稿与启用比较',()=>{
 it.each([true,false])('topic.daily已有非null账号任务enabled=%s：空组候选拒绝且完整原内容不变',async enabled=>{
  const {db,client}=await createDb();try{
   const f=await realGroupFixture(db),job=await f.owner.createJob(f.a,{name:'已有任务',prompt:'原说明',schedule:'0 9 * * *',sourceKind:'topic.daily',enabled});
   await expect(f.owner.createDraftIfAbsent(f.groupOnly,{name:'新的候选',prompt:'新的说明',schedule:'30 10 * * *',sourceKind:'topic.daily'})).rejects.toMatchObject({existingJobId:job.id,readOperationId:'scheduledJobs.get',enableOperationId:'scheduledJobs.setEnabled'});
   expect(await f.owner.getJob(f.groupOnly,job.id)).toEqual(job);
  }finally{await client.close();}
 });
 it('两个真实平台目标互不阻断，同目标不重复；成员转组后不能沿旧上下文采用',async()=>{
  const {db,client}=await createDb();try{
   const f=await realGroupFixture(db),input={name:'中性草稿',prompt:'待确认',schedule:'0 9 * * *',sourceKind:'comments' as const};
   const first=await f.owner.createDraftIfAbsent(f.a,input),second=await f.owner.createDraftIfAbsent(f.b,input);
   expect(first.accountId).toBe(f.a.accountId);expect(second.accountId).toBe(f.b.accountId);expect(second.id).not.toBe(first.id);
   await expect(f.owner.createDraftIfAbsent(f.a,input)).rejects.toMatchObject({existingJobId:first.id});
   const target=await f.groups.create(f.groupOnly,{name:'另一个中性组',idempotencyKey:'target-group'});
   const preview=await f.groups.previewTransfer(f.groupOnly,{accountId:f.a.accountId!,toGroupId:target.id});
   await f.groups.transfer(f.groupOnly,{...preview,idempotencyKey:'move-account'});
   await expect(f.owner.setEnabledIfUnchanged(f.a,first.id,true,first)).rejects.toThrow();
   expect((await f.owner.listJobs(f.groupOnly,{limit:50,offset:0})).rows.some(row=>row.id===first.id)).toBe(false);
   const moved={...f.a,groupId:target.id,membershipVersion:(await f.groups.forAccount({...f.groupOnly,groupId:target.id},f.a.accountId!)).version};
   expect(await f.owner.getJob(moved,first.id)).toMatchObject({enabled:false,prompt:'待确认'});
  }finally{await client.close();}
 });
 it('普通create与AI关闭草稿沿同去重身份并发，不建立第二条任务',async()=>{
  const {db,client}=await createDb();try{
   const f=await realGroupFixture(db);
   const [manual,draft]=await Promise.allSettled([
    f.owner.createJob(f.a,{name:'手工任务',prompt:'手工说明',schedule:'0 9 * * *',sourceKind:'topic.daily'}),
    f.owner.createDraftIfAbsent(f.groupOnly,{name:'候选草稿',prompt:'候选说明',schedule:'30 9 * * *',sourceKind:'topic.daily'}),
   ]);
   expect(manual.status).toBe('fulfilled');
   const rows=(await f.owner.listJobs(f.groupOnly,{sourceKind:'topic.daily',limit:50,offset:0})).rows;
   expect(rows).toHaveLength(1);expect(rows[0]?.enabled).toBe(true);
   if(draft.status==='fulfilled')expect(draft.value).toMatchObject({id:rows[0]!.id,enabled:false});
   else expect(draft.reason).toMatchObject({existingJobId:rows[0]!.id});
  }finally{await client.close();}
 });
 it('真实空组创建关闭草稿；已有同类任务明确冲突，外层失败全部回滚',async()=>{
  const {db,client}=await createDb();try{
   const group={...ctxNoAcct,accountId:null,groupId:'draft-group',groupVersion:1};
   await db.insert(accountGroups).values({id:group.groupId,userId:group.userId,name:'中性组',status:'active',version:1,createdAt:NOW,updatedAt:NOW});
   const owner=makeService(db),input={name:'中性草稿',prompt:'待确认',sourceKind:'topic.daily' as const,schedule:'0 9 * * *'};
   const job=await owner.createDraftIfAbsent(group,input);expect(job).toMatchObject({accountId:null,enabled:false});
   await expect(owner.createDraftIfAbsent(group,input)).rejects.toMatchObject({existingJobId:job.id});
   expect(await owner.getJob(group,job.id)).toEqual(job);
   await expect(db.transaction(async tx=>{await makeService(tx as unknown as Db).setEnabledIfUnchanged(group,job.id,true,job);throw Error('事务回滚');})).rejects.toThrow('事务回滚');
   expect(await owner.getJob(group,job.id)).toEqual(job);
  }finally{await client.close();}
 });
 it('固定时钟下普通改内容后旧候选不能启用，保留用户新内容',async()=>{
  const {db,client}=await createDb();try{
   const owner=makeService(db),job=await owner.createJob(ctxA,{name:'中性任务',prompt:'原说明',sourceKind:'comments',schedule:'0 9 * * *'});
   await owner.updateJob(ctxA,job.id,{prompt:'用户刚改的说明'});
   await expect(owner.setEnabledIfUnchanged(ctxA,job.id,false,job)).rejects.toThrow('改变');
   expect(await owner.getJob(ctxA,job.id)).toMatchObject({prompt:'用户刚改的说明',enabled:true,updatedAt:NOW});
  }finally{await client.close();}
 });
});

// Scheduling service test (T-007 D1 → T-332 S2) — the service builds a (user, account)
// 双维 scoped repo per request(repoFor bakes ctx.userId + ctx.accountId)。Proves:
// create/list/get/update/setEnabled land the right state + DTO shape; job_run
// createRun/getRun/listRunsByJob ride requireJob; a cross-user ctx sees nothing
// (OwnershipError → 404);未选号 → AccountRequiredError(引导态);双账号 strict 隔离;
// 系统枚举走显式 listJobsSystem。now/nextId are injected stubs (deterministic).

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "r1",
  source: "user",
  accountId: "acct-a",
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "r2",
  source: "user",
  accountId: "acct-b",
};
// 同 user-a 的第二个号(双账号 strict 隔离用)。
const ctxA2: RequestContext = {
  userId: "user-a",
  requestId: "r3",
  source: "user",
  accountId: "acct-a2",
};
// 未选号(引导态)。
const ctxNoAcct: RequestContext = { userId: "user-a", requestId: "r4", source: "user" };

function makeService(db: Db): SchedulingService {
  let seq = 0;
  return createSchedulingService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

describe("scheduling service", () => {
  let db: Db;
  let svc: SchedulingService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("createJob lands defaults (enabled, empty prompt/target/grants, null recipe)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "每天抓我评论",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    expect(job).toMatchObject({
      userId: "user-a",
      accountId: "acct-a", // [T-332 S2] 属主号从 ctx stamp(§4.6)
      name: "每天抓我评论",
      prompt: "",
      sourceKind: "comments",
      target: {},
      toolGrants: [],
      recipe: null,
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("[T-598] intelligence.sync 只能由系统创建，用户可编辑计划但不能修改来源授权", async () => {
    await expect(
      svc.createJob(ctxA, {
        name: "伪造雷达任务",
        sourceKind: "intelligence.sync",
        schedule: "* * * * *",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const job = await svc.createJob(ctxA, {
      name: "内容雷达自动同步",
      sourceKind: "intelligence.sync",
      schedule: "*/15 * * * *",
      systemManaged: true,
    });
    await expect(
      svc.updateJob(ctxA, job.id, { target: { sourceId: "forged" } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.setEnabled(ctxA, job.id, false)).resolves.toMatchObject({
      enabled: false,
    });
  });

  it("[T-600] 退役 sourceKind 不能新建或重新启用", async () => {
    for (const sourceKind of ["self.detail", "benchmark", "favorites"] as const) {
      await expect(
        svc.createJob(ctxA, {
          name: "旧兼容任务",
          sourceKind,
          schedule: "0 9 * * *",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    await db.insert(scheduledJobs).values({
      id: "legacy-detail",
      userId: ctxA.userId,
      accountId: ctxA.accountId!,
      name: "作品明细采集（兼容入口）",
      prompt: "",
      sourceKind: "self.detail",
      target: {},
      schedule: "10 9 * * *",
      toolGrants: [],
      enabled: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await expect(
      svc.setEnabled(ctxA, "legacy-detail", true),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.updateJob(ctxA, "legacy-detail", { name: "重新包装旧任务" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("listJobs filters by sourceKind + enabled, scoped to owner", async () => {
    await svc.createJob(ctxA, {
      name: "metrics",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const comments = await svc.createJob(ctxA, {
      name: "comments",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    await svc.setEnabled(ctxA, comments.id, false);

    const all = await svc.listJobs(ctxA, { limit: 100, offset: 0 });
    expect(all.total).toBe(2);

    const onlyComments = await svc.listJobs(ctxA, {
      sourceKind: "comments",
      limit: 100,
      offset: 0,
    });
    expect(onlyComments.rows.map((r) => r.name)).toEqual(["comments"]);

    const onlyEnabled = await svc.listJobs(ctxA, {
      enabled: true,
      limit: 100,
      offset: 0,
    });
    expect(onlyEnabled.rows.map((r) => r.name)).toEqual(["metrics"]);

    // user B sees nothing.
    const bList = await svc.listJobs(ctxB, { limit: 100, offset: 0 });
    expect(bList.total).toBe(0);
  });

  it("updateJob edits name/prompt/schedule/target/toolGrants/enabled", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const updated = await svc.updateJob(ctxA, job.id, {
      name: "renamed",
      prompt: "去主页抓",
      schedule: "30 9 * * *",
      target: { externalSourceId: "src-9" },
      toolGrants: ["browser.navigate"],
      enabled: false,
    });
    expect(updated).toMatchObject({
      name: "renamed",
      prompt: "去主页抓",
      schedule: "30 9 * * *",
      target: { externalSourceId: "src-9" },
      toolGrants: ["browser.navigate"],
      enabled: false,
    });
  });

  it("ownership: user B cannot get/update/setEnabled user A's job (OwnershipError)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "A 的作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    await expect(svc.getJob(ctxB, job.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svc.updateJob(ctxB, job.id, { name: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.setEnabled(ctxB, job.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("job_run: createRun/getRun/listRunsByJob ride requireJob + scope to owner", async () => {
    const job = await svc.createJob(ctxA, {
      name: "A 的作业",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    const run = await svc.createRun(ctxA, { jobId: job.id, aiTaskId: "ait-7" });
    expect(run).toMatchObject({
      userId: "user-a",
      jobId: job.id,
      aiTaskId: "ait-7",
      status: "running",
      itemsNew: 0,
      itemsUpdated: 0,
      finishedAt: null,
    });

    const got = await svc.getRun(ctxA, run.id);
    expect(got.id).toBe(run.id);
    const runs = await svc.listRunsByJob(ctxA, job.id, { limit: 100, offset: 0 });
    expect(runs.total).toBe(1);

    // B cannot create a run under A's job, list A's runs, or read A's run.
    await expect(
      svc.createRun(ctxB, { jobId: job.id }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svc.listRunsByJob(ctxB, job.id, { limit: 100, offset: 0 }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.getRun(ctxB, run.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("updateRun (scheduler 回填) sets terminal state, scoped to owner", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const run = await svc.createRun(ctxA, { jobId: job.id });
    const done = await svc.updateRun(ctxA, run.id, {
      status: "needs_reconnect",
      error: "需重连 Chrome:登录态过期",
      finishedAt: "2026-06-21T00:05:00.000Z",
    });
    expect(done.status).toBe("needs_reconnect");
    expect(done.error).toContain("需重连 Chrome");
    expect(done.finishedAt).toBe("2026-06-21T00:05:00.000Z");
    await expect(
      svc.updateRun(ctxB, run.id, { status: "failed" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-332 S2] 未选号 → 用户面 job 读写一律抛 AccountRequiredError(引导态)", async () => {
    await expect(
      svc.createJob(ctxNoAcct, {
        name: "j",
        sourceKind: "self.metrics",
        schedule: "0 9 * * *",
      }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      svc.listJobs(ctxNoAcct, { limit: 100, offset: 0 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(svc.getJob(ctxNoAcct, "any")).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
  });

  it("[T-332 S2] 双账号 strict 隔离:A 号 job 对 A2 号不可见;by-id 跨号 404;系统枚举跨号全见", async () => {
    const jobA = await svc.createJob(ctxA, {
      name: "A 号作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const jobA2 = await svc.createJob(ctxA2, {
      name: "A2 号作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });

    const listA = await svc.listJobs(ctxA, { limit: 100, offset: 0 });
    expect(listA.rows.map((r) => r.id)).toEqual([jobA.id]);
    const listA2 = await svc.listJobs(ctxA2, { limit: 100, offset: 0 });
    expect(listA2.rows.map((r) => r.id)).toEqual([jobA2.id]);

    // by-id 跨号(§4.5)→ 404 语义。
    await expect(svc.getJob(ctxA2, jobA.id)).rejects.toBeInstanceOf(OwnershipError);

    // [ISO-06] 系统枚举(cron 调度器)显式走 listJobsSystem → 该 user 两号 job 全见。
    const sysCtx: RequestContext = {
      userId: "user-a",
      requestId: "scheduler",
      source: "ingestion",
    };
    const all = await svc.listJobsSystem(sysCtx, { limit: 100, offset: 0 });
    expect(new Set(all.rows.map((r) => r.id))).toEqual(new Set([jobA.id, jobA2.id]));
  });

  it("[T-332 S2 · GAP-08] createRun 透传 scheduledFor 落库(cron 锚;DTO 不外露,读回行核验)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const anchored = await svc.createRun(ctxA, {
      jobId: job.id,
      scheduledFor: "2026-06-21T09:00:00.000Z",
    });
    const manual = await svc.createRun(ctxA, { jobId: job.id });
    // scheduled_for 是内部幂等锚(不在 contract DTO 里,S3 再议外露)→ 直接读行核验落库。
    const { createSchedulingRepository } = await import("./scheduling.repository");
    let seq = 0;
    const repo = createSchedulingRepository(db, {
      now: () => NOW,
      nextId: (p: string) => `${p}-verify-${++seq}`,
      userId: "user-a",
      accountId: "acct-a",
    });
    expect((await repo.getRun(anchored.id)).scheduledFor).toBe(
      "2026-06-21T09:00:00.000Z",
    );
    expect((await repo.getRun(manual.id)).scheduledFor).toBeNull();
    expect(await svc.getRunScheduledFor(ctxA,anchored.id)).toBe("2026-06-21T09:00:00.000Z");
    expect(await svc.getRunScheduledFor(ctxA,manual.id)).toBeNull();
    expect(await svc.getRun(ctxA,anchored.id)).not.toHaveProperty('scheduledFor');
    expect(await svc.getRun(ctxA,manual.id)).not.toHaveProperty('scheduledFor');
    await expect(svc.getRunScheduledFor(ctxA2,anchored.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.getRunScheduledFor(ctxB,anchored.id)).rejects.toBeInstanceOf(OwnershipError);
    // 沿用内部系统 sweep 的用户范围读取契约；指定账号的调用仍严格隔离。
    expect(await svc.getRunScheduledFor({...ctxNoAcct,source:'ingestion'},anchored.id)).toBe("2026-06-21T09:00:00.000Z");
    await expect(svc.getRunScheduledFor({...ctxB,accountId:undefined,source:'ingestion'},anchored.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.getRunScheduledFor(ctxA,'missing-run')).rejects.toBeInstanceOf(OwnershipError);
  });
});

it('T1199归档成员历史沿真实纯组守卫读取，跨组与跨用户仍拒绝',async()=>{
 const {db,client}=await createDb();try{
  const f=await realGroupFixture(db);
  const job=await f.owner.createJob(f.b,{name:'归档前任务',sourceKind:'self.metrics',schedule:'5 */2 * * *'});
  const run=await f.owner.createRun(f.b,{jobId:job.id});
  await f.accounts.archiveAccount(f.b,f.b.accountId!);
  const runs=await f.owner.listRunsByJob(f.groupOnly,job.id,{limit:50,offset:0});
  expect(runs.rows.map(row=>row.id)).toEqual([run.id]);
  expect(await f.owner.getRun(f.groupOnly,run.id)).toEqual(run);
  for(const bad of [{...f.groupOnly,groupId:'foreign'},{...f.groupOnly,userId:'foreign'}]){
   await expect(f.owner.listRunsByJob(bad,job.id,{limit:50,offset:0})).rejects.toBeInstanceOf(OwnershipError);
   await expect(f.owner.getRun(bad,run.id)).rejects.toBeInstanceOf(OwnershipError);
  }
 }finally{await client.close();}
});
