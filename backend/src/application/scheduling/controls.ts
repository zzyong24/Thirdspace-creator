import type {RequestContext,Transport} from "@creatoros/contract";
import {triggerScheduledJob,runJobNow,bootstrapDouyinCollectionJobs,type TriggerDeps} from "../../modules/ai-runtime";
/** 绑定初始化、立即运行与自动化共用同一触发协议。 */
export function createSchedulingControls(ports:{aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"createTask"|"getTask">;
schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"getRunScheduledFor"|"getJob"|"createRun"|"listRunsByJob"|"updateRun"|"listJobs"|"createJob">;
platformAccountService:Pick<import("../../modules/platform-account").PlatformAccountService,"getAccount">;
dispatchScheduledCollection:ReturnType<typeof import("./collection-execution").createCollectionExecution>["dispatchScheduledCollection"];
deps:{now:()=>string};
ensureDailyRun:ReturnType<typeof import("../../modules/scheduling").createDailyTopicRunIntentService>["ensureRunForTask"];
ensureCollectionRun:ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["ensureRunForTask"];
ensureCanonicalRubricForAccount:(accountId:string)=>Promise<void>;
migrateProfile:(ctx:RequestContext)=>Promise<void>;
scheduling:Transport;}){
const {aiService,schedulingService,platformAccountService,dispatchScheduledCollection,deps,ensureDailyRun,ensureCollectionRun,ensureCanonicalRubricForAccount,migrateProfile,scheduling}=ports;
  const triggerDeps: TriggerDeps = {
    ai: {
      createTask: async (c, body) => {
        const t = await aiService.createTask(c, body);
        return { id: t.id, status: t.status };
      },
    },
    runs: {
      createRun: async(c,input)=>{
        const job=await schedulingService.getJob(c,input.jobId);
        if(job.sourceKind==="topic.daily"){
          if(!input.aiTaskId)throw new Error("每日选题缺少任务绑定");
          return ensureDailyRun(c,input.aiTaskId);
        }
        if(["self.metrics","self.traffic","self.detail","comments","benchmark","favorites"].includes(job.sourceKind)){
          if(!input.aiTaskId)throw new Error("采集缺少任务绑定");
          return ensureCollectionRun(c,input.aiTaskId);
        }
        return schedulingService.createRun(c,input);
      },
      listRunsByJob: async (c, jobId, query) => {
        const { rows, total } = await schedulingService.listRunsByJob(
          c,
          jobId,
          query,
        );
        return {
          rows: rows.map((r) => ({
            id: r.id,
            status: r.status,
            startedAt: r.startedAt,
            aiTaskId: r.aiTaskId ?? null,
          })),
          total,
        };
      },
      updateRun: (c, runId, patch) =>
        schedulingService.updateRun(c, runId, patch),
    },
    dispatch: (ctx, task) => dispatchScheduledCollection(ctx, task),
    now: deps.now,
    getRunScheduledFor:(ctx,id)=>schedulingService.getRunScheduledFor(ctx,id),
    getTaskState:(ctx,id)=>aiService.getTask(ctx,id),
    // [T-201d] 隐藏号定时任务停跑 gate 的查号端口:复用 platformAccountService.getAccount
    //   (自带 ownership gate)取该号 status;号不存在/越权/查失败 → null(降级放行,不误停)。
    getAccountStatus: (c, accountId) =>
      platformAccountService
        .getAccount(c, accountId)
        .then((a) => a?.status ?? null)
        .catch(() => null),
  };

  // [T-189a] 绑定抖音成功回调实体(loginDouyin 成功后 fire-and-forget 调):幂等建三个每天定时采集
  //   job(self.metrics / self.detail / comments)+ 按序初始化触发一次拉全量(triggerScheduledJob
  //   经 triggerDeps → dispatch 挂 gate-F5 串行链)。用**请求 ctx**(带当前号 accountId,init 采集
  //   走该号 authDir);整体经 void 包裹不阻塞绑定返回。schedulingService/triggerDeps 均已在上方装配。
  const bootstrapDouyinOnBind = async (ctx: RequestContext) => {
    // [T-201a2] 登录态锚点对齐:新绑号 scan 时 ctx.accountId=null(号是 scan 后 ensureAccount 才建)→
    //   loginDouyin 的 `login({accountId: null})` 把登录态落 `.auth/douyin/_default`;而账号是真 id →
    //   设置/自动化按号探针 statusDouyin(带 x-account-id)读 `.auth/douyin/<id>` 找不到登录 → 误报
    //   「重新扫码」;初始采集按号也读 `<id>`(空)→ 采不到。**在触发采集前**(此刻 `<id>` 目录尚未被
    //   采集建成空壳)把 `_default` 登录态迁到 `<id>` 目录 → 登录态与不可变 id 锚点一致(单号现实;
    //   多号各自扫码 = T-136 §D)。同步 renameSync(同目录基址、原子);best-effort,失败不阻断建 job/采集。
    await migrateProfile(ctx);
    // [T-332 S2] 新号绑定即补种该号的默认变现加权 rubric(rubrics 是 per-account 域,
    //   NOT NULL;不种则该号校准/编导评分无默认口径,要等下次启动)。幂等
    //   (onConflictDoNothing);fire-and-forget,失败不阻断绑定。
    //   注:ensureCanonicalRubricForAccount 在本工厂靠后定义 —— 绑定回调只在构造完成后
    //   触发,无 TDZ 风险(与 calibrationService lazy thunk 同款模式)。
    if (ctx.accountId) {
      void ensureCanonicalRubricForAccount(ctx.accountId).catch((err) =>
        console.warn("[seed] 绑定补种默认 rubric 失败(不阻断绑定):", err),
      );
    }
    void bootstrapDouyinCollectionJobs(ctx, {
      listJobsBySourceKind: async (c, sourceKind) => {
        const { rows } = await schedulingService.listJobs(c, {
          sourceKind,
          limit: 1,
          offset: 0,
        });
        // [T-200] 带既有 job 属主号:复用既有 job 时把号带给 trigger(触发采集 ctx 由此派生)。
        return rows.map((r) => ({ id: r.id, accountId: r.accountId ?? null,enabled:r.enabled,target:r.target??{} }));
      },
      createJob: async (c, input) => {
        const job = await schedulingService.createJob(c, {
          name: input.name,
          prompt: input.prompt,
          sourceKind: input.sourceKind,
          schedule: input.schedule,
          target: input.target,
          // [T-359] 分层启用透传:默认关的模板建即 disabled(缺省 undefined = service 默认 true)。
          enabled: input.enabled,
          systemManaged: input.sourceKind === "intelligence.sync",
        });
        return { id: job.id };
      },
      // 初始化触发复用 triggerScheduledJob(与 cron 到点 / 「立即运行」同一幂等双闸 + 触发点)。
      //   [T-433 S1] 透传 options(绑号 self.detail 带 skipHeavyBackfill,重活延后次日)。
      trigger: async (c, job, options) => {
        await triggerScheduledJob(c, job, triggerDeps, options);
      },
      // [T-332 S2] claimOrphans / hasOtherActiveDouyinAccount(T-200/T-331)接线已全链退役
      //   (SPEC §4.4):strict + NOT NULL 世界不存在无号存量,绑定 = 只建号绑定 job + 初始化
      //   触发,零 claim —— 绑第二个号不改动任何既有行归属(ISO-08)。
      // 空 target:采集器空 target 时自 ensureDouyinSource 兜底解析源(与手动建的 job 一致)。
      target: {},
    }).catch((err) =>
      console.error("[persistence-client] 绑定抖音 bootstrap 建 job/初始化失败:", err),
    );
  };

  // 「立即运行」(D5):wrap scheduling transport,拦 scheduledJobs.runNow(composition-only
  // op —— module transport 不认它,因触发后台动作要 dispatchScheduledCollection,在此 composition
  // 层才可见)。命中 → 用**请求 ctx**(真实 userId,手动触发归当前用户)查 job → triggerScheduledJob
  // (幂等双闸 + fire-and-forget)→ 返回 { jobRunId, aiTaskId, deduped }。其余 op 透传 module
  // transport(scheduling)。
  const schedulingWithRunNow: Transport = {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "scheduledJobs.runNow") {
        if (!ctx) throw new Error("AuthenticationError: runNow requires ctx");
        const { params } = (input ?? {}) as { params?: { jobId?: string } };
        const jobId = params?.jobId ?? "";
        const result = await runJobNow(ctx, jobId, {
          ...triggerDeps,
          job: {
            getJob: async (c, id) => {
              const j = await schedulingService.getJob(c, id);
              // [T-200] 带 job 属主号:触发采集 ctx.accountId 由此派生(与 cron/bind 三路统一)。
              return {
                id: j.id,
                enabled: j.enabled,
                sourceKind: j.sourceKind,
                target: j.target,
                accountId: j.accountId ?? null,
              };
            },
          },
        });
        // [T-201d] 归属号已隐藏(status 非 active)→ triggerScheduledJob 跳过不产 run,
        //   jobRunId 为空串。runNow response 契约要求 jobRunId 非空(id=min(1)),且此路是用户
        //   手动「立即运行」→ 诚实抛错告知(账号已隐藏,先恢复再运行),不假装产了 run。
        //   (与既有 getJob ownership 错误传播同款:runNow 本就可抛。)
        if (result.skippedReason) {
          throw new Error(
            `AccountHiddenError: ${result.skippedReason}。请先在账号管理恢复该抖音号后再运行。`,
          );
        }
        return {
          data: {
            jobRunId: result.jobRunId,
            aiTaskId: result.aiTaskId,
            deduped: result.deduped,
          },
          meta: { requestId: ctx.requestId },
        };
      }
      return scheduling.request(endpoint, input, ctx);
    },
  };

return {triggerDeps,bootstrapDouyinOnBind,schedulingWithRunNow};
}
