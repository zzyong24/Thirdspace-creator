import {PRIVATE_COLLECTION_SOURCE_KINDS} from '../../modules/scheduling';
import type {RequestContext,Transport} from "@creatoros/contract";
import {ENDPOINTS} from '@creatoros/contract';
import {ConflictError,ValidationError} from '../../modules/publishing';
import {triggerScheduledJob,runJobNow,collectionJobDefaultsForPlatform,bootstrapDouyinCollectionJobs,type TriggerDeps} from "../../modules/ai-runtime";
/** 绑定初始化、立即运行与自动化共用同一触发协议。 */
export function createSchedulingControls(ports:{aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"createTask"|"getTask">;
schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"getRunScheduledFor"|"getJob"|"createRun"|"listRunsByJob"|"updateRun"|"listJobs"|"createJob">;
platformAccountService:Pick<import("../../modules/platform-account").PlatformAccountService,"getAccount">;
dispatchScheduledCollection:ReturnType<typeof import("./collection-execution").createCollectionExecution>["dispatchScheduledCollection"];
deps:{now:()=>string};
ensureDailyRun:ReturnType<typeof import("../../modules/scheduling").createDailyTopicRunIntentService>["ensureRunForTask"];
ensureCollectionRun:ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["ensureRunForTask"];
ensureDefaultRubric:(ctx:RequestContext)=>Promise<unknown>;
migrateProfile:(ctx:RequestContext)=>Promise<void>;
assertCommentPublications?:(ctx:RequestContext,ids:readonly string[])=>Promise<void>;
scheduling:Transport;}){
const {aiService,schedulingService,platformAccountService,dispatchScheduledCollection,deps,ensureDailyRun,ensureCollectionRun,ensureDefaultRubric,migrateProfile,scheduling}=ports;
  const triggerDeps: TriggerDeps = {
    ai: {
      createTask: async (c, body) => {
        const privateCollector=!!c.groupId&&!!c.accountId&&body.taskType.startsWith("scheduled.")&&PRIVATE_COLLECTION_SOURCE_KINDS.has(body.taskType.slice(10))&&typeof body.inputData?.jobId==="string";
        const t = await aiService.createTask(privateCollector?{...c,source:"ingestion"}:c, body,privateCollector?{scheduledCollectorJobId:body.inputData!.jobId as string}:undefined);
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
    if(!ctx.accountId)throw new ValidationError('绑定初始化缺少真实账号');
    const account=await platformAccountService.getAccount(ctx,ctx.accountId);
    const defaults=collectionJobDefaultsForPlatform(account.platform);
    if(!defaults.length)return;
    if(account.platform==='douyin')await migrateProfile(ctx);
    // 保留真实绑定成功后的best-effort默认初始化；完整ctx交同一backend服务核权限。
    if (ctx.accountId&&account.platform==='douyin') {
      void ensureDefaultRubric(ctx).catch((err) =>
        console.warn("[seed] 绑定补种默认 rubric 失败(不阻断绑定):", err),
      );
    }
    await bootstrapDouyinCollectionJobs(ctx, {
      defaults,
      listJobsBySourceKind: async (c, sourceKind) => {
        const privateCollector=PRIVATE_COLLECTION_SOURCE_KINDS.has(sourceKind);
        const scoped=privateCollector||!c.groupId?c:{...c,accountId:null,membershipVersion:undefined};
        const { rows } = await schedulingService.listJobs(scoped, {
          sourceKind,
          ...(privateCollector?{accountId:c.accountId}:{}),
          limit: 1,
          offset: 0,
        });
        // [T-200] 带既有 job 属主号:复用既有 job 时把号带给 trigger(触发采集 ctx 由此派生)。
        return rows.map((r) => ({ id: r.id, accountId: r.accountId ?? null,enabled:r.enabled,target:r.target??{} }));
      },
      createJob: async (c, input) => {
        const privateCollector=PRIVATE_COLLECTION_SOURCE_KINDS.has(input.sourceKind);
        const scoped={...c,source:"ingestion" as const,...(!privateCollector&&c.groupId?{accountId:null,membershipVersion:undefined}:{})};
        const job = await schedulingService.createJob(scoped, {
          name: input.name,
          prompt: input.prompt,
          sourceKind: input.sourceKind,
          schedule: input.schedule,
          target: input.target,
          // [T-359] 分层启用透传:默认关的模板建即 disabled(缺省 undefined = service 默认 true)。
          enabled: input.enabled,
          systemManaged: input.systemManaged===true||privateCollector||input.sourceKind === "intelligence.sync",
        },privateCollector&&c.groupId?{backgroundCollector:true}:undefined);
        return { id: job.id };
      },
      // 初始化触发复用 triggerScheduledJob(与 cron 到点 / 「立即运行」同一幂等双闸 + 触发点)。
      //   [T-433 S1] 透传 options(绑号 self.detail 带 skipHeavyBackfill,重活延后次日)。
      trigger: async (c, job, options) => {
        const actual=await schedulingService.getJob(c,job.id);
        await triggerScheduledJob(c,{...job,groupId:actual.groupId,groupVersion:actual.groupVersion,membershipVersion:actual.membershipVersion},triggerDeps,options);
      },
      // [T-332 S2] claimOrphans / hasOtherActiveDouyinAccount(T-200/T-331)接线已全链退役
      //   (SPEC §4.4):strict + NOT NULL 世界不存在无号存量,绑定 = 只建号绑定 job + 初始化
      //   触发,零 claim —— 绑第二个号不改动任何既有行归属(ISO-08)。
      // 空 target:采集器空 target 时自 ensureDouyinSource 兜底解析源(与手动建的 job 一致)。
      target: {},
    }).catch((err) =>
      console.error("[persistence-client] 平台绑定 bootstrap 建 job/初始化失败:", err),
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
        const { params,body } = (input ?? {}) as { params?: { jobId?: string };body?:unknown };
        const requested=ENDPOINTS.runScheduledJobNow.body.parse(body)?.publicationIds;
        const jobId = params?.jobId ?? "";
        let commentJob=false,expectedSelection:string[]|null=null;
        const selectionOf=(target:unknown):string[]|null=>{
          if(!target||typeof target!=='object'||Array.isArray(target))throw new ConflictError('无法确认已有运行的作品范围');
          const selection=(target as Record<string,unknown>).publicationIds;
          if(selection===undefined)return null;
          const parsed=ENDPOINTS.runScheduledJobNow.body.safeParse({publicationIds:selection});
          if(!parsed.success)throw new ConflictError('无法确认已有运行的作品范围');
          return [...parsed.data!.publicationIds!].sort();
        };
        const assertTaskSelection=async(taskId:string,jobRunId?:string)=>{
          if(!commentJob)return;
          const task=await aiService.getTask(ctx,taskId);
          const details={aiTaskId:taskId,...(jobRunId?{jobRunId}:{})};
          let actual:string[]|null;
          try{actual=selectionOf(task.inputData.target);}catch{throw new ConflictError('无法确认已有运行的作品范围，请先核对原任务',details);}
          if(task.inputData.jobId!==jobId||JSON.stringify(actual)!==JSON.stringify(expectedSelection))throw new ConflictError('已有运行的作品范围不同，请等待原任务完成后再运行',details);
        };
        const result = await runJobNow(ctx, jobId, {
          ...triggerDeps,
          ai:{createTask:async(c,taskInput)=>{
            const task=await triggerDeps.ai.createTask(c,taskInput);
            // createTask 自身也可能命中旧 queued/running task，必须在ensureRun/dispatch前核对持久范围。
            await assertTaskSelection(task.id);
            return task;
          }},
          job: {
            getJob: async (c, id) => {
              const j = await schedulingService.getJob(c, id);
              commentJob=j.sourceKind==='comments';
              if(requested&&!commentJob)throw new ValidationError('publicationIds 仅适用于 comments 作业');
              const target=requested?{...j.target,publicationIds:[...requested].sort()}:j.target;
              if(commentJob){
                expectedSelection=selectionOf(target);
                if(expectedSelection){
                  if(!ports.assertCommentPublications)throw new ValidationError('作品范围校验服务尚未接入');
                  await ports.assertCommentPublications(c,expectedSelection);
                }
              }
              // [T-200] 带 job 属主号:触发采集 ctx.accountId 由此派生(与 cron/bind 三路统一)。
              return {
                id: j.id,
                enabled: j.enabled,
                sourceKind: j.sourceKind,
                target,
                accountId: j.accountId ?? null,groupId:j.groupId,groupVersion:j.groupVersion,membershipVersion:j.membershipVersion,
              };
            },
          },
        });
        if(result.deduped)await assertTaskSelection(result.aiTaskId,result.jobRunId);
        // [T-201d] 归属号已隐藏(status 非 active)→ triggerScheduledJob 跳过不产 run,
        //   jobRunId 为空串。runNow response 契约要求 jobRunId 非空(id=min(1)),且此路是用户
        //   手动「立即运行」→ 诚实抛错告知(账号已隐藏,先恢复再运行),不假装产了 run。
        //   (与既有 getJob ownership 错误传播同款:runNow 本就可抛。)
        if (result.skippedReason) {
          throw new Error(
            `AccountHiddenError: ${result.skippedReason}。请先在账号管理恢复该平台账号后再运行。`,
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
