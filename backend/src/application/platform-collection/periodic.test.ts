import { describe, expect, it, vi } from "vitest";
import type { CollectionRunResource, RequestContext } from "@creatoros/contract";
import { createPeriodicPlatformCollection } from "./periodic";

const ctx: RequestContext = { userId: "user-a", requestId: "periodic", source: "ingestion" };
const time = "2026-09-30T12:00:00.000Z";
function run(accountId: string, status: CollectionRunResource["status"], startedAt = time): CollectionRunResource {
  return { attemptId: `run-${accountId}`, accountId, capability: "workCatalog", status,
    generation: 1, committedPages: 0, completeCatalogGeneration: null,
    reasonCode: null, startedAt, updatedAt: startedAt };
}

describe("小红书与快手定期采集", () => {
  it("只调度活跃的两平台账号，每号独立写入并恢复作品目录", async () => {
    const accounts = [
      { id: "xhs", platform: "xiaohongshu", status: "active" },
      { id: "ks", platform: "kuaishou", status: "active" },
      { id: "dy", platform: "douyin", status: "active" },
      { id: "old", platform: "xiaohongshu", status: "archived" },
    ];
    const start = vi.fn(async (scope: RequestContext, input: { accountId: string }) => run(input.accountId, "queued"));
    const resume = vi.fn();
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: accounts }), latestRun: async () => null,
      start, resume, onError: vi.fn(), now: () => time,
    });
    await tick(ctx);
    expect(start.mock.calls.map(([scope, input]) => [scope.accountId, input.accountId])).toEqual([["xhs", "xhs"], ["ks", "ks"]]);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("重启后恢复排队任务，六小时内不重复采集，需重连账号暂停", async () => {
    const start = vi.fn(async (_scope: RequestContext, _input: { accountId: string; capability: "workCatalog"; clientRequestId: string }) => run("new", "queued"));
    const resume = vi.fn();
    const latest = new Map([
      ["queued", run("queued", "queued")],
      ["fresh", run("fresh", "complete")],
      ["auth", run("auth", "needsAuth", "2026-09-29T00:00:00.000Z")],
      ["stale", run("stale", "complete", "2026-09-29T00:00:00.000Z")],
    ]);
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: [...latest.keys()].map(id => ({ id, platform: "xiaohongshu", status: "active" })) }),
      latestRun: async (_scope, id) => latest.get(id) ?? null,
      start, resume, onError: vi.fn(), now: () => time,
    });
    await tick(ctx);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[1]).toMatchObject({ accountId: "stale", capability: "workCatalog" });
    expect(resume.mock.calls.map(([, item]) => item.accountId)).toEqual(["queued", "new"]);
  });

  it("一个账号失败不会阻断其他账号，并限制失败重试频率", async () => {
    const start = vi.fn(async (_scope: RequestContext, input: { accountId: string }) => {
      if (input.accountId === "bad") throw new Error("source changed");
      return run(input.accountId, "queued");
    });
    const onError = vi.fn();
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: ["bad", "good"].map(id => ({ id, platform: "kuaishou", status: "active" })) }),
      latestRun: async () => null, start, resume: vi.fn(), onError, now: () => time,
    });
    await tick(ctx);
    await tick(ctx);
    expect(start.mock.calls.map(([, input]) => input.accountId)).toEqual(["bad", "good", "good"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

it('T1101旧周期入口只恢复原目录/指标/快手概览，不再新建任务',async()=>{
 const start=vi.fn(async()=>run('new','queued')),resume=vi.fn();
 await createPeriodicPlatformCollection({recoveryOnly:true,listAccounts:async()=>({rows:[{id:'ks',platform:'kuaishou',status:'active'},{id:'xhs',platform:'xiaohongshu',status:'active'}]}),latestRun:async(_c,id,capability)=>({...run(id,'partial'),capability}),start,resume,onError:vi.fn(),now:()=>time})(ctx);
 expect(start).not.toHaveBeenCalled();expect(resume.mock.calls.map(([,r])=>r.capability)).toEqual(['workCatalog','workMetrics','accountOverview','workCatalog','workMetrics']);
});

it('T1110恢复入口只读微信原报表任务并解析当前成员scope，不产生第二周期',async()=>{
 const start=vi.fn(async()=>run('new','queued')),resume=vi.fn(),latestRun=vi.fn(async(_c:RequestContext,id:string,capability:CollectionRunResource['capability'])=>({...run(id,'partial'),capability}));
 const contextForAccount=vi.fn(async(c:RequestContext,a:{id:string})=>({...c,accountId:a.id,groupId:'group-'+a.id,membershipVersion:7}));
 await createPeriodicPlatformCollection({recoveryOnly:true,contextForAccount,listAccounts:async()=>({rows:[{id:'video',platform:'wechatVideo',status:'active'},{id:'official',platform:'wechatOfficial',status:'active'}]}),latestRun,start,resume,onError:vi.fn(),now:()=>time})(ctx);
 expect(start).not.toHaveBeenCalled();expect(resume.mock.calls.map(([c,r])=>[c.accountId,c.groupId,c.membershipVersion,r.capability,r.attemptId])).toEqual([['video','group-video',7,'nativeReports','run-video'],['official','group-official',7,'nativeReports','run-official']]);expect(latestRun).toHaveBeenCalledTimes(2);
});
it('T1110旧producer模式不会因微信平台枚举新增而创建workCatalog',async()=>{
 const start=vi.fn(async()=>run('new','queued')),latestRun=vi.fn(async()=>null);
 await createPeriodicPlatformCollection({listAccounts:async()=>({rows:[{id:'video',platform:'wechatVideo',status:'active'}]}),latestRun,start,resume:vi.fn(),onError:vi.fn(),now:()=>time})(ctx);expect(start).not.toHaveBeenCalled();expect(latestRun).not.toHaveBeenCalled();
});

it('T1110恢复扫描不会反复领取已真实TASK_TIMEOUT的微信原run，其余partial仍沿原ID恢复',async()=>{
 const start=vi.fn(async()=>run('new','queued')),resume=vi.fn();
 const rows=[{id:'expired',platform:'wechatVideo',status:'active'},{id:'partial',platform:'wechatOfficial',status:'active'}];
 const tick=createPeriodicPlatformCollection({recoveryOnly:true,listAccounts:async()=>({rows}),latestRun:async(_c,id,capability)=>({...run(id,'partial'),capability,reasonCode:id==='expired'?'TASK_TIMEOUT':'DOWNLOAD_INTERRUPTED'}),start,resume,onError:vi.fn(),now:()=>time});
 await tick(ctx);await tick(ctx);expect(start).not.toHaveBeenCalled();expect(resume.mock.calls.map(([,r])=>r.attemptId)).toEqual(['run-partial','run-partial']);
});
