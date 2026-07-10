import type { RequestContext } from "@creatoros/contract";
import type {
  MultimodalSpec,
  MultimodalProviderRegistry,
  GeneratedTranscript,
} from "@creatoros/ai-worker";
import { TranscribeConfigError } from "./multimodal/resolve";
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

// 抖音逐字稿采集 runner(T-030-D2,SPEC §5.2/§5.3)—— 又一个确定性 live dispatch runner,
// 但**取音频 + 云端 ASR + 绑作品**三步串成一条批处理。dispatch(persistence-client)见
// `transcribe.douyin` queued task → `void runTranscribe(...)`(仿 asset-generate-runner /
// scheduled-collection-runner 的 fire-and-forget 生命周期:markRunning → 逐 aweme 干活 → 终态)。
//
// 每个 awemeId 的流程:
//   (幂等,§4.3/F8)先试 ensureTranscriptArtifact —— 它幂等,已有 transcript artifact 直接
//      skip 不重复转写(为省流,已存在就跳过 fetch/ASR)。
//   → 否则 fetchVideoUrl(iesdouyin 无水印直链)→ streamAudio(ffmpeg 抽 mp3 bytes)
//   → resolveTranscribeSpec(用户配的 ASR,缺时[T-160] Tier 3 自动 fallback whisper-local 本地推理)
//   → transcribeAudio(spec + 音频 bytes → 文本)
//   → ensureTranscriptArtifact(awemeId, text, source:"transcribed") 绑到 imported 作品
//   → recordStep(kind:"transcribe")
//
// F7 失败分类(SPEC §5.3,别一条视频拖垮整批):
//   - [T-160] ASR 永远能 resolve(whisper-local 兜底)→ **不再**有「整任务停」分支。
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
  ai: TranscribeAiPort;
  /** 取无水印直链(iesdouyin)。host 绑 fetchDouyinVideoUrl(注入真 fetch);测试注 fake。 */
  fetchVideoUrl: (
    ctx: RequestContext,
    awemeId: string,
  ) => Promise<DouyinVideoUrl>;
  /** 从直链抽音频 bytes(ffmpeg)。host 绑 streamAudioFromVideo(注入真 spawn);测试注 fake。 */
  streamAudio: (
    ctx: RequestContext,
    playUrl: string,
  ) => Promise<Uint8Array>;
  /**
   * 解析 ASR model spec。[T-160] Tier 3 自动 whisper-local 兜底,所以 resolveTranscribeSpec
   * 不会抛 TranscribeConfigError —— 永远返回 MultimodalSpec(用户云端 ASR 或本地 Whisper 都行)。
   * host 绑 resolveTranscribeSpec。
   */
  resolveTranscribeSpec: (ctx: RequestContext) => Promise<MultimodalSpec>;
  /** 云端 ASR 转写(spec + 音频 bytes → 文本)。host 绑 ai-worker transcribeAudio;测试注 fake。 */
  transcribeAudio: (
    spec: MultimodalSpec,
    opts: { audioBytes: Uint8Array; language?: string },
    registry: MultimodalProviderRegistry,
  ) => Promise<GeneratedTranscript>;
  /** ASR provider 适配器注册表(host 装 { siliconflow/openai: createOpenaiAsrAdapter() })。 */
  registry: MultimodalProviderRegistry;
  /** 幂等**探测**(只读,不写):该 aweme 是否已有 transcript artifact。true → 跳过 fetch/ASR(省流)。
   *  与 ensureTranscriptArtifact 分开,是因为 ensure 缺省会「不存在则建」——不能拿它当空 transcript 探针
   *  (会写脏空稿)。host 绑 projectsRepo.findImportedByRef + artifactsService.listProjectArtifacts 的只读组合。 */
  hasTranscriptArtifact: (
    ctx: RequestContext,
    awemeId: string,
  ) => Promise<boolean>;
  /** 幂等绑作品(带真 transcript 写入):已有则返回 skipped(already-exists),否则建。host 绑 ensureTranscriptArtifact(注入其 5 端口)。 */
  ensureTranscriptArtifact: (
    ctx: RequestContext,
    input: EnsureTranscriptArtifactInput,
    // ports 由 host 在装配处闭包注入,runner 不感知——故此签名只暴露 (ctx, input)。
  ) => Promise<EnsureTranscriptArtifactResult>;
  /** 可选语言提示(默认 "zh";省略让端点自动检测)。 */
  language?: string;
}

export interface TranscribeTask {
  id: string;
  taskType: string; // transcribe.douyin
  /** { projectId?, awemeIds: string[] }(或单 awemeId,归一到 awemeIds)。 */
  inputData: Record<string, unknown>;
}

const ASR_NOT_CONFIGURED_HINT =
  "逐字稿转写未配置:请去「设置 → 模型配置」为 transcribe.audio 配 ASR provider/model/key(如硅基流动 FunAudioLLM/SenseVoiceSmall),再重试";

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
 *   F7:[T-160] ASR 永远能 resolve,无「整任务停」分支;取音频失败 → 标该 aweme 失败其余继续;
 *   末尾全失败→markFailed,有成功→markSucceeded(带失败计数)。
 *   fire-and-forget 兜底:catch 里 best-effort markFailed,绝不把 task 卡 running / 崩服务。
 */
export async function runTranscribe(
  ctx: RequestContext,
  task: TranscribeTask,
  deps: TranscribeRunnerDeps,
): Promise<void> {
  const awemeIds = readAwemeIds(task.inputData);
  let stepNo = 0;
  let ok = 0;
  const failures: Array<{ awemeId: string; reason: string }> = [];

  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while 逐条采集+转写

    if (awemeIds.length === 0) {
      throw new Error(
        "transcribe-runner: inputData.awemeIds(或 awemeId)为空,无可转写作品",
      );
    }

    for (const awemeId of awemeIds) {
      // 1) 幂等前置(只读探测):已有 transcript artifact 则 skip,**不重复 fetch/ASR**(省流)。
      //    用 hasTranscriptArtifact(只读)而非 ensureTranscriptArtifact —— 后者「不存在则建」,
      //    拿空 transcript 当探针会写脏空稿。真正的写入在下面 §3 用真 text 调 ensure(它自身也幂等)。
      if (await deps.hasTranscriptArtifact(ctx, awemeId)) {
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `作品 ${awemeId}:已有逐字稿,跳过(幂等)`,
          toolCalls: [],
        });
        ok += 1;
        continue;
      }

      // 2) 取音频 + 转写。取音频失败(DouyinAudioFetchError 等)→ 标该 aweme 失败、其余继续。
      //    [T-160] ASR 不再有「未配」分支:resolveTranscribeSpec Tier 3 自动用 whisper-local
      //    兜底,transcribe.audio capability 永远能解析出 MultimodalSpec —— TranscribeConfigError
      //    类保留只做向后兼容(永不触发),runner 也就不需要 catch 它去「整任务停」。
      try {
        const { playUrl } = await deps.fetchVideoUrl(ctx, awemeId);
        const audioBytes = await deps.streamAudio(ctx, playUrl);
        // [T-160] resolveTranscribeSpec 永远不抛 TranscribeConfigError(Tier 3 whisper-local 兜底)。
        const spec = await deps.resolveTranscribeSpec(ctx);
        const { text } = await deps.transcribeAudio(
          spec,
          { audioBytes, language: deps.language ?? "zh" },
          deps.registry,
        );
        if (!text || !text.trim()) {
          throw new Error("ASR 返回空逐字稿");
        }
        // 3) 绑作品(此刻带真 transcript;若并发下已被别处写入,ensure 幂等返回 already-exists 亦可)。
        const bound = await deps.ensureTranscriptArtifact(ctx, {
          awemeId,
          transcript: text,
          source: "transcribed",
        });
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
          text: `作品 ${awemeId}:转写完成(${text.length} 字)· ${boundNote}`,
          toolCalls: [],
        });
        ok += 1;
      } catch (err) {
        // [T-160] ASR 未配已兜底,无专门 catch 分支;取音频失败 / ASR 跑挂 / 空文本 → 单作品失败
        // 降级继续(整批不拖垮)。这里不再 instanceof TranscribeConfigError 抛(那条路已堵死)。
        // 其它(取音频 / 直链 / 去水印 / ASR provider HTTP / 空文本)→ 标该 aweme 失败,其余继续。
        const reason =
          err instanceof Error ? err.message : String(err ?? "unknown error");
        failures.push({ awemeId, reason });
        stepNo += 1;
        await deps.ai.recordStep(ctx, task.id, {
          stepNo,
          kind: "transcribe",
          text: `作品 ${awemeId}:取音频/转写失败,跳过 —— ${reason}`,
          toolCalls: [],
        });
        console.error(
          `[transcribe-runner] aweme ${awemeId} 失败(其余继续):`,
          err,
        );
      }
    }

    // 末尾终态:全失败 → markFailed;有成功 → markSucceeded(带失败计数写在最后一条 step)。
    if (ok === 0) {
      const detail = failures
        .map((f) => `${f.awemeId}: ${f.reason}`)
        .join("; ");
      await deps.ai.markFailed(
        ctx,
        task.id,
        `逐字稿采集全部失败(${failures.length}/${awemeIds.length}):${detail}`,
      );
      return;
    }
    stepNo += 1;
    await deps.ai.recordStep(ctx, task.id, {
      stepNo,
      kind: "transcribe",
      text: `逐字稿采集完成:成功 ${ok} 条,失败 ${failures.length} 条(共 ${awemeIds.length} 条)`,
      toolCalls: [],
    });
    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    // [T-160] ASR 已自动兜底,此处只 catch 真异常(markRunning 失败 / 空 awemeIds / 真 bug);
    // ASR_NOT_CONFIGURED_HINT 已死代码,保留只是给真出现 TranscribeConfigError 时的兜底消息。
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
