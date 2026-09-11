import {ScheduledFlywheelSuspended} from "./scheduled-flywheel-suspension";
import type { RequestContext } from "@creatoros/contract";

// 调度采集 runner(T-007 D3,SPEC 2026-06-30 §3/§5/§6,已 re-gate PASS)。
//
// 定位:又一个 live dispatch runner —— 但**确定性、不调 LLM**。dispatch(persistence-client)
// 见 `scheduled.*` queued task → `void runScheduledCollection(...)`(仿 runAssetGenerate 的
// fire-and-forget 生命周期:markRunning → 跑 → 终态),区别是**不产候选、不过采纳门**:直接调
// 注入的 collector 抓真数据 → ingestion 落库 → 合成 step 写 ai_task_steps → task 终态 succeeded
// → 回填 job_run。**绝不碰死链 drainQueue/runTask/ai-worker orchestrator(见 SPEC 顶部🔧)。**
//
// 铁律:
//   ① 不 import fetchDouyinMetrics/ingestMetrics/fetchDouyinComments —— 全靠 deps.collectors
//      注入(host 在 persistence-client 里接真采集+落库;测试注 fake collector,零成本冒烟,
//      不碰真抖音、不起 Chromium)。故本 runner 可纯逻辑单测。
//   ② 不调任何 LLM/generateObject/runStructuredNode —— 采集是确定性重放,数值由采集器从 DOM/
//      XHR JSON 程序化抽取(SPEC §2 铁律①),模型绝不"看"数字。
//   ③ fire-and-forget 兜底(gate finding 3):try/catch/finally —— job_run 终态(succeeded/
//      failed/needs_reconnect)+ finished_at + items 回填一律在 **finally** 落,任何异常路径
//      (采集失败 / 落库后 crash)job_run 都不悬挂在 running。

/** 一次确定性采集的产出(采集器从真 XHR/DOM 抽值后落库返回的新鲜度统计)。
 *  [T-235a] message(可选):采集器的诚实一句话说明(如「未配文本模型,跳过出题」/「今日已达
 *  防灌库上限」),runner 拼进合成 step 文本供运行详情展示。缺省 = 无补充说明(旧 collector 不破)。 */
export interface CollectResult {
  itemsNew: number;
  itemsUpdated: number;
  message?: string;
  incomplete?: boolean;
  continueCollection?: boolean;
}

/** runner 需要的 AI 生命周期窄端口(host 绑 aiService;测试注 fake)。不产候选,故无
 *  recordCandidate —— 只 markRunning / recordStep / markSucceeded / markFailed。 */
export interface ScheduledCollectionAiPort {
  deferCollection?(ctx:RequestContext,taskId:string):Promise<never>;
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  markWaitingUser?(ctx: RequestContext, taskId: string, errorMessage: string): Promise<void>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
}

/** runner 回填 job_run 的窄端口(host 绑 schedulingService.updateRun;测试注 fake)。 */
export interface ScheduledCollectionRunsPort {
  updateRun(
    ctx: RequestContext,
    runId: string,
    patch: {
      status?: string;
      itemsNew?: number;
      itemsUpdated?: number;
      error?: string | null;
      finishedAt?: string | null;
      // [T-152] 实时采集进度(jsonb)。best-effort + 节流写入,undefined = 不动,null = 清空。
      progress?: Record<string, unknown> | null;
    },
  ): Promise<unknown>;
}

// [T-152] 一次进度快照(采集器阶段推进时上报)。runner 补 updatedAt 后写 job_run.progress。
//   - stage:当前阶段可读键(login / fetch / cover_backfill / export / parse / ingest / …)。
//   - processed:该阶段已处理条数(累计拉了几条 / 翻到第几页 / 回填第几张封面)。
//   - total:该阶段总量;未知时 null(抖音翻页 has_more 才知有无下一页,total 常为 null)。
//   - message:人类可读一句话(可选)。
export interface CollectProgress {
  stage: string;
  processed: number;
  total?: number | null;
  message?: string;
}

// [T-152] 采集器上报进度的回调(runner 注入)。采集器在关键阶段调它;runner 负责节流 + 补
//   updatedAt + best-effort 写 job_run.progress(写失败绝不阻断采集)。
export type ReportProgress = (progress: CollectProgress) => void;

/** 一个源的确定性采集器:拿 target → 抓真数据 → ingestion 落库 → 返回新鲜度统计。
 *  host 为每个 sourceKind 装配一个(self.metrics=fetchDouyinMetrics+ingestMetrics /
 *  comments=fetchDouyinComments+ingestComments);测试注 fake(返回固定统计 / 抛异常)。
 *  [T-152] 第三参 report:采集器在关键阶段(登录校验 / 抓列表 / 封面回填 / 导出解析 / 逐作品)
 *    调它上报进度;runner 负责节流 + best-effort 写 job_run.progress。旧 collector 不调 report
 *    也不破(可选调用),进度只是没上报,采集照常。 */
export type Collector = (
  ctx: RequestContext,
  target: Record<string, unknown>,
  report: ReportProgress,
  execution?: {taskId:string},
) => Promise<CollectResult>;

export interface ScheduledCollectionDeps {
  ai: ScheduledCollectionAiPort;
  runs: ScheduledCollectionRunsPort;
  /** keyed by sourceKind(`self.metrics` | `comments`);host 装配真采集器,测试注 fake。 */
  collectors: Record<string, Collector>;
  /** 判一个异常是否是"抖音未登录"(→ needs_reconnect,非普通失败)。host 绑
   *  `(e) => e instanceof DouyinNotLoggedInError`,让 runner 不 import douyin-cdp(保持可测)。 */
  isNotLoggedInError: (err: unknown) => boolean;
  now: () => string;
  // [T-152] 进度写库节流最小间隔(ms)。同一 stage 内两次写库至少间隔这么久(防每条都写库拖垮
  //   采集);stage 变化 / 终态 flush 不受节流限制(阶段推进立即可见)。默认 1500ms。测试注 0 关节流。
  progressThrottleMs?: number;
}

export interface ScheduledCollectionTask {
  id: string;
  taskType: string; // scheduled.self.metrics | scheduled.comments
  inputData: Record<string, unknown>; // { jobId, jobRunId, target }
}

// 未登录/登录过期的人话引导(T-032b ②):明确指去「设置 → 账户」扫码登录,别留空/泛化。
// 「登录抖音」按钮在自动化 needs_reconnect 行也在(D4),两处入口都提;主动初次绑定入口在设置。
const NEEDS_RECONNECT_ERROR =
  "抖音登录态未连接或已过期,请去「设置 → 账户」扫码登录(或点本行「登录抖音」)后再采集。";

/** 把采集器抛的原始异常转成人话 run.error(T-032b ②:别把裸英文 stack/技术串塞给用户)。
 *  未登录已在 catch 分支单独走 NEEDS_RECONNECT_ERROR,这里只管其它失败:取音频/网络/解析等,
 *  尽量给可读原因 + 提示。识别不出的具体类型 → 保留原始 message(仍比空好),前缀点明"采集失败"。 */
function humanizeCollectError(err: unknown, label: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  // 网络/超时类:抓取时最常见的非登录失败。
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("net::") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("socket hang up") ||
    lower.includes("navigation")
  ) {
    return `采集${label}失败:网络或页面加载超时,请检查网络后重试(原始信息:${raw})。`;
  }
  // 取音频/转写失败(逐字稿链路 ffmpeg / 直链)。
  if (
    lower.includes("ffmpeg") ||
    lower.includes("audio") ||
    lower.includes("stream") ||
    lower.includes("transcribe")
  ) {
    return `采集${label}失败:取音频/转写环节出错(原始信息:${raw})。`;
  }
  // 导出非 xlsx(登录态过期时抖音返 JSON/HTML)——虽多半也是登录问题,但归类为普通失败时给引导。
  if (lower.includes("export") || lower.includes("xlsx") || lower.includes("pk")) {
    return `采集${label}失败:导出数据异常,可能是登录态过期,建议去「设置 → 账户」重新扫码登录后重试(原始信息:${raw})。`;
  }
  return `采集${label}失败:${raw || "未知错误"}。`;
}

/** taskType `scheduled.self.metrics` → sourceKind `self.metrics`。 */
function sourceKindOf(taskType: string): string {
  return taskType.startsWith("scheduled.")
    ? taskType.slice("scheduled.".length)
    : taskType;
}

const SOURCE_LABEL: Record<string, string> = {
  "self.metrics": "抖音主页作品",
  "self.traffic": "作品流量来源",
  comments: "抖音评论",
  "self.detail": "抖音作品明细数据",
  // [T-212a] 对标他号作品（benchmark sourceKind）。
  benchmark: "对标他号作品",
  // [T-235a] 每天自动出题（topic.daily sourceKind:多依据合并出题 → 护栏排序 → 候选落 pool）。
  "topic.daily": "每日选题",
  // [T-235c] 指定收藏夹采集（favorites sourceKind:登记夹按名匹配 → 拉夹内视频 → 限量进池）。
  favorites: "收藏夹",
  "intelligence.sync": "内容雷达到期来源",
};

/**
 * Orchestrate one scheduled collection task end to end —— 确定性、不调 LLM。
 *   markRunning → 调 collector 抓真数据+落库 → 合成 step 写 ai_task_steps → markSucceeded;
 *   任一异常坍缩到 catch:未登录 → job_run needs_reconnect(D4 接停跑/恢复,此处只正确置态);
 *   其它 → task markFailed + job_run failed。
 *   **finally(gate finding 3)**:job_run 终态 + finished_at + items 回填 —— 任何异常路径
 *   job_run 都不悬挂 running。
 */
export async function runScheduledCollection(
  ctx: RequestContext,
  task: ScheduledCollectionTask,
  deps: ScheduledCollectionDeps,
): Promise<void> {
  const jobRunId =
    typeof task.inputData.jobRunId === "string" ? task.inputData.jobRunId : "";
  const target =
    task.inputData.target && typeof task.inputData.target === "object"
      ? (task.inputData.target as Record<string, unknown>)
      : {};
  const sourceKind = sourceKindOf(task.taskType);
  const label = SOURCE_LABEL[sourceKind] ?? sourceKind;

  // finally 用它落 job_run 终态;三条路径各自赋值(默认 failed,防"忘记赋值"漏成功)。
  let suspended=false;
  let runStatus: "succeeded" | "failed" | "needs_reconnect" = "failed";
  let runError: string | null = null;
  let itemsNew = 0;
  let itemsUpdated = 0;

  // [T-152] 实时进度上报器(采集器阶段推进时调 report → 节流 + best-effort 写 job_run.progress)。
  //   节流:同一 stage 内两次写库至少间隔 throttleMs;stage 变化立即写(阶段推进要立即可见)。
  //   best-effort:写库失败(catch 吞)绝不阻断采集;fire-and-forget(不 await,不拖慢抓取)。
  //   幂等/不阻断:jobRunId 缺失(异常输入)→ report 直接 no-op。
  const throttleMs = deps.progressThrottleMs ?? 1500;
  let lastStage: string | null = null;
  let lastWriteAt = 0;
  const report: ReportProgress = (p) => {
    if (!jobRunId) return; // 无处可写(异常输入),静默丢弃,不影响采集
    const nowMs = Date.now();
    const stageChanged = p.stage !== lastStage;
    // 节流:同 stage 且距上次写库不足 throttleMs → 跳过(阶段变化 / 首次总是放行)。
    if (!stageChanged && throttleMs > 0 && nowMs - lastWriteAt < throttleMs) {
      return;
    }
    lastStage = p.stage;
    lastWriteAt = nowMs;
    const progress: Record<string, unknown> = {
      stage: p.stage,
      processed: p.processed,
      total: p.total ?? null,
      updatedAt: deps.now(),
    };
    if (p.message) progress.message = p.message;
    // fire-and-forget:进度写库不 await(不拖慢抓取);失败吞掉(采集主流程绝不受影响)。
    void Promise.resolve(
      deps.runs.updateRun(ctx, jobRunId, { progress }),
    ).catch((e) => {
      console.error(
        `[scheduled-collection-runner] 进度写库失败(不影响采集,run ${jobRunId}):`,
        e,
      );
    });
  };

  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while 采集

    const collector = deps.collectors[sourceKind];
    if (!collector) {
      throw new Error(
        `scheduled-collection-runner: no collector for sourceKind "${sourceKind}"`,
      );
    }

    // 确定性采集(collector 内:抓真 XHR/DOM 抽值 → ingestion 落库 → 返回新鲜度统计)。
    // 绝不调 LLM —— 数值程序化抽取(SPEC §2 铁律①)。
    // [T-152] 传入 report:采集器在关键阶段上报进度(runner 节流 + best-effort 写 job_run)。
    const result = await collector(ctx, target, report,{taskId:task.id});
    itemsNew = result.itemsNew;
    itemsUpdated = result.itemsUpdated;

    // 合成 step 写 ai_task_steps(经现有 recordStep;自动化运行详情复用窗口步骤日志渲染)。
    // [T-235a] collector 的诚实一句话说明(如「未配文本模型,跳过出题」)拼进 step 文本。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "collect",
      text:
        `采集${label} → 新增 ${itemsNew} 条,更新 ${itemsUpdated} 条` +
        (result.message ? `(${result.message})` : ""),
      toolCalls: [],
    });

    if (result.continueCollection && deps.ai.deferCollection) await deps.ai.deferCollection(ctx,task.id);
    if (result.continueCollection) throw new Error("流量补采尚未完成，请继续原任务");
    if (result.incomplete) throw new Error(result.message ?? "采集尚未完成，已保存本轮可确认的数据，请继续采集");
    await deps.ai.markSucceeded(ctx, task.id);
    runStatus = "succeeded";
    runError = null;
  } catch (err) {
    if(err instanceof ScheduledFlywheelSuspended){suspended=true;throw err;}
    if (deps.isNotLoggedInError(err)) {
      // 登录阻断保留原持久任务等待恢复；旧执行入口保留既有失败投影。
      runStatus = "needs_reconnect";
      runError = NEEDS_RECONNECT_ERROR;
      try {
        if(deps.ai.markWaitingUser)await deps.ai.markWaitingUser(ctx,task.id,NEEDS_RECONNECT_ERROR);
        else await deps.ai.markFailed(ctx, task.id, NEEDS_RECONNECT_ERROR);
      } catch {
        /* task may already be terminal */
      }
    } else {
      // 人话文案(T-032b ②):取音频/网络/导出等具体归类 + 保留原始信息,别塞裸 stack。
      const message = humanizeCollectError(err, label);
      runStatus = "failed";
      runError = message;
      try {
        await deps.ai.markFailed(ctx, task.id, message);
      } catch {
        /* task may already be terminal */
      }
    }
    console.error(
      `[scheduled-collection-runner] collect failed for task ${task.id} (${task.taskType}):`,
      err,
    );
  } finally {
    // gate finding 3:job_run 终态 + finished_at + items 回填一律在 finally 落,任何异常路径
    // job_run 都不悬挂 running。jobRunId 缺失(异常输入)→ 跳过回填(无处可写),但 task 已在
    // try/catch 里落终态。best-effort:回填失败不再抛(否则 fire-and-forget 崩服务)。
    if (jobRunId && !suspended) {
      try {
        await deps.runs.updateRun(ctx, jobRunId, {
          status: runStatus,
          itemsNew,
          itemsUpdated,
          error: runError,
          finishedAt: deps.now(),
          // [T-152] 终态清空进度(null):running 态的阶段/条数进度条让位给终态结果文案
          // (✅ 新增 N / ⚠️ 需重连 / ❌ 失败),避免残留一条 stale 的进行中进度。
          progress: null,
        });
      } catch (e) {
        console.error(
          `[scheduled-collection-runner] job_run 回填失败 (run ${jobRunId}):`,
          e,
        );
      }
    }
  }
}
