import type { RequestContext } from "@creatoros/contract";

// 绑定抖音 → 组合根 bootstrap(T-189a):扫码绑定成功后,为该账号**幂等**建**六个**「每天定时」采集
// job(self.metrics / self.detail / comments / benchmark / topic.daily / favorites,单一真源
// DAILY_COLLECTION_JOB_DEFAULTS)+ **立即初始化跑一次**拉全量。
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
  // self.metrics | self.detail | comments | benchmark | topic.daily | favorites
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

// 每天定时的默认采集 job(顺序即初始化触发顺序:self.metrics → self.detail → comments → benchmark
//   → topic.daily → favorites)。schedule 是**账号内基准**(9:00 / 9:10 / 9:20 / 9:30 / 9:40 / 9:50):
//   ① 每天早上一次;② 让每日 self.detail 早于 comments(接 T-190
//   隐藏判据在 self.detail 后可用);③ 账号内六源不同时到点,减少并发抢占(采集本已 gate-F5 串行,错峰更稳)。
//   [T-433 S3] **跨账号错峰**:建 job 时对该基准叠加 per-account 确定性偏移(staggeredSchedule),
//   同号 6 job 同偏移(保内部 10 分错开)、跨号打散到早间窗口,避免疯狂绑 N 号时所有号都压 9:00
//   同刻爆发(=用户所指「灾难」)。基准即偏移 0 的账号时刻。
//   名称/提示词与前端 COLLECTION_TEMPLATES 对齐(frontend/src/features/automations/intent.ts),
//   便于用户在 /automations 里认出这三条自动建的 job。常量集中于此,便于调时间。
export const DAILY_COLLECTION_JOB_DEFAULTS: readonly CollectionJobDefault[] = [
  {
    sourceKind: "self.metrics",
    name: "每天抓我的新作品指标",
    prompt: "每天抓我主页的新作品和最新指标",
    schedule: "0 9 * * *",
    enabledByDefault: true, // [T-359] 绑号即有意义(自己作品)
  },
  {
    sourceKind: "self.detail",
    name: "每天拉我的作品明细数据",
    prompt: "每天拉取我作品的后台明细数据(完播、封面点击、留存)",
    schedule: "10 9 * * *",
    enabledByDefault: true, // [T-359] 绑号即有意义(自己作品)
  },
  {
    sourceKind: "comments",
    name: "每天抓我作品的最新评论",
    prompt: "每天抓我所有作品的最新评论",
    schedule: "20 9 * * *",
    enabledByDefault: false, // [T-359] 用户拍板后放:有导入作品后手动开
  },
  // [T-212a] 对标他号爆款采集:读该号 enabled 对标源 → 抓公开作品 → detectViral 筛爆款落库
  //   (供 T-212c 拆解转化进选题池)。无对标源时诚实空跑(非失败),登记对标源后即生效。错峰 9:30。
  {
    sourceKind: "benchmark",
    name: "每天抓对标号的爆款作品",
    prompt: "每天抓我登记的对标博主主页的公开爆款作品",
    schedule: "30 9 * * *",
    enabledByDefault: false, // [T-359] 前置=信号源登记对标博主
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
    enabledByDefault: false, // [T-359] 前置=配文本模型(+定位),新号先跑通自己数据
  },
  // [T-235c] 指定收藏夹采集:读该号登记的指定抖音收藏夹(信号源→收藏夹)→ 按名匹配回填
  //   collects_id → 拉夹内视频落台账 → 限量(≤3/run)进候选池(source=favorites)。过
  //   douyinGateway 限流(采集类 job,页内 fetch 每页 acquire)。无登记夹时诚实空跑(非失败,
  //   message 引导去登记)。错峰 9:50(排 topic.daily 9:40 后,采集类互不同时到点)。
  {
    sourceKind: "favorites",
    name: "每天采我的指定收藏夹",
    prompt: "每天采集我登记的抖音指定收藏夹里的视频,作为跟拍选题候选",
    schedule: "50 9 * * *",
    enabledByDefault: false, // [T-359] 前置=信号源登记指定收藏夹
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
      /** [T-359] 新绑号分层启用:默认关的 job 建即 enabled=false(不到点空跑)。 */
      enabled?: boolean;
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
  const target = deps.target ?? {};
  const created: string[] = [];
  const jobsInOrder: EnsureCollectionJobsResult["jobsInOrder"] = [];
  for (const tpl of DAILY_COLLECTION_JOB_DEFAULTS) {
    try {
      const existing = await deps.listJobsBySourceKind(ctx, tpl.sourceKind);
      if (existing.length > 0) {
        // 幂等:已有同 sourceKind job → 复用既有 id,不重建(重复绑定/重启不重复建)。
        // [T-332 S2] 带既有 job 的属主号(S1 后 scheduled_job.account_id NOT NULL,恒有号;
        //   listJobs 已按当前号 strict 过滤,复用的必是本号 job);?? 兜底仅为投影类型宽松保留。
        jobsInOrder.push({
          id: existing[0]!.id,
          sourceKind: tpl.sourceKind,
          target,
          accountId: existing[0]!.accountId ?? ctx.accountId ?? null,
          enabledByDefault: tpl.enabledByDefault,
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
 * 绑定抖音成功后:幂等建**六个**每天定时采集 job + 按序初始化触发一次(拉全量)。
 *
 * 幂等:每个 sourceKind 有存量 job 就复用(不重建);触发经 triggerScheduledJob 当天幂等双闸。
 * 顺序:self.metrics → self.detail → comments → benchmark → topic.daily → favorites
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

  // ① 幂等建 job(顺序即模板顺序 self.metrics → self.detail → comments → benchmark → topic.daily
  //   → favorites)。
  //   [T-227] 实体抽到 ensureCollectionJobs(启动兜底与绑定 bootstrap 共用同一份 ensure,单一真源)。
  const { created, jobsInOrder } = await ensureCollectionJobs(ctx, deps);

  // ② 初始化拉全量:按序触发一次(self.metrics 先建 publication → self.detail 落可见性 → comments)。
  //   [T-359] 只触发**默认启用**的(自己作品指标/明细);默认关的(收藏夹/对标/出题/评论)前置未配,
  //   初始化触发=纯空跑噪音,跳过——用户配好前置打开开关后,到点/立即运行照常跑。
  const triggered: string[] = [];
  for (const job of jobsInOrder) {
    if (!job.enabledByDefault) continue;
    try {
      // [T-433 S1] 绑号轻触发:self.detail 初始化跑跳过尾部逐条重活(封面/逐字稿/重建),避免多账号
      //   疯狂绑号把重活堆进 gate-F5 超长串行队列;明细(作品列表/标题/明细)照常当刻出,重活留
      //   次日 daily self.detail(不带此标)到点补(现有增量幂等,不漏首次数据)。
      await deps.trigger(
        ctx,
        job,
        job.sourceKind === "self.detail"
          ? { skipHeavyBackfill: true }
          : undefined,
      );
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
