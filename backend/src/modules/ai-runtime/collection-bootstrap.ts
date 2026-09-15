import type { RequestContext } from "@creatoros/contract";

// 绑定抖音 → 组合根 bootstrap(T-189a/T-595/T-598):扫码绑定成功后,为该账号幂等建立
// 自有作品分为指标、流量、评论、内容补全四个独立 job；先保证指标可见。
// self.detail 只以显式 __backfillOnly 的系统模板创建，旧未知任务不自动启用。
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
// 初始化按模板顺序触发 enabled job，并由 gate-F5 串行执行。自有作品先在内存中完成
// 公开/隐藏/未知判定；只有明确公开记录才进入项目、发布、指标及后续重活。

/** 一条默认采集 job 模板(sourceKind + 展示名 + 提示词 + 每天定时 cron)。 */
export interface CollectionJobDefault {
  // self.metrics | comments | topic.daily | intelligence.sync
  //   ([T-258] 与 contract scheduledJobSourceKind 6 值枚举对齐,单一真源即下方 DEFAULTS 列表)。
  readonly sourceKind: string;
  readonly name: string;
  readonly prompt: string;
  /** 每天定时 cron(5 段:minute hour dom month dow;node-cron / cronMatchesMinute 认)。 */
  readonly schedule: string;
  /** [T-359] 新绑号默认是否启用:有外部前置(登记收藏夹/对标源/配模型)或用户拍板后放的
   *  默认关(建 job 但 enabled=false,不初始化触发、不到点空跑);绑号即有意义的默认开。 */
  readonly enabledByDefault: boolean;
}

// 默认系统 job。对标主页、收藏夹已经归内容雷达来源管理，不再建立 benchmark/favorites
// 第二 producer；intelligence.sync 每两小时只检查该账号是否有到期来源。
// 四类自有作品任务按北京时间偶数小时 00/15/30/45 分执行；每日选题保留账号偏移。
// cron 仅决定入队时刻，同账号执行仍受资源队列和既有优先级保护。
export const DAILY_COLLECTION_JOB_DEFAULTS: readonly CollectionJobDefault[] = [
  {
    sourceKind: "self.metrics",
    name: "作品数据同步",
    prompt: "增量同步已发布作品与表现数据",
    schedule: "0 */2 * * *",
    enabledByDefault: true, // [T-359] 绑号即有意义(自己作品)
  },
  {sourceKind:"self.traffic",name:"作品流量来源同步",prompt:"增量同步作品流量来源",schedule:"15 */2 * * *",enabledByDefault:true},
  {sourceKind:"comments",name:"作品评论同步",prompt:"增量同步作品评论",schedule:"30 */2 * * *",enabledByDefault:true},
  {sourceKind:"self.detail",name:"作品内容补全",prompt:"后台补全视频内容与封面",schedule:"45 */2 * * *",enabledByDefault:true},
  // [T-235a] 每天自动出题:多依据合并(定位+评论信号+知识库+热点 brief)→ topic.generate 同模板
  //   出题 → T-212d 护栏排序(探索位防茧房)→ 候选落 pool(防灌库 ≤N/天,默认 5)。错峰 9:40
  //   (排 benchmark 9:30 后:当天新拆解的对标爆款已入库,可作出题引用)。未配文本模型 → 诚实
  //   跳过(itemsNew=0 + 注明「未配文本模型」,不空转不编)。纯 AI + 库内数据 + web 检索,不碰
  //   douyinGateway(与采集类 job 无限流冲突;gate-F5 串行闸仍统一排队)。
  {
    sourceKind: "topic.daily",
    name: "每日自动生成选题",
    prompt: "每天结合我的定位、评论信号、知识库和当下热点,自动出一批选题进选题池",
    schedule: "40 9 * * *",
    enabledByDefault: false, // [T-359] 前置=配文本模型(+定位),新号先跑通自己数据
  },
  {
    sourceKind: "intelligence.sync",
    name: "内容雷达自动同步",
    prompt: "检查内容雷达中已到期的来源并同步",
    schedule: "0 */2 * * *",
    // 来源自身的 monitorEnabled/syncPolicy 决定是否采集；账号级聚合作业无需用户二次开启。
    enabledByDefault: true,
  },
];

// [T-433 S3] 跨账号错峰窗口(分钟):per-account 偏移打散范围。基准 9:00–9:50 + 偏移 [0,180) →
//   实际起跑落 9:00–12:49 早间窗口(不越天,不排夜里)。窗口越大跨号碰撞越少(生日界 √180≈13 号
//   才可能同分钟);采集本已 gate-F5 串行 + gateway 限流兜底,偏移只为打散「同刻爆发」这一峰值。
export const STAGGER_SPREAD_MINUTES = 180;

/**
 * [T-433 S3] 账号级确定性错峰偏移(分钟,[0, STAGGER_SPREAD_MINUTES))。
 * FNV-1a 32-bit 哈希(纯函数、无随机):同号每次同偏移(幂等,重启/重绑 schedule 不漂),
 * 跨号均匀打散。无号(不该发生)→ 偏移 0,退回基准时刻(不错峰但不报错)。
 */
export function deterministicAccountOffsetMinutes(
  accountId: string | null | undefined,
): number {
  if (!accountId) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    h ^= accountId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % STAGGER_SPREAD_MINUTES;
}

/**
 * [T-433 S3] 把「每天定时」基准 cron(`M H * * *`)按该账号确定性偏移后移,跨账号错峰。
 * 同一 accountId 对所有模板叠加同一偏移 → 账号内 0/10/…/50 分的相对错开原样保留,整块一起后移。
 * 非标准 cron / 非整数分时 → 原样返回(防御,不改坏 schedule)。分钟溢出进位到小时;小时 % 24 兜底
 * (基准 9 + 偏移 <180 不会越天,取模仅防御)。
 */
export function staggeredSchedule(
  baseSchedule: string,
  accountId: string | null | undefined,
): string {
  const parts = baseSchedule.trim().split(/\s+/);
  if (parts.length !== 5) return baseSchedule;
  const baseMin = Number(parts[0]);
  const baseHour = Number(parts[1]);
  if (!Number.isInteger(baseMin) || !Number.isInteger(baseHour)) {
    return baseSchedule;
  }
  const total = baseHour * 60 + baseMin + deterministicAccountOffsetMinutes(accountId);
  const newHour = Math.floor(total / 60) % 24;
  const newMin = total % 60;
  return `${newMin} ${newHour} ${parts[2]} ${parts[3]} ${parts[4]}`;
}

export interface CollectionBootstrapDeps {
  /** 列该 sourceKind 现存 job(幂等判据:有则不重建)。host 绑 schedulingService.listJobs。
   *  [T-200] 返回 accountId:复用既有 job 时把其属主号带给 trigger(触发采集 ctx 由此派生)。 */
  listJobsBySourceKind: (
    ctx: RequestContext,
    sourceKind: string,
  ) => Promise<{ id: string; accountId?: string | null; enabled?:boolean;target?:Record<string,unknown> }[]>;
  /** 建一个采集 job。host 绑 schedulingService.createJob(内部从 ctx.accountId stamp 属主号)。 */
  createJob: (
    ctx: RequestContext,
    input: {
      name: string;
      prompt: string;
      sourceKind: string;
      schedule: string;
      target: Record<string, unknown>;
      /** [T-359] 新绑号分层启用:默认关的 job 建即 enabled=false(不到点空跑)。 */
      enabled?: boolean;
      systemManaged?: boolean;
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
    // [T-433 S1] 绑号轻触发:self.detail 从绑号初始化跑时传 skipHeavyBackfill=true,跳过尾部逐条重活。
    options?: { skipHeavyBackfill?: boolean },
  ) => Promise<void>;
  // [T-332 S2] claimOrphans / hasOtherActiveDouyinAccount(T-200/T-331)已全链退役(SPEC §4.4):
  //   清库世界没有孤儿 —— 所有 per-account 写在 service 层强制 stamp ctx.accountId(ISO-03),
  //   不存在「先落 NULL 再认领」的窗口;绑定第二个号不再改动任何既有行归属(ISO-08)。
  /** 各 job 的 target(默认 {} —— 采集器空 target 时自 ensureDouyinSource 兜底解析源)。 */
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
    /** [T-359] 模板默认启用层(bootstrap 初始化只触发默认开的;既有复用 job 视为已按用户意愿设置)。 */
    enabledByDefault: boolean;
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
  const created: string[] = [];
  const jobsInOrder: EnsureCollectionJobsResult["jobsInOrder"] = [];
  for (const tpl of DAILY_COLLECTION_JOB_DEFAULTS) {
    const target: Record<string, unknown> = tpl.sourceKind === "self.metrics"?{...(deps.target??{}),__skipHeavyBackfill:true,__operationsSync:true}:tpl.sourceKind==='self.detail'?{...(deps.target??{}),__backfillOnly:true,__skipMetricRefresh:true,__operationsSync:true}:{...(deps.target??{})};
    if (["self.metrics", "self.traffic", "comments", "self.detail"].includes(tpl.sourceKind)) {
      // 时区写进计划，避免跟随运行设备时区而在错误小时触发。
      target.scheduleTimezone = "Asia/Shanghai";
    }
    try {
      const existing = await deps.listJobsBySourceKind(ctx, tpl.sourceKind);
      if (existing.length > 0) {
        // 幂等:已有同 sourceKind job → 复用既有 id,不重建(重复绑定/重启不重复建)。
        // [T-332 S2] 带既有 job 的属主号(S1 后 scheduled_job.account_id NOT NULL,恒有号;
        //   listJobs 已按当前号 strict 过滤,复用的必是本号 job);?? 兜底仅为投影类型宽松保留。
        jobsInOrder.push({
          id: existing[0]!.id,
          sourceKind: tpl.sourceKind,
          target:existing[0]!.target??target,
          accountId: existing[0]!.accountId ?? ctx.accountId ?? null,
          enabledByDefault: existing[0]!.enabled??tpl.enabledByDefault,
        });
        continue;
      }
      const job = await deps.createJob(ctx, {
        name: tpl.name,
        prompt: tpl.prompt,
        sourceKind: tpl.sourceKind,
        // [T-433 S3] 跨账号错峰:基准 cron 叠加该号确定性偏移(同号 6 job 同偏移,保内部错开)。
        schedule: staggeredSchedule(tpl.schedule, ctx.accountId),
        target,
        // [T-359] 分层启用:默认关的建即 disabled(列表可见、开关旁提示前置,条件齐一键开)。
        enabled: tpl.enabledByDefault,
        systemManaged:["intelligence.sync","self.traffic","self.detail"].includes(tpl.sourceKind),
      });
      created.push(tpl.sourceKind);
      // [T-200] 新建 job 的属主号 = ctx.accountId(createJob 已 stamp);带给 trigger 派生采集 ctx。
      jobsInOrder.push({
        id: job.id,
        sourceKind: tpl.sourceKind,
        target,
        accountId: ctx.accountId ?? null,
        enabledByDefault: tpl.enabledByDefault,
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
 * 绑定抖音成功后：幂等建立系统采集 job，并只初始化触发默认需要立即执行的自有作品采集。
 *
 * 幂等:每个 sourceKind 有存量 job 就复用(不重建);触发经 triggerScheduledJob 当天幂等双闸。
 * 顺序:self.metrics → comments → topic.daily → intelligence.sync
 *   (await 串行 enqueue → gate-F5 串行链按序执行)。
 * best-effort:单个 job 建/触发失败不阻断其余(记日志继续),整体 fire-and-forget 不阻塞绑定返回。
 */
export async function bootstrapDouyinCollectionJobs(
  ctx: RequestContext,
  deps: CollectionBootstrapDeps,
): Promise<CollectionBootstrapResult> {
  // [T-332 S2] 原第 ⓪ 步「claim 存量无号数据」(T-200)及其 T-331 收敛门已全链退役(SPEC §4.4):
  //   strict 世界所有 per-account 行出生即带号(ISO-01/03),绑定 = 只建号绑定 job + 初始化触发,
  //   **零 claim** —— 绑第二个号不改动任何既有行归属(ISO-08 双号验收前提)。

  // ① 幂等建 job(顺序即模板顺序 self.metrics → comments → topic.daily → intelligence.sync)。
  //   [T-227] 实体抽到 ensureCollectionJobs(启动兜底与绑定 bootstrap 共用同一份 ensure,单一真源)。
  const { created, jobsInOrder } = await ensureCollectionJobs(ctx, deps);

  // ② 初始化拉全量：只触发默认启用的 self.metrics canonical collector；默认关的
  //   出题/评论前置未配，
  // 其余独立采集由持久调度按优先级执行，绑定回调不抢跑评论或内容补全。
  const triggered: string[] = [];
  for (const job of jobsInOrder) {
    // intelligence.sync 默认开启，但绑定动作不直接触发雷达全量扫描；启动恢复与随后
    // 15 分钟检查统一由 automation-driver 驱动。
    if (
      !job.enabledByDefault ||
      job.sourceKind !== "self.metrics"
    ) {
      continue;
    }
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
