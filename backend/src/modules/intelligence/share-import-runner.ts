import {isTaskDrainStopping,type TaskDrainControl} from "../execution";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import type {
  IntelligenceAdapterItem,
  IntelligenceService,
} from "./intelligence.service";

export interface DouyinShareImportFetcher {
  fetch(
    ctx: RequestContext,
    input: { shareText: string; capturedAt: string; signal?:AbortSignal },
  ): Promise<{
    shareUrl: string;
    resolvedUrl: string;
    item: IntelligenceAdapterItem;
    browserSessionRef: string;
  }>;
}

export interface RunDouyinShareImportDeps {
  tasks: PersistentTaskService;
  intelligence: Pick<IntelligenceService, "importDouyinSharedItem">;
  fetcher: DouyinShareImportFetcher;
  /**
   * 领域层已把子任务持久化后，host 可立即唤醒转写 worker；失败只影响实时启动，
   * 持久队列仍会在启动恢复/下一轮 drain 中续跑，不能反转已成功的父任务。
   */
  onTranscriptTasksQueued?: (
    ctx: RequestContext,
    taskIds: string[],
  ) => Promise<void> | void;
  now?: () => string;
  workerId?: () => string;
}

function taskFailure(error:unknown):{status:'failed'|'waiting_user'|'retry_wait';code:string;retryAfterMs?:number;message:string}{
  const e=error as {name?:string;code?:string;status?:number;remainMs?:number;cause?:{code?:string}};
  // SEMANTIC_BOUNDARY_ALLOW: 只根据稳定异常类型、网络错误码与 HTTP 状态判断读取协议故障，不判断内容意图。
  if(e?.code==='DOUYIN_SHARE_UNSAFE_URL')return {status:'failed',code:'UNSAFE_URL',message:'链接不符合抖音单条作品读取范围'};
  if(e?.name==='DouyinNotLoggedInError'||e?.code==='DOUYIN_FAVORITES_SESSION_EXPIRED'||e?.status===401||e?.status===403)return {status:'waiting_user',code:'LOGIN_REQUIRED',message:'请在当前账号完成抖音登录后继续原任务'};
  if(e?.name==='DouyinCaptchaError'||e?.code==='DOUYIN_FAVORITES_CAPTCHA')return {status:'waiting_user',code:'CAPTCHA',message:'请完成抖音验证码后继续原任务'};
  if(e?.name==='DouyinCooldownActiveError')return {status:'retry_wait',code:'SHARE_READ_COOLDOWN',retryAfterMs:typeof e.remainMs==='number'&&Number.isFinite(e.remainMs)&&e.remainMs>=0?e.remainMs:undefined,message:'抖音读取正在冷却，将自动重试原任务'};
  if(e?.code==='CHROMIUM_PROFILE_LOCKED')return {status:'retry_wait',code:'SHARE_PROFILE_BUSY',message:'当前登录档案正在使用，将稍后继续读取'};
  const networkCodes=['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'];
  if(e?.name==='TimeoutError'||e?.name==='DouyinShareNetworkError'||networkCodes.includes(e?.code??e?.cause?.code??'')||e?.status===408||e?.status===429||(typeof e?.status==='number'&&e.status>=500&&e.status<=599))return {status:'retry_wait',code:'SHARE_READ_TRANSIENT',message:'分享读取暂时失败，将自动重试原任务'};
  return {status:'failed',code:'IMPORT_FAILED',message:'分享读取或建档失败，请核对原链接与运行记录'};
}

export async function runDouyinShareImportTask(
  ctx: RequestContext,
  input: { taskId: string; existingClaim?: PersistentTaskClaim; signal?:AbortSignal },
  deps: RunDouyinShareImportDeps,
): Promise<void> {
  if(input.signal?.aborted)return;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId:
        deps.workerId?.() ??
        `intelligence-share-import:${input.taskId}:${Date.now().toString(36)}`,
      leaseSeconds: 180,
    }));
  if (!claim||input.signal?.aborted) return;
  if(claim.task.id!==input.taskId||claim.task.kind!=='share_import'||claim.task.ownerType!=='item_import'||claim.task.userId!==ctx.userId||claim.task.accountId!==ctx.accountId)throw new Error('分享导入任务归属不符');
  const control=new AbortController(),signal=input.signal?AbortSignal.any([input.signal,control.signal]):control.signal;
  let closed=false,leaseLost=false,resourceStopFailed=false,checking:Promise<void>|undefined,lastHeartbeat=0;
  const lease = {
    taskId: input.taskId,
    workerId: claim.lease.workerId,
    attempt: claim.lease.attempt,
  };
  const check=async()=>{
    const current=await deps.tasks.get(ctx,input.taskId);
    if(current.attempt!==claim.lease.attempt||current.leaseOwner!==claim.lease.workerId){leaseLost=true;control.abort();return;}
    if(current.status==='pause_requested'||current.status==='cancel_requested'){control.abort();return;}
    if(current.status!=='running'){closed=true;control.abort();return;}
    if(Date.now()-lastHeartbeat>=10000){await deps.tasks.heartbeat({...lease,leaseSeconds:180});lastHeartbeat=Date.now();}
  };
  const poll=()=>{if(closed||signal.aborted)return checking??Promise.resolve();if(checking)return checking;checking=check().catch(()=>{leaseLost=true;control.abort();}).finally(()=>{checking=undefined;});return checking;};
  const timer=setInterval(()=>{void poll();},250);
  let phase:'fetch'|'commit'='fetch';
  try {
    await poll();signal.throwIfAborted();
    const collectionId =
      typeof claim.payload.collectionId === "string"
        ? claim.payload.collectionId
        : null;
    const shareText =
      typeof claim.payload.shareInput === "string"
        ? claim.payload.shareInput.trim()
        : typeof claim.payload.shareText === "string"
          ? claim.payload.shareText.trim()
          : "";
    if (!shareText) throw Object.assign(new Error("分享文本不能为空"),{code:"DOUYIN_SHARE_UNSAFE_URL"});

    const fetched = await deps.fetcher.fetch(ctx, {
      shareText,
      signal,
      capturedAt: deps.now?.() ?? new Date().toISOString(),
    });
    await poll();signal.throwIfAborted();
    phase='commit';
    const result = await deps.intelligence.importDouyinSharedItem(ctx, {
      taskId: input.taskId,
      lease,
      collectionId,
      item: fetched.item,
      browserSessionRef: fetched.browserSessionRef,
      transcribeAfterImport: claim.payload.transcribeAfterImport === true,
    });
    closed=true;
    const transcriptTaskIds = Array.isArray(result.transcriptTaskIds)
      ? result.transcriptTaskIds.filter(
          (taskId): taskId is string =>
            typeof taskId === "string" && taskId.length > 0,
        )
      : [];
    if (transcriptTaskIds.length > 0 && deps.onTranscriptTasksQueued) {
      try {
        await deps.onTranscriptTasksQueued(ctx, transcriptTaskIds);
      } catch {
        // 已持久化的子任务是真值；live dispatch 失败留给启动恢复/队列 drain。
      }
    }
  } catch (error) {
    if((error as {code?:string})?.code==='SHARE_BROWSER_STOP_UNCONFIRMED'){resourceStopFailed=true;throw error;}
    await poll();
    if(signal.aborted||closed||leaseLost)return;
    const failure=phase==='fetch'?taskFailure(error):{status:'failed' as const,code:'IMPORT_COMMIT_FAILED',message:'分享建档未完成，请核对原任务'};
    await deps.tasks.finish({...lease,fenceToken:claim.lease.fenceToken,status:failure.status,errorCode:failure.code,errorMessage:failure.message,...('retryAfterMs' in failure?{retryAfterMs:failure.retryAfterMs}:{})});
    closed=true;
  } finally {
    clearInterval(timer);if(checking)await checking;
    // fetcher 必须响应 signal 并在返回前关闭自己持有的浏览器；这里不抢先 acknowledge。
    if(!leaseLost&&!closed&&!resourceStopFailed){
      const current=await deps.tasks.get(ctx,input.taskId);
      if(current.attempt===claim.lease.attempt&&current.leaseOwner===claim.lease.workerId&&(current.status==='pause_requested'||current.status==='cancel_requested'))await deps.tasks.acknowledgeControl(lease);
    }
  }

}

export async function drainDouyinShareImportQueue(
  deps: RunDouyinShareImportDeps,
  maxTasks = 20,
  control:TaskDrainControl = {},
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks && !isTaskDrainStopping(control); processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-share-import-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["share_import"],
      leaseSeconds: 180,
    });
    if (!claim || isTaskDrainStopping(control)) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined,
      requestId: `execution:${claim.task.id}`,
      source: "ingestion",
      ingestionRunId: claim.task.id,
    };
    await runDouyinShareImportTask(
      ctx,
      { taskId: claim.task.id, existingClaim: claim, signal:control.signal },
      deps,
    );
  }
  return processed;
}
