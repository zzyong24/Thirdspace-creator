import {isAsrExecutionControlError,throwIfAsrAborted} from "@creatoros/ai-worker";
import type { RequestContext } from "@creatoros/contract";
import type {
  MultimodalProviderRegistry,
  GeneratedTranscript,
} from "@creatoros/ai-worker";
import {
  TranscribeConfigError,
  type MultimodalSpec,
} from "./multimodal/resolve";
import {
  formatErrorDiagnostic,
  safeModelFailureMessage,
} from "./error-diagnostics";
import type {
  EnsureTranscriptArtifactInput,
  EnsureTranscriptArtifactResult,
} from "@creatoros/backend/modules/projects";

/** transcribe 端口 fetchVideoUrl 的返回契约(runner 只需无水印直链)。故意在 runner 本地定义、
 *  不 import 前端 ingestion 的 DouyinVideoUrl —— 保持「AI 逻辑不依赖前端设施」的包边界(T-163);
 *  结构与 ingestion 侧 DouyinVideoUrl 兼容,host 注入的真实现可直接赋值。 */
export interface DouyinVideoUrl {
  playUrl: string;
  coverUrl?: string;
}

/** [T-243] fetchVideoUrl 端口的扩展返回:视频(带直链)或图集(非视频作品,诚实跳过)。
 *  video 变体的 kind 可省略 —— 既有 host/fake 返回裸 { playUrl } 仍类型兼容(零回归)。
 *  与 ingestion 侧 DouyinVideoSource 结构兼容(runner 本地镜像,保持包边界,同上)。 */
export type DouyinVideoSource =
  | ({ kind?: "video" } & DouyinVideoUrl)
  | { kind: "image-album" };

/** [T-243] 图集占位逐字稿(写进 ensureTranscriptArtifact 现有幂等锚,防每轮重查;
 *  文本本身诚实标注非口播,不会被误当真逐字稿)。 */
export const IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER = "(图集作品,无口播音频)";

/** [T-243] 失败原因分类(观测覆盖率用;errorMessage/汇总 step 按类计数)。
 *  [T-230] 新增 cooldown:限流冷却类(DouyinCooldownActiveError)——批级延迟重试的选取依据。 */
export type TranscribeFailureCategory =
  | "parse-failed" // 直链解析失败(iesdouyin _ROUTER_DATA / detail aweme_detail)
  | "ffmpeg" // ffmpeg 抽音非 0 退出 / 无字节(已含单次重试后仍失败)
  | "captcha" // 登录态回落路径命中验证码
  | "cooldown" // [T-230] 撞限流冷却快速失败(通道 cooldown 中)——等冷却结束可重试
  | "other"; // 其余(ASR / 网络 / 未知)

const FAILURE_CATEGORY_LABELS: Record<TranscribeFailureCategory, string> = {
  "parse-failed": "解析失败",
  ffmpeg: "ffmpeg",
  captcha: "验证码",
  cooldown: "限流冷却",
  other: "其他",
};

/** [T-243] 按错误消息把单作品失败归类(纯函数,可单测)。与取流层的错误文案约定对齐:
 *  验证码 → captcha;streamAudioFromVideo → ffmpeg;parseDouyinVideoUrl / parseAwemeDetail /
 *  fetchDouyinVideoUrl(HTTP/请求失败也归解析取流类)→ parse-failed;其余 → other。
 *  [T-230] 冷却类优先判(gateway 的 DouyinCooldownActiveError 消息含「冷却中」/类名)。 */
export function classifyTranscribeFailure(
  reason: string,
): TranscribeFailureCategory {
  if (reason.includes("冷却中") || reason.includes("CooldownActive")) {
    return "cooldown";
  }
  if (reason.includes("验证码")) return "captcha";
  if (reason.includes("streamAudioFromVideo")) return "ffmpeg";
  if (
    reason.includes("parseDouyinVideoUrl") ||
    reason.includes("parseAwemeDetail") ||
    reason.includes("fetchDouyinVideoUrl")
  ) {
    return "parse-failed";
  }
  return "other";
}

/** [T-243] 失败分类计数拼汇总文案,如「解析失败 2 / ffmpeg 1」;空失败返回 ""。 */
function formatFailureBreakdown(
  failures: Array<{ category: TranscribeFailureCategory }>,
): string {
  if (failures.length === 0) return "";
  const counts = new Map<TranscribeFailureCategory, number>();
  for (const f of failures) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([cat, n]) => `${FAILURE_CATEGORY_LABELS[cat]} ${n}`)
    .join(" / ");
}

// 抖音逐字稿采集 runner(T-030-D2,SPEC §5.2/§5.3)—— 又一个确定性 live dispatch runner,
// 但**取音频 + 云端 ASR + 绑作品**三步串成一条批处理。dispatch(persistence-client)见
// `transcribe.douyin` queued task → `void runTranscribe(...)`(仿 asset-generate-runner /
// scheduled-collection-runner 的 fire-and-forget 生命周期:markRunning → 逐 aweme 干活 → 终态)。
//
// 每个 awemeId 的流程:
//   (幂等,§4.3/F8)先试 ensureTranscriptArtifact —— 它幂等,已有 transcript artifact 直接
//      skip 不重复转写(为省流,已存在就跳过 fetch/ASR)。
//   → 否则 fetchVideoUrl(iesdouyin 无水印直链)→ streamAudio(ffmpeg 抽 mp3 bytes)
//   → resolveTranscribeSpec(用户云端 ASR 优先；未配置则自动使用本地 Whisper)
//   → transcribeAudio(spec + 音频 bytes → 文本)
//   → ensureTranscriptArtifact(awemeId, text, source:"transcribed") 绑到 imported 作品
//   → recordStep(kind:"transcribe")
//
// F7 失败分类(SPEC §5.3,别一条视频拖垮整批):
//   - 旧 host 若仍抛 TranscribeConfigError → 整任务停止并给出兼容指引。
//   - 取音频失败(ffmpeg / 直链 / 去水印,DouyinAudioFetchError 等)→ **标该 aweme 失败、
//     recordStep 记因、其余 aweme 继续**。
//   - 末尾:全失败 → markFailed;有成功 → markSucceeded(带失败计数,写在最后一条 step)。
//
// 端口全注入(fetchVideoUrl/streamAudio/resolveTranscribeSpec/transcribeAudio+registry/
// ensureTranscriptArtifact/ai.*),故 runner 可确定性单测(fake IO,不碰真抖音/真 ffmpeg/真 ASR)。

/** runner 需要的 AI 生命周期窄端口(host 绑 aiService;测试注 fake)。不产候选,故无
 *  recordCandidate —— 只 markRunning / recordStep / markSucceeded / markFailed。 */
export interface TranscribeAiPort {
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
}

export interface TranscribeRunnerDeps {
  signal?: AbortSignal;
  ai: TranscribeAiPort;
  /** 取无水印直链。[T-243] host 绑 fetchDouyinVideoSource(iesdouyin 匿名 → 登录态 detail
   *  回落);返回可为图集(kind:"image-album",runner 诚实跳过)。既有 fake 返回裸
   *  { playUrl } 仍兼容(kind 可省略视作 video)。测试注 fake。 */
  fetchVideoUrl: (
    ctx: RequestContext,
    awemeId: string,
    signal?: AbortSignal,
  ) => Promise<DouyinVideoSource>;
  /** 从直链抽音频 bytes(ffmpeg)。host 绑 streamAudioFromVideo(注入真 spawn);测试注 fake。 */
  streamAudio: (
    ctx: RequestContext,
    playUrl: string,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  /**
   * 解析 ASR model spec。T-641 起云端配置优先、未配置回退本地 Whisper。host 绑
   * resolveTranscribeSpec；旧 host 抛 TranscribeConfigError 时仍由 runner 兼容收口。
   */
  resolveTranscribeSpec: (ctx: RequestContext) => Promise<MultimodalSpec>;
  /** 渠道按次凭据只能在音频完成本地校验后申请。旧 host 可省略；新 host 在这里把
   * per_request 占位 spec 换成仅本次调用可用的内存 spec。 */
  prepareTranscribeSpec?: (
    ctx: RequestContext,
    spec: MultimodalSpec,
    input: { audioBytes: Uint8Array; intentId: string },
  ) => Promise<MultimodalSpec>;
  /** 云端 ASR 转写(spec + 音频 bytes → 文本)。host 绑 ai-worker transcribeAudio;测试注 fake。 */
  transcribeAudio: (
    spec: MultimodalSpec,
    opts: { audioBytes: Uint8Array; language?: string; signal?: AbortSignal },
    registry: MultimodalProviderRegistry,
  ) => Promise<GeneratedTranscript & {
    /** T-768：实际成功的执行规格；host 统一回退 wrapper 填写，旧 host 可省略。 */
    effectiveSpec?: MultimodalSpec;
    executionMode?: "channel-managed" | "configured-cloud" | "whisper-local";
  }>;
  /** ASR provider 适配器注册表(host 装 { siliconflow/openai: createOpenaiAsrAdapter() })。 */
  registry: MultimodalProviderRegistry;
  /** 幂等**探测**(只读,不写):该 aweme 是否已有 transcript artifact。true → 跳过 fetch/ASR(省流)。
   *  与 ensureTranscriptArtifact 分开,是因为 ensure 缺省会「不存在则建」——不能拿它当空 transcript 探针
   *  (会写脏空稿)。host 绑 projectsRepo.findImportedByRef + artifactsService.listProjectArtifacts 的只读组合。 */
  hasTranscriptArtifact: (
    ctx: RequestContext,
    awemeId: string,
  ) => Promise<boolean>;
  /** 已有事实的派生稿恢复，禁止重新抓取或 ASR。 */
  restoreTranscriptArtifact?: (ctx: RequestContext, awemeId: string) => Promise<void>;
  /** 幂等绑作品(带真 transcript 写入):已有则返回 skipped(already-exists),否则建。host 绑 ensureTranscriptArtifact(注入其 5 端口)。 */
  ensureTranscriptArtifact: (
    ctx: RequestContext,
    input: EnsureTranscriptArtifactInput,
    // ports 由 host 在装配处闭包注入,runner 不感知——故此签名只暴露 (ctx, input)。
  ) => Promise<EnsureTranscriptArtifactResult>;
  /** 真逐字稿成功绑定后触发下游重建排队。失败只告警，不能反向污染已成功的转写。 */
  onTranscriptReady?: (
    ctx: RequestContext,
    input: { awemeId: string; projectId: string },
  ) => Promise<void>;
  /** 可选语言提示(默认 "zh";省略让端点自动检测)。 */
  language?: string;

  /** [T-357] 采集逐字稿后处理(ASR 文本落库前一遍):同音错字纠正 + 补标点 + 语义分段。
   *  host 绑 runTranscriptPostprocess(model-config capability 解析,绝不写死厂商);实现自身
   *  **绝不抛**(失败/越权/未配模型 → applied:false + 原文 + reason),runner 侧再套 try/catch
   *  双保险 —— 转写链绝不因后处理挂掉。缺省(旧 host / 单测)→ 不后处理,零回归。 */
  postprocessTranscript?: (
    ctx: RequestContext,
    input: { awemeId: string; transcript: string },
  ) => Promise<{ applied: boolean; transcript: string; reason?: string }>;

  // ── [T-230] 限流冷却批级延迟重试的可选端口(全部缺省 → 旧行为:冷却失败即终态,零回归)──
  /** 判一个异常是否是「限流冷却快速失败」(host 绑 `(e) => e instanceof DouyinCooldownActiveError`;
   *  runner 不 import 前端 ingestion 的错误类,保持包边界,同 scheduled-collection-runner 的
   *  isNotLoggedInError 先例)。缺省 → 退化按错误消息分类(classifyTranscribeFailure)。 */
  isCooldownError?: (err: unknown) => boolean;
  /** 查抖音通道当前冷却剩余毫秒(host 绑 douyinGateway.getChannelStatus 两通道取 max;
   *  0 = 无冷却)。缺省 → 不做延迟重试。 */
  getCooldownRemainMs?: () => number;
  /** 延迟重试等待上限(毫秒;默认 30min)。冷却剩余超过它 → 诚实不等(失败照旧终态,
   *  下轮幂等自动补——hasTranscriptArtifact 锚已保成功子集不重转)。host 可从
   *  env(CREATOROS_TRANSCRIBE_COOLDOWN_WAIT_MAX_MS)注入覆盖。 */
  maxCooldownWaitMs?: number;
  /** 注入 sleep(测试注 fake 不真等;缺省真 setTimeout)。 */
  sleep?: (ms: number) => Promise<void>;
}

export interface TranscribeTask {
  id: string;
  taskType: string; // transcribe.douyin
  /** { projectId?, awemeIds: string[] }(或单 awemeId,归一到 awemeIds)。 */
  inputData: Record<string, unknown>;
}

const ASR_NOT_CONFIGURED_HINT =
  "逐字稿转写未配置：请去「设置 → 模型配置 → 语音转文字」选择 ASR 供应商并填写模型名和 API Key（推荐小米 MiMo：mimo-v2.5-asr），保存后重试。";

/** 从 inputData 归一出 awemeIds(支持 { awemeIds: [...] } 或单 { awemeId: "..." })。 */
function readAwemeIds(inputData: Record<string, unknown>): string[] {
  const list = inputData.awemeIds;
  if (Array.isArray(list)) {
    return list.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  const single = inputData.awemeId;
  if (typeof single === "string" && single.length > 0) return [single];
  return [];
}

/**
 * Orchestrate one transcribe.douyin task end to end —— 确定性、逐 aweme 取音频 + ASR 转写 + 绑作品。
 *   markRunning → 逐 awemeId:(幂等)已有则 skip;否则 fetch 直链 → 抽音 → 解析 ASR → 转写 → 绑作品
 *   → recordStep(transcribe)。
 *   F7:旧配置错误整批立即停止；取音频或单条调用失败 → 标该 aweme 失败其余继续;
 *   末尾全失败→markFailed,有成功→markSucceeded(带失败计数)。
 *   fire-and-forget 兜底:catch 里 best-effort markFailed,绝不把 task 卡 running / 崩服务。
 */
export async function runTranscribe(
  ctx: RequestContext,
  task: TranscribeTask,
  deps: TranscribeRunnerDeps,
): Promise<void> {
  const signal=deps.signal;
  const checkStopped=()=>throwIfAsrAborted(signal);
  const awemeIds = readAwemeIds(task.inputData);
  let stepNo = 0;
  let ok = 0;
  let albums = 0; // [T-243] 图集诚实跳过计数(单列,不算失败、不算成功转写)
  const failures: Array<{
    awemeId: string;
    reason: string;
    category: TranscribeFailureCategory; // [T-243] 失败分类(观测覆盖率)
  }> = [];

  try {
    checkStopped();
    await deps.ai.markRunning(ctx, task.id); // honest status while 逐条采集+转写

    if (awemeIds.length === 0) {
      throw new Error(
        "transcribe-runner: inputData.awemeIds(或 awemeId)为空,无可转写作品",
      );
    }

    // [T-230] 单 aweme 全流程收敛成闭包:主循环与「冷却延迟重试」共用同一段逻辑(幂等探测/
    //   取流/抽音/ASR/绑作品/失败分类计数都只写一遍)。闭包直接读写外层计数器(stepNo/ok/
    //   albums/failures),重试成功即 ok+1、重试再失败即重新 push failures。
    const processOne = async (awemeId: string): Promise<void> => {
      checkStopped();
      let resolvedSpec: MultimodalSpec | null = null;
      // 1) 幂等前置(只读探测):已有 transcript artifact 则 skip,**不重复 fetch/ASR**(省流)。
      //    用 hasTranscriptArtifact(只读)而非 ensureTranscriptArtifact —— 后者「不存在则建」,
      //    拿空 transcript 当探针会写脏空稿。真正的写入在下面 §3 用真 text 调 ensure(它自身也幂等)。
      const hasTranscript = await deps.hasTranscriptArtifact(ctx, awemeId);
      checkStopped();
      if (hasTranscript) {
        try {
          await deps.restoreTranscriptArtifact?.(ctx, awemeId);
        } catch (error) {
          checkStopped();if(isAsrExecutionControlError(error))throw error;
          console.warn(`[transcribe-runner] 逐字稿已保存，派生稿恢复待重试 (awemeId=${awemeId})`);
        }
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `作品 ${awemeId}:已有逐字稿,跳过(幂等)`,
          toolCalls: [],
        });
        ok += 1;
        return;
      }

      // 2) 取音频 + 转写。取音频失败(DouyinAudioFetchError 等)→ 标该 aweme 失败、其余继续。
      //    ASR 未配置则立即抛到批级 catch，避免剩余作品重复取流和重复报错。
      try {
        const src = await deps.fetchVideoUrl(ctx, awemeId, signal);
        checkStopped();

        // [T-243] 图集作品(无口播音频)→ 诚实跳过:写占位锚(ensureTranscriptArtifact 现有
        // 幂等锚,hasTranscriptArtifact 下轮命中即 skip,防每轮重查);skipMasterScript 避免把
        // 占位文本灌进稿面「口播脚本」编辑器。计数单列 albums,不算失败、不重试。
        if (src.kind === "image-album") {
          albums += 1;
          const anchored = await deps.ensureTranscriptArtifact(ctx, {
            awemeId,
            transcript: IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER,
            source: "image-album",
            skipMasterScript: true,
          });
          stepNo += 1;
          const anchorNote =
            anchored.status === "skipped" &&
            anchored.reason === "no-imported-project"
              ? "未找到对应 imported 作品(无锚,下轮仍会探测)"
              : "已写占位锚(下轮幂等跳过)";
          await deps.ai.recordStep(ctx, task.id, {
            stepNo,
            kind: "transcribe",
            text: `作品 ${awemeId}:图集作品,无口播音频,诚实跳过 · ${anchorNote}`,
            toolCalls: [],
          });
          return;
        }

        // 先解析 ASR，再下载/抽取音频。正常路径会得到云端 spec 或本地 Whisper 回退；
        // 图集不需要 ASR，仍可在上面的分支诚实落锚。
        const baseSpec = await deps.resolveTranscribeSpec(ctx);
        resolvedSpec = baseSpec;
        checkStopped();

        // [T-243] ffmpeg 失败单次重试:直链可能瞬时失效(CDN 签名过期)→ 重取直链再试一次;
        // 再失败照旧单作品失败继续(抛给外层 catch 分类计数)。
        let audioBytes: Uint8Array;
        try {
          audioBytes = await deps.streamAudio(ctx, src.playUrl, signal);
        } catch (ffErr) {
          checkStopped();if(isAsrExecutionControlError(ffErr))throw ffErr;
          console.warn(
            `[transcribe-runner] aweme ${awemeId} 抽音失败,重取直链重试一次:`,
            ffErr instanceof Error ? ffErr.message : ffErr,
          );
          const retrySrc = await deps.fetchVideoUrl(ctx, awemeId, signal);
          checkStopped();
          if (retrySrc.kind === "image-album") throw ffErr; // 重取竟变图集(极罕见)→ 按原错处理
          audioBytes = await deps.streamAudio(ctx, retrySrc.playUrl, signal);
        }
        checkStopped();
        const spec = deps.prepareTranscribeSpec
          ? await deps.prepareTranscribeSpec(ctx, baseSpec, {
              audioBytes,
              intentId: `task:${task.id}:aweme:${awemeId}`,
            })
          : baseSpec;
        resolvedSpec = spec;
        checkStopped();
        const transcriptResult = await deps.transcribeAudio(
          spec,
          { audioBytes, language: deps.language ?? "zh", ...(signal?{signal}:{}) },
          deps.registry,
        );
        checkStopped();
        resolvedSpec = transcriptResult.effectiveSpec ?? spec;
        const { text } = transcriptResult;
        if (!text || !text.trim()) {
          throw new Error("ASR 返回空逐字稿");
        }
        // [T-357] 后处理(轻 AI 校正:同音错字+标点+语义分段)—— **落库前一遍,单一收口点**:
        // 所有走本 runner → ensureTranscriptArtifact 的采集转写路径(每日批量 transcribe.douyin、
        // T-374 单条手动 projects.transcribe 排的同类型任务)统一在此生效。实现自身诚实落原文
        // 不抛;这里再套 try/catch 双保险 —— 后处理任何异常都只带注记,绝不让该 aweme 失败。
        let finalText = text;
        let postNote = "";
        if (deps.postprocessTranscript) {
          try {
            const post = await deps.postprocessTranscript(ctx, {
              awemeId,
              transcript: text,
            });
            if (post.applied && post.transcript.trim()) {
              finalText = post.transcript;
              postNote = " · 后处理:纠错+断句完成";
            } else {
              postNote = ` · 后处理未执行:${post.reason ?? "未知原因"}`;
            }
          } catch (postErr) {
            checkStopped();if(isAsrExecutionControlError(postErr))throw postErr;
            postNote = ` · 后处理未执行:${
              postErr instanceof Error ? postErr.message : String(postErr)
            }`;
          }
        }
        // 3) 绑作品(此刻带真 transcript;若并发下已被别处写入,ensure 幂等返回 already-exists 亦可)。
        checkStopped();
        const bound = await deps.ensureTranscriptArtifact(ctx, {
          awemeId,
          transcript: finalText,
          source: "transcribed",
        });
        const boundProjectId =
          bound.status === "bound" ||
          (bound.status === "skipped" && bound.reason === "already-exists")
            ? bound.projectId
            : undefined;
        if (boundProjectId && deps.onTranscriptReady) {
          try {
            checkStopped();
            await deps.onTranscriptReady(ctx, {
              awemeId,
              projectId: boundProjectId,
            });
          } catch (enqueueErr) {
            checkStopped();if(isAsrExecutionControlError(enqueueErr))throw enqueueErr;
            // 此时逐字稿已经可靠落库。下游排队是可补偿动作，绝不能把本条转写倒判失败。
            console.warn(
              `[transcribe-runner] 作品 ${awemeId} 逐字稿已就绪，但重建排队失败（后续采集将补偿）:`,
              enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
            );
          }
        }
        stepNo += 1;
        const boundNote =
          bound.status === "bound"
            ? `绑定作品(${bound.projectId})`
            : bound.status === "skipped" && bound.reason === "no-imported-project"
              ? "已转写但未找到对应 imported 作品(未绑定)"
              : "已转写";
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `作品 ${awemeId}:转写完成(${finalText.length} 字)${postNote} · ${boundNote}`,
          toolCalls: [],
        });
        ok += 1;
      } catch (err) {
        checkStopped();if(isAsrExecutionControlError(err))throw err;
        if (
          err instanceof TranscribeConfigError ||
          (err instanceof Error && err.name === "TranscribeConfigError")
        ) {
          throw err;
        }
        // 取音频失败 / ASR 跑挂 / 空文本 → 单作品失败，降级继续(整批不拖垮)。
        // 其它(取音频 / 直链 / 去水印 / ASR provider HTTP / 空文本)→ 标该 aweme 失败,其余继续。
        const reason = safeModelFailureMessage(err, resolvedSpec);
        // [T-230] 冷却类优先用注入判别(instanceof,最可靠);缺省退化按消息分类。
        const category = deps.isCooldownError?.(err)
          ? "cooldown"
          : classifyTranscribeFailure(reason); // [T-243] 分类计数
        failures.push({ awemeId, reason, category });
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `作品 ${awemeId}:取音频/转写失败(${FAILURE_CATEGORY_LABELS[category]}),跳过 —— ${reason}`,
          toolCalls: [],
        });
        console.error(
          `[transcribe-runner] aweme=${awemeId} 失败(其余继续) ${formatErrorDiagnostic(
            err,
            {
              omitMessage:
                resolvedSpec?.displayModelKey === "channel-managed",
            },
          )}`,
        );
      }
    };

    // 主批次:逐 aweme 跑一遍。
    for (const awemeId of awemeIds) {
      await processOne(awemeId);
    }

    // [T-230] 冷却延迟重试(批级、上限一次):真机时序 = self.detail 重活先烧 iesdouyin 通道
    //   → transcribe 紧跟排队 → 通道 cooldown(剩余 > acquire 上限)→ 全批快速失败等明天。
    //   修:检测到冷却类失败 → 查 gateway 冷却剩余 → 在等待上限内 sleep 到冷却结束 → 只重跑
    //   冷却失败子集一次(幂等锚 hasTranscriptArtifact 保证已成功的不重转)。剩余超上限 →
    //   诚实不等(失败照旧终态,下轮任务幂等自动补),绝不无限等/不做调度框架。
    const cooldownFailedIds = failures
      .filter((f) => f.category === "cooldown")
      .map((f) => f.awemeId);
    if (cooldownFailedIds.length > 0 && deps.getCooldownRemainMs) {
      const remainMs = deps.getCooldownRemainMs();
      const capMs = deps.maxCooldownWaitMs ?? 30 * 60 * 1000;
      if (remainMs <= capMs) {
        // 从失败清单摘掉冷却子集(重试再失败会由 processOne 重新 push,计数不重复)。
        for (const id of cooldownFailedIds) {
          const idx = failures.findIndex(
            (f) => f.awemeId === id && f.category === "cooldown",
          );
          if (idx >= 0) failures.splice(idx, 1);
        }
        const waitMs = remainMs > 0 ? remainMs + 5000 : 0; // +5s buffer 让 cooldown 真到期
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `检测到 ${cooldownFailedIds.length} 条限流冷却失败,等待冷却结束(约 ${Math.ceil(
            waitMs / 1000,
          )}s)后重试该子集一次`,
          toolCalls: [],
        });
        const sleep =
          deps.sleep ??
          ((ms: number) => new Promise<void>((resolve,reject) => {
            const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('转写已取消','AbortError'));};
            const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
            signal?.addEventListener('abort',abort,{once:true});
            if(signal?.aborted)abort();
          }));
        checkStopped();
        if (waitMs > 0) await sleep(waitMs);
        checkStopped();
        for (const awemeId of cooldownFailedIds) {
          await processOne(awemeId);
        }
      } else {
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `检测到 ${cooldownFailedIds.length} 条限流冷却失败,但冷却剩余 ${Math.ceil(
            remainMs / 1000,
          )}s 超过等待上限 ${Math.ceil(capMs / 1000)}s,本轮不等待(失败子集下轮任务幂等自动补)`,
          toolCalls: [],
        });
      }
    }

    // 末尾终态:全失败(成功 0 且图集 0)→ markFailed;否则 markSucceeded(带分类计数)。
    // [T-243] 图集跳过是诚实处理结果(非失败):只有图集、零转写也算任务成功。
    const breakdown = formatFailureBreakdown(failures); // 如「解析失败 2 / ffmpeg 1」
    if (ok === 0 && albums === 0) {
      const detail = failures
        .map((f) => `${f.awemeId}: ${f.reason}`)
        .join("; ");
      await deps.ai.markFailed(
        ctx,
        task.id,
        `逐字稿采集全部失败(${failures.length}/${awemeIds.length};${breakdown}):${detail}`,
      );
      return;
    }
    stepNo += 1;
    const albumNote = albums > 0 ? `,图集跳过 ${albums} 条` : "";
    const breakdownNote = breakdown ? `(${breakdown})` : "";
    await deps.ai.recordStep(ctx, task.id, {
      stepNo,
      kind: "transcribe",
      text: `逐字稿采集完成:成功 ${ok} 条${albumNote},失败 ${failures.length} 条${breakdownNote}(共 ${awemeIds.length} 条)`,
      toolCalls: [],
    });
    checkStopped();
    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    checkStopped();if(isAsrExecutionControlError(err))throw err;
    // ASR 未配置与其它批级异常统一在此收口，确保任务绝不残留 running。
    const message =
      err instanceof TranscribeConfigError
        ? ASR_NOT_CONFIGURED_HINT
        : err instanceof Error
          ? err.message
          : String(err ?? "unknown error");
    try {
      await deps.ai.markFailed(ctx, task.id, message);
    } catch {
      /* task may already be terminal */
    }
    console.error(
      `[transcribe-runner] transcribe failed for task ${task.id}:`,
      err,
    );
  }
}
