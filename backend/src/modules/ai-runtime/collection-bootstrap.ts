import type { RequestContext } from "@creatoros/contract";

// 绑定抖音 → 组合根 bootstrap(T-189a):扫码绑定成功后,为该账号**幂等**建三个「每天定时」采集
// job(self.metrics / self.detail / comments)+ **立即初始化跑一次**拉全量。
//
// 定位:纯编排逻辑(所有 IO 经注入端口),可直接单测。ingestion.service 在 loginDouyin 成功后经
//   注入的 onDouyinBound 回调触发本函数(backend 模块**不 import scheduling**,守 SPEC §22 模块边界)——
//   组合根(persistence-client)才把 schedulingService(listJobs/createJob)+ triggerScheduledJob
//   (triggerDeps)接进来。
//
// 幂等(真幂等,防重复绑定/重复启动重复建 job):每个 sourceKind 先 listJobsBySourceKind 查存量,
//   有则复用既有 job(不重建);无则 createJob。初始化触发经 triggerScheduledJob 的当天幂等双闸
//   (同 job 当天已有 in-flight run → 短路),故重复绑定同一天不重复采集。
//
// 首轮时序(接 T-190 遗留):初始化按 self.metrics → self.detail → comments **顺序** await 触发
//   —— 每次 trigger 内部 dispatch 把 runScheduledCollection 挂到组合根 gate-F5 采集串行链(并发=1),
//   故三源按 enqueue 次序串行执行。self.metrics 先建作品 publication(self.detail 的前置);self.detail
//   落 hidden_at/platform_status;之后 comments/重活据 T-190 判据跳隐藏。诚实残留:self.metrics 自带的
//   封面回填(重活)在本轮先于 self.detail 跑 → 首轮该重活仍可能碰隐藏作品(T-190 判据从第二轮起全面
//   生效),self.detail 必须晚于 self.metrics(依赖其建的 publication),无法在首轮完全消除。

/** 一条默认采集 job 模板(sourceKind + 展示名 + 提示词 + 每天定时 cron)。 */
export interface CollectionJobDefault {
  readonly sourceKind: string; // self.metrics | self.detail | comments
  readonly name: string;
  readonly prompt: string;
  /** 每天定时 cron(5 段:minute hour dom month dow;node-cron / cronMatchesMinute 认)。 */
  readonly schedule: string;
}

// 每天定时的默认采集 job(顺序即初始化触发顺序:self.metrics → self.detail → comments)。
//   时间**错峰**(9:00 / 9:10 / 9:20):① 每天早上一次;② 让每日 self.detail 早于 comments(接 T-190
//   隐藏判据在 self.detail 后可用);③ 三源不同时到点,减少并发抢占(采集本已 gate-F5 串行,错峰更稳)。
//   名称/提示词与前端 COLLECTION_TEMPLATES 对齐(frontend/src/features/automations/intent.ts),
//   便于用户在 /automations 里认出这三条自动建的 job。常量集中于此,便于调时间。
export const DAILY_COLLECTION_JOB_DEFAULTS: readonly CollectionJobDefault[] = [
  {
    sourceKind: "self.metrics",
    name: "每天抓我的新作品指标",
    prompt: "每天抓我主页的新作品和最新指标",
    schedule: "0 9 * * *",
  },
  {
    sourceKind: "self.detail",
    name: "每天拉我的作品明细数据",
    prompt: "每天拉取我作品的后台明细数据(完播、封面点击、留存)",
    schedule: "10 9 * * *",
  },
  {
    sourceKind: "comments",
    name: "每天抓我作品的最新评论",
    prompt: "每天抓我所有作品的最新评论",
    schedule: "20 9 * * *",
  },
  // [T-212a] 对标他号爆款采集:读该号 enabled 对标源 → 抓公开作品 → detectViral 筛爆款落库
  //   (供 T-212c 拆解转化进选题池)。无对标源时诚实空跑(非失败),登记对标源后即生效。错峰 9:30。
  {
    sourceKind: "benchmark",
    name: "每天抓对标号的爆款作品",
    prompt: "每天抓我登记的对标博主主页的公开爆款作品",
    schedule: "30 9 * * *",
  },
  // [T-235a] 每天自动出题:多依据合并(定位+评论信号+知识库+热点 brief)→ topic.generate 同模板
  //   出题 → T-212d 护栏排序(探索位防茧房)→ 候选落 pool(防灌库 ≤N/天,默认 5)。错峰 9:40
  //   (排 benchmark 9:30 后:当天新拆解的对标爆款已入库,可作出题引用)。未配文本模型 → 诚实
  //   跳过(itemsNew=0 + 注明「未配文本模型」,不空转不编)。纯 AI + 库内数据 + web 检索,不碰
  //   douyinGateway(与采集类 job 无限流冲突;gate-F5 串行闸仍统一排队)。
  {
    sourceKind: "topic.daily",
    name: "每天自动出题",
    prompt: "每天结合我的定位、评论信号、知识库和当下热点,自动出一批选题进选题池",
    schedule: "40 9 * * *",
  },
];

export interface CollectionBootstrapDeps {
  /** 列该 sourceKind 现存 job(幂等判据:有则不重建)。host 绑 schedulingService.listJobs。
   *  [T-200] 返回 accountId:复用既有 job 时把其属主号带给 trigger(触发采集 ctx 由此派生)。 */
  listJobsBySourceKind: (
    ctx: RequestContext,
    sourceKind: string,
  ) => Promise<{ id: string; accountId?: string | null }[]>;
  /** 建一个采集 job。host 绑 schedulingService.createJob(内部从 ctx.accountId stamp 属主号)。 */
  createJob: (
    ctx: RequestContext,
    input: {
      name: string;
      prompt: string;
      sourceKind: string;
      schedule: string;
      target: Record<string, unknown>;
    },
  ) => Promise<{ id: string }>;
  /** 触发一次采集(初始化拉全量)。host 绑 triggerScheduledJob(triggerDeps)。fire-and-forget:
   *  内部 dispatch 后即返(真实采集在 gate-F5 串行链后台跑)。
   *  [T-200] job 带 accountId:触发采集 runtime ctx.accountId 由它派生(串号根因修复)。 */
  trigger: (
    ctx: RequestContext,
    job: {
      id: string;
      sourceKind: string;
      target: Record<string, unknown>;
      accountId?: string | null;
    },
  ) => Promise<void>;
  /** [T-200] 认领存量 account_id IS NULL 的采集数据(projects/publications/metric_snapshots/
   *  assets + scheduled_job)给 ctx.accountId(单账号现实下安全)。host 绑各模块公开 claim 端口的
   *  组合。幂等:已归属的不动;ctx.accountId 缺省(未选号)→ no-op。返回各表认领行数(诊断用)。
   *  best-effort:失败不阻断建 job / 初始化触发。 */
  claimOrphans?: (ctx: RequestContext) => Promise<Record<string, number>>;
  /** 三个 job 的 target(默认 {} —— 采集器空 target 时自 ensureDouyinSource 兜底解析源)。 */
  target?: Record<string, unknown>;
}

export interface CollectionBootstrapResult {
  /** 本次**新建**的 job 的 sourceKind(既有复用的不列入)。 */
  created: string[];
  /** 本次**初始化触发**的 job 的 sourceKind(按触发顺序)。 */
  triggered: string[];
}

/** [T-227] 幂等 ensure 全部 DEFAULT_JOBS 需要的端口子集(只建 job,不触发采集)。 */
export type EnsureCollectionJobsDeps = Pick<
  CollectionBootstrapDeps,
  "listJobsBySourceKind" | "createJob" | "target"
>;

export interface EnsureCollectionJobsResult {
  /** 本次**新建**的 job 的 sourceKind(既有复用的不列入)。 */
  created: string[];
  /** 全部 ensure 后的 job(模板顺序;含复用的既有 job),供 bootstrap 初始化触发。 */
  jobsInOrder: {
    id: string;
    sourceKind: string;
    target: Record<string, unknown>;
    accountId?: string | null;
  }[];
}

/**
 * [T-227] 幂等 ensure 全部 DEFAULT_JOBS(有则复用、无则补建;**不触发**采集)。两处消费:
 *   ① bootstrapDouyinCollectionJobs(绑定抖音时 ensure + 初始化触发);
 *   ② 组合根启动兜底(persistence-client)—— 存量账号绑定早于新 job 模板(如 T-212 benchmark /
 *      T-235a topic.daily)时,bootstrap 只在绑定时跑过一次 → 缺新模板 job 且不会自动补齐。
 *      启动时对 active 账号跑本 ensure,存量号无需重绑即补齐缺失 job(只建不触发:新 job 等
 *      下一次到点跑,不在每次启动都拉一轮采集)。
 * 幂等:每个 sourceKind 先查存量,有则复用不重建;单源失败不阻断其余(best-effort,记日志)。
 */
export async function ensureCollectionJobs(
  ctx: RequestContext,
  deps: EnsureCollectionJobsDeps,
): Promise<EnsureCollectionJobsResult> {
  const target = deps.target ?? {};
  const created: string[] = [];
  const jobsInOrder: EnsureCollectionJobsResult["jobsInOrder"] = [];
  for (const tpl of DAILY_COLLECTION_JOB_DEFAULTS) {
    try {
      const existing = await deps.listJobsBySourceKind(ctx, tpl.sourceKind);
      if (existing.length > 0) {
        // 幂等:已有同 sourceKind job → 复用既有 id,不重建(重复绑定/重启不重复建)。
        // [T-200] 带既有 job 的属主号(claim 已把旧 null 号归号);若仍无号则退化用 ctx.accountId。
        jobsInOrder.push({
          id: existing[0]!.id,
          sourceKind: tpl.sourceKind,
          target,
          accountId: existing[0]!.accountId ?? ctx.accountId ?? null,
        });
        continue;
      }
      const job = await deps.createJob(ctx, {
        name: tpl.name,
        prompt: tpl.prompt,
        sourceKind: tpl.sourceKind,
        schedule: tpl.schedule,
        target,
      });
      created.push(tpl.sourceKind);
      // [T-200] 新建 job 的属主号 = ctx.accountId(createJob 已 stamp);带给 trigger 派生采集 ctx。
      jobsInOrder.push({
        id: job.id,
        sourceKind: tpl.sourceKind,
        target,
        accountId: ctx.accountId ?? null,
      });
    } catch (err) {
      // 单源建 job 失败不阻断其余(诚实记错;该源既无 job 也不触发)。
      console.error(
        `[collection-bootstrap] ensure job for "${tpl.sourceKind}" 失败:`,
        err,
      );
    }
  }
  return { created, jobsInOrder };
}

/**
 * 绑定抖音成功后:幂等建三个每天定时采集 job + 按序初始化触发一次(拉全量)。
 *
 * 幂等:每个 sourceKind 有存量 job 就复用(不重建);触发经 triggerScheduledJob 当天幂等双闸。
 * 顺序:self.metrics → self.detail → comments(await 串行 enqueue → gate-F5 串行链按序执行)。
 * best-effort:单个 job 建/触发失败不阻断其余(记日志继续),整体 fire-and-forget 不阻塞绑定返回。
 */
export async function bootstrapDouyinCollectionJobs(
  ctx: RequestContext,
  deps: CollectionBootstrapDeps,
): Promise<CollectionBootstrapResult> {
  // ⓪ [T-200] 认领存量无号采集数据给当前绑定号(单账号现实下安全)。best-effort、幂等:失败不阻断
  //   建 job / 触发;已归属的不动;未选号 → no-op。必须在建 job / 触发**之前**跑,让存量数据先归号
  //   (含把旧 scheduled_job 归号,使后续复用既有 job 的触发能读到正确 accountId)。
  if (deps.claimOrphans) {
    try {
      const claimed = await deps.claimOrphans(ctx);
      console.log(
        `[collection-bootstrap] 认领存量无号采集数据(account=${ctx.accountId ?? "∅"}):`,
        claimed,
      );
    } catch (err) {
      console.error("[collection-bootstrap] 认领存量数据失败(不阻断建 job/触发):", err);
    }
  }

  // ① 幂等建 job(顺序即模板顺序 self.metrics → self.detail → comments → benchmark → topic.daily)。
  //   [T-227] 实体抽到 ensureCollectionJobs(启动兜底与绑定 bootstrap 共用同一份 ensure,单一真源)。
  const { created, jobsInOrder } = await ensureCollectionJobs(ctx, deps);

  // ② 初始化拉全量:按序触发一次(self.metrics 先建 publication → self.detail 落可见性 → comments)。
  const triggered: string[] = [];
  for (const job of jobsInOrder) {
    try {
      await deps.trigger(ctx, job);
      triggered.push(job.sourceKind);
    } catch (err) {
      // 单源触发失败不阻断其余(下一次到点或手动「立即运行」仍可采;记错不静默)。
      console.error(
        `[collection-bootstrap] 初始化触发 "${job.sourceKind}" 失败:`,
        err,
      );
    }
  }

  return { created, triggered };
}
