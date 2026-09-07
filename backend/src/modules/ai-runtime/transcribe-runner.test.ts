import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type {
  MultimodalSpec,
  MultimodalProviderRegistry,
  GeneratedTranscript,
} from "@creatoros/ai-worker";
import type {
  EnsureTranscriptArtifactInput,
  EnsureTranscriptArtifactResult,
} from "@creatoros/backend/modules/projects";
import { TranscribeConfigError } from "./multimodal/resolve";
import {
  runTranscribe,
  classifyTranscribeFailure,
  IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER,
  type TranscribeRunnerDeps,
  type DouyinVideoSource,
} from "./transcribe-runner";

// transcribe.douyin runner 单测(T-030-D2,SPEC §5.2/§5.3)。全 fake IO(fake fetchVideoUrl /
// streamAudio / transcribeAudio / ensureTranscriptArtifact),**不碰真抖音 / 真 ffmpeg / 真 ASR**。
// 覆盖:成功路径(markRunning→recordStep→markSucceeded,绑作品收到真 text);F7-a(ASR 未配→整
// 任务停 markFailed 不 markSucceeded);F7-b(一条 streamAudio 抛 → 该 aweme 失败其余成功,任务不整
// 体崩,markSucceeded 带失败计数);幂等(ensure 报 already-exists → 跳过 fetch/ASR,fetchVideoUrl 未被调)。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const SPEC: MultimodalSpec = {
  provider: "siliconflow",
  baseUrl: null,
  model: "FunAudioLLM/SenseVoiceSmall",
  token: "sk-fake",
  kind: "audio",
};

const FAKE_REGISTRY: MultimodalProviderRegistry = {}; // runner 不直接 index registry(交给注入的 transcribeAudio)

function makeDeps(opts: {
  awemeIds: string[];
  streamThrowsFor?: (awemeId: string) => Error | null;
  /** [T-243] streamThrowsFor 命中的 aweme 抛几次后恢复(默认 Infinity=次次抛,旧行为)。
   *  设 1 → 首抽抛、重试成功(覆盖 ffmpeg 单次重试路径)。 */
  streamFailTimes?: number;
  /** [T-243] 自定义 fetchVideoUrl 返回(图集 / kind 显式 video);缺省裸 { playUrl }(旧行为)。 */
  videoSourceFor?: (awemeId: string) => DouyinVideoSource;
  resolveThrows?: Error | null;
  transcribeResult?: GeneratedTranscript & {
    effectiveSpec?: MultimodalSpec;
    executionMode?: "channel-managed" | "configured-cloud" | "whisper-local";
  };
  /** 只读幂等探测:哪些 aweme 已有逐字稿(→ 跳过 fetch/ASR)。默认全 false。 */
  alreadyHas?: (awemeId: string) => boolean;
  /** 写入 ensure 时返回什么(默认 bound)。 */
  onWrite?: (
    input: EnsureTranscriptArtifactInput,
  ) => EnsureTranscriptArtifactResult;
}) {
  const markRunning = vi.fn(
    async (_c: RequestContext, _id: string) => undefined,
  );
  const recordStep = vi.fn(
    async (
      _c: RequestContext,
      _id: string,
      _input: {
        stepNo: number;
        kind: string;
        text: string;
        toolCalls: unknown[];
      },
    ) => undefined,
  );
  const markSucceeded = vi.fn(
    async (_c: RequestContext, _id: string) => undefined,
  );
  const markFailed = vi.fn(
    async (_c: RequestContext, _id: string, _err?: string) => undefined,
  );

  const fetchVideoUrl = vi.fn(
    async (
      _c: RequestContext,
      awemeId: string,
    ): Promise<DouyinVideoSource> =>
      opts.videoSourceFor?.(awemeId) ?? {
        playUrl: `https://v.example/${awemeId}?play=1`,
      },
  );
  const streamFailCounts = new Map<string, number>(); // [T-243] 每 aweme 已抛次数(重试预算)
  const streamAudio = vi.fn(async (_c: RequestContext, playUrl: string) => {
    const awemeId = playUrl.split("/").pop()!.split("?")[0]!;
    const boom = opts.streamThrowsFor?.(awemeId) ?? null;
    if (boom) {
      const budget = opts.streamFailTimes ?? Number.POSITIVE_INFINITY;
      const n = streamFailCounts.get(awemeId) ?? 0;
      if (n < budget) {
        streamFailCounts.set(awemeId, n + 1);
        throw boom;
      }
    }
    return new Uint8Array([1, 2, 3, 4]); // 固定 fake mp3 bytes
  });
  const resolveTranscribeSpec = vi.fn(async () => {
    if (opts.resolveThrows) throw opts.resolveThrows;
    return SPEC;
  });
  const transcribeAudio = vi.fn(
    async (
      _spec: MultimodalSpec,
      _o: { audioBytes: Uint8Array; language?: string },
      _r: MultimodalProviderRegistry,
    ): Promise<GeneratedTranscript & {
      effectiveSpec?: MultimodalSpec;
      executionMode?: "channel-managed" | "configured-cloud" | "whisper-local";
    }> => opts.transcribeResult ?? ({ text: "逐字稿X" }),
  );
  const prepareTranscribeSpec = vi.fn(
    async (
      _c: RequestContext,
      spec: MultimodalSpec,
      _input: { audioBytes: Uint8Array; intentId: string },
    ) => spec,
  );

  // 只读幂等探测 fake(默认全 false → 都要真转写)。
  const hasTranscriptArtifact = vi.fn(
    async (_c: RequestContext, awemeId: string) =>
      opts.alreadyHas?.(awemeId) ?? false,
  );

  // ensureTranscriptArtifact fake(仅带真 text 的写入调用会到这;探测已分到 hasTranscriptArtifact)。
  const ensureCalls: EnsureTranscriptArtifactInput[] = [];
  const ensureTranscriptArtifact = vi.fn(
    async (
      _c: RequestContext,
      input: EnsureTranscriptArtifactInput,
    ): Promise<EnsureTranscriptArtifactResult> => {
      ensureCalls.push(input);
      return (
        opts.onWrite?.(input) ?? {
          status: "bound",
          projectId: `proj-${input.awemeId}`,
          artifactId: `art-${input.awemeId}`,
          awemeId: input.awemeId,
        }
      );
    },
  );
  const onTranscriptReady = vi.fn(
    async (_c: RequestContext, _input: { awemeId: string; projectId: string }) =>
      undefined,
  );

  const deps: TranscribeRunnerDeps = {
    ai: { markRunning, recordStep, markSucceeded, markFailed },
    fetchVideoUrl,
    streamAudio,
    resolveTranscribeSpec,
    prepareTranscribeSpec,
    transcribeAudio,
    registry: FAKE_REGISTRY,
    hasTranscriptArtifact,
    ensureTranscriptArtifact,
    onTranscriptReady,
  };
  return {
    deps,
    spies: {
      markRunning,
      recordStep,
      markSucceeded,
      markFailed,
      fetchVideoUrl,
      streamAudio,
      resolveTranscribeSpec,
      prepareTranscribeSpec,
      transcribeAudio,
      hasTranscriptArtifact,
      ensureTranscriptArtifact,
      onTranscriptReady,
    },
    ensureCalls,
  };
}

describe("runTranscribe(transcribe.douyin, T-030-D2)", () => {
  it("成功路径:markRunning → 取音频 → ASR → 绑作品(收到真 text)→ recordStep → markSucceeded", async () => {
    const { deps, spies, ensureCalls } = makeDeps({
      awemeIds: ["7400000000000000001"],
    });
    await runTranscribe(
      ctx,
      {
        id: "task-1",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["7400000000000000001"] },
      },
      deps,
    );
    expect(spies.markRunning).toHaveBeenCalledTimes(1);
    expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1);
    expect(spies.streamAudio).toHaveBeenCalledTimes(1);
    expect(spies.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(spies.prepareTranscribeSpec).toHaveBeenCalledWith(
      ctx,
      SPEC,
      expect.objectContaining({ intentId: "task:task-1:aweme:7400000000000000001" }),
    );
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    // recordStep 至少一条(逐条)+ 末尾汇总。
    expect(spies.recordStep).toHaveBeenCalled();
    // ensureTranscriptArtifact 写入调用(transcript 非空)收到真逐字稿 "逐字稿X"。
    const writeCall = ensureCalls.find((c) => c.transcript !== "");
    expect(writeCall?.transcript).toBe("逐字稿X");
    expect(writeCall?.source).toBe("transcribed");
    expect(writeCall?.awemeId).toBe("7400000000000000001");
    expect(spies.onTranscriptReady).toHaveBeenCalledWith(ctx, {
      awemeId: "7400000000000000001",
      projectId: "proj-7400000000000000001",
    });
  });

  it("逐字稿已落库后，后续重建排队失败只告警，不反向把转写判失败", async () => {
    const { deps, spies } = makeDeps({ awemeIds: ["ready"] });
    deps.onTranscriptReady = vi.fn(async () => {
      throw new Error("重建队列暂不可用");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runTranscribe(
      ctx,
      {
        id: "task-ready",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["ready"] },
      },
      deps,
    );

    expect(spies.ensureTranscriptArtifact).toHaveBeenCalledTimes(1);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("逐字稿已就绪，但重建排队失败"),
      expect.any(String),
    );
  });

  it("在线失败后本地成功时接受 host 回传的真实 whisper-local 执行规格", async () => {
    const localSpec: MultimodalSpec = {
      provider: "whisper-local",
      baseUrl: null,
      model: "small",
      token: "",
      kind: "audio",
    };
    const { deps, spies, ensureCalls } = makeDeps({
      awemeIds: ["fallback-local"],
      transcribeResult: {
        text: "本地真实逐字稿",
        effectiveSpec: localSpec,
        executionMode: "whisper-local",
      },
    });
    await runTranscribe(
      ctx,
      {
        id: "task-local-fallback",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["fallback-local"] },
      },
      deps,
    );
    expect(spies.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(ensureCalls.find((c) => c.transcript)?.transcript).toBe("本地真实逐字稿");
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  });

  it("F7-a:ASR 未配置 → 整批立即停止并给设置指引，不继续逐条调用", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["a1", "a2"],
      resolveThrows: new TranscribeConfigError("transcribe.audio 未配置(测试注入)"),
    });
    await runTranscribe(
      ctx,
      {
        id: "task-2",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["a1", "a2"] },
      },
      deps,
    );
    expect(spies.markRunning).toHaveBeenCalledTimes(1);
    expect(spies.markSucceeded).not.toHaveBeenCalled();
    expect(spies.markFailed).toHaveBeenCalledTimes(1);
    expect(spies.transcribeAudio).not.toHaveBeenCalled();
    expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1);
    expect(spies.streamAudio).not.toHaveBeenCalled();
    const [, , msg] = spies.markFailed.mock.calls[0]!;
    expect(String(msg)).toMatch(/设置.*模型配置.*小米 MiMo/);
  });

  it("F7-b:多 aweme,其中一条 streamAudio 抛 → 该 aweme 失败、其余成功、任务不整体崩(markSucceeded 带失败计数)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["ok1", "bad", "ok2"],
      // 取音频失败模拟:runner 不按错误类判别(只特判 TranscribeConfigError),故普通 Error
      // 即可覆盖「该 aweme 失败其余继续」路径,无需 import 前端 ingestion 的 DouyinAudioFetchError。
      streamThrowsFor: (id) =>
        id === "bad"
          ? new Error("ffmpeg 非 0 退出 (直链失效)")
          : null,
    });
    await runTranscribe(
      ctx,
      {
        id: "task-3",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["ok1", "bad", "ok2"] },
      },
      deps,
    );
    // 不整体崩:markSucceeded 被调(有成功),markFailed 不被调。
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    // 两条成功各转写一次;失败那条 streamAudio 抛后不进 transcribeAudio。
    expect(spies.transcribeAudio).toHaveBeenCalledTimes(2);
    // 末尾汇总 step 文案含「成功 2 条,失败 1 条」。
    const summarySteps = spies.recordStep.mock.calls
      .map((c) => (c[2] as { text: string }).text)
      .filter((t) => t.includes("采集完成"));
    expect(summarySteps.length).toBe(1);
    expect(summarySteps[0]).toContain("成功 2 条");
    expect(summarySteps[0]).toContain("失败 1 条");
  });

  it("幂等:hasTranscriptArtifact 报已存在 → 跳过 fetch/ASR(fetchVideoUrl 未被调)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["dup"],
      alreadyHas: (id) => id === "dup",
    });
    await runTranscribe(
      ctx,
      {
        id: "task-4",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["dup"] },
      },
      deps,
    );
    // 已有逐字稿 → 省流:不 fetch 直链、不抽音、不 ASR、不重复写 artifact。
    expect(spies.fetchVideoUrl).not.toHaveBeenCalled();
    expect(spies.streamAudio).not.toHaveBeenCalled();
    expect(spies.transcribeAudio).not.toHaveBeenCalled();
    expect(spies.ensureTranscriptArtifact).not.toHaveBeenCalled();
    // 已跳过的 aweme 记一条 step + 计入成功 → markSucceeded。
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
  });
});

it.each([false,true])('已有事实恢复口播稿且恢复失败不重复 ASR (失败=%s)',async(fail)=>{
 const {deps,spies}=makeDeps({awemeIds:['dup'],alreadyHas:()=>true});
 const restore=vi.fn(async()=>{if(fail)throw new Error('temporary restore failure');});
 deps.restoreTranscriptArtifact=restore;
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{
  await runTranscribe(ctx,{id:'restore-existing',taskType:'transcribe.douyin',inputData:{awemeIds:['dup']}},deps);
  expect(restore).toHaveBeenCalledWith(ctx,'dup');
  expect(spies.fetchVideoUrl).not.toHaveBeenCalled();
  expect(spies.transcribeAudio).not.toHaveBeenCalled();
  expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  expect(spies.markFailed).not.toHaveBeenCalled();
 }finally{warn.mockRestore();}
});

// [T-243] 逐字稿覆盖率修复:图集诚实跳过 / ffmpeg 单次重试 / 失败分类计数。
describe("[T-243] runTranscribe 图集跳过 + ffmpeg 重试 + 失败分类", () => {
  it("图集作品 → 写占位锚(source:image-album + skipMasterScript),不抽音不 ASR,计数单列不算失败", async () => {
    const { deps, spies, ensureCalls } = makeDeps({
      awemeIds: ["album1", "vid1"],
      videoSourceFor: (id) =>
        id === "album1"
          ? { kind: "image-album" }
          : { kind: "video", playUrl: `https://v.example/${id}?play=1` },
    });
    await runTranscribe(
      ctx,
      {
        id: "task-5",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["album1", "vid1"] },
      },
      deps,
    );
    // 图集:不抽音、不 ASR;占位锚经 ensureTranscriptArtifact 写入(幂等锚防每轮重查)。
    expect(spies.streamAudio).toHaveBeenCalledTimes(1); // 仅 vid1
    expect(spies.transcribeAudio).toHaveBeenCalledTimes(1); // 仅 vid1
    const albumWrite = ensureCalls.find((c) => c.awemeId === "album1");
    expect(albumWrite?.transcript).toBe(IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER);
    expect(albumWrite?.source).toBe("image-album");
    expect(albumWrite?.skipMasterScript).toBe(true);
    expect(spies.onTranscriptReady).toHaveBeenCalledTimes(1);
    expect(spies.onTranscriptReady).toHaveBeenCalledWith(ctx, {
      awemeId: "vid1",
      projectId: "proj-vid1",
    });
    // 图集不算失败 → markSucceeded;汇总含「图集跳过 1 条」且失败 0。
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    const summary = spies.recordStep.mock.calls
      .map((c) => (c[2] as { text: string }).text)
      .find((t) => t.includes("采集完成"))!;
    expect(summary).toContain("图集跳过 1 条");
    expect(summary).toContain("失败 0 条");
  });

  it("全图集(0 转写成功)→ 仍 markSucceeded(诚实处理结果,非失败)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["album1"],
      videoSourceFor: () => ({ kind: "image-album" }),
    });
    await runTranscribe(
      ctx,
      {
        id: "task-6",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["album1"] },
      },
      deps,
    );
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
  });

  it("ffmpeg 首抽失败 → 重取直链重试一次成功(fetchVideoUrl 调 2 次,任务成功零失败)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["flaky"],
      streamThrowsFor: (id) =>
        id === "flaky"
          ? new Error("streamAudioFromVideo: ffmpeg 非 0 退出 (code=1): 403")
          : null,
      streamFailTimes: 1, // 首抽抛,重试恢复(直链瞬时失效场景)
    });
    await runTranscribe(
      ctx,
      {
        id: "task-7",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["flaky"] },
      },
      deps,
    );
    expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(2); // 首取 + 重取直链
    expect(spies.streamAudio).toHaveBeenCalledTimes(2); // 首抽失败 + 重试成功
    expect(spies.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
  });

  it("ffmpeg 重试后仍失败 → 单作品失败继续,汇总带分类计数(ffmpeg 1)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["dead", "ok1"],
      streamThrowsFor: (id) =>
        id === "dead"
          ? new Error("streamAudioFromVideo: ffmpeg 非 0 退出 (code=1): 403")
          : null,
      // streamFailTimes 缺省 = 次次抛 → 重试也失败。
    });
    await runTranscribe(
      ctx,
      {
        id: "task-8",
        taskType: "transcribe.douyin",
        inputData: { awemeIds: ["dead", "ok1"] },
      },
      deps,
    );
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1); // ok1 成功,不整体崩
    const summary = spies.recordStep.mock.calls
      .map((c) => (c[2] as { text: string }).text)
      .find((t) => t.includes("采集完成"))!;
    expect(summary).toContain("失败 1 条");
    expect(summary).toContain("ffmpeg 1");
    // 单条失败 step 也标了分类。
    const failStep = spies.recordStep.mock.calls
      .map((c) => (c[2] as { text: string }).text)
      .find((t) => t.includes("dead") && t.includes("失败"))!;
    expect(failStep).toContain("ffmpeg");
  });

  it("classifyTranscribeFailure 纯函数:按消息归类(解析/ffmpeg/验证码/其他)", () => {
    expect(
      classifyTranscribeFailure(
        "parseDouyinVideoUrl: 无法从 _ROUTER_DATA 中解析视频信息(item_list 为空)",
      ),
    ).toBe("parse-failed");
    expect(
      classifyTranscribeFailure("parseAwemeDetail: aweme_detail 为空(作品不存在/不可见/接口风控)"),
    ).toBe("parse-failed");
    expect(
      classifyTranscribeFailure("fetchDouyinVideoUrl: iesdouyin HTTP 503 (aweme x)"),
    ).toBe("parse-failed");
    expect(
      classifyTranscribeFailure("streamAudioFromVideo: ffmpeg 非 0 退出 (code=1)"),
    ).toBe("ffmpeg");
    expect(
      classifyTranscribeFailure(
        "fetchDouyinVideoUrlViaDetail: 作品页命中验证码,跳过 (aweme x)",
      ),
    ).toBe("captcha");
    expect(classifyTranscribeFailure("ASR 返回空逐字稿")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// [T-230] 限流冷却批级延迟重试:self.detail 重活先烧通道 → transcribe 紧跟撞
// DouyinCooldownActiveError 快速失败。修 = 检测冷却类失败 → 等冷却结束(fake gateway 可查
// 剩余)→ 只重跑冷却失败子集一次。全 fake(fake sleep 不真等),确定性单测。
// ---------------------------------------------------------------------------
describe("[T-230] 冷却类失败 → 延迟重试一次", () => {
  // gateway 冷却快速失败的形状(runner 经注入 isCooldownError 判别,不 import 前端错误类)。
  class FakeCooldownError extends Error {
    constructor(readonly remainMs: number) {
      super(
        `[douyin-gateway] channel "iesdouyin" 冷却中,剩余 ${Math.ceil(remainMs / 1000)}s 超过单次 acquire 等待上限,快速失败本轮`,
      );
      this.name = "DouyinCooldownActiveError";
    }
  }

  it("classifyTranscribeFailure:冷却消息归 cooldown 类", () => {
    expect(
      classifyTranscribeFailure(new FakeCooldownError(960_000).message),
    ).toBe("cooldown");
  });

  it("全批撞冷却 → 等冷却结束重试子集一次 → 全部成功,任务 markSucceeded", async () => {
    const awemeIds = ["a1", "a2"];
    const { deps, spies, ensureCalls } = makeDeps({ awemeIds });
    // 首轮每个 aweme 的 fetchVideoUrl 都撞冷却;重试轮放行。
    const attempts = new Map<string, number>();
    spies.fetchVideoUrl.mockImplementation(async (_c, awemeId: string) => {
      const n = (attempts.get(awemeId) ?? 0) + 1;
      attempts.set(awemeId, n);
      if (n === 1) throw new FakeCooldownError(960_000);
      return { playUrl: `https://v.example/${awemeId}?play=1` };
    });
    const sleep = vi.fn(async (_ms: number) => undefined);
    let cooldownRemain = 960_000;
    await runTranscribe(
      ctx,
      { id: "task-cd", taskType: "transcribe.douyin", inputData: { awemeIds } },
      {
        ...deps,
        isCooldownError: (e) => e instanceof FakeCooldownError,
        getCooldownRemainMs: () => cooldownRemain,
        maxCooldownWaitMs: 30 * 60 * 1000, // 30min 上限 > 剩余 16min → 等
        sleep: async (ms) => {
          await sleep(ms);
          cooldownRemain = 0; // 睡醒 = 冷却已过
        },
      },
    );
    // 等待了一次(剩余 + 5s buffer),且重试子集全部成功 → markSucceeded、非 markFailed。
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(960_000 + 5000);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    // 每 aweme 恰好两次 fetch(首轮撞冷却 + 重试成功),真转写写入两条。
    expect(attempts.get("a1")).toBe(2);
    expect(attempts.get("a2")).toBe(2);
    expect(
      ensureCalls.filter((c) => c.transcript === "逐字稿X"),
    ).toHaveLength(2);
    // 汇总 step 不再有失败计数(失败 0 条)。
    const texts = spies.recordStep.mock.calls.map(
      (c) => (c[2] as { text: string }).text,
    );
    expect(texts.some((t) => t.includes("限流冷却") && t.includes("重试"))).toBe(
      true,
    );
    expect(texts.some((t) => t.includes("失败 0 条"))).toBe(true);
  });

  it("冷却剩余超等待上限 → 诚实不等(sleep 不被调),失败照旧终态", async () => {
    const awemeIds = ["a1"];
    const { deps, spies } = makeDeps({ awemeIds });
    spies.fetchVideoUrl.mockImplementation(async () => {
      throw new FakeCooldownError(3_600_000); // 剩 60min
    });
    const sleep = vi.fn(async (_ms: number) => undefined);
    await runTranscribe(
      ctx,
      { id: "task-cd2", taskType: "transcribe.douyin", inputData: { awemeIds } },
      {
        ...deps,
        isCooldownError: (e) => e instanceof FakeCooldownError,
        getCooldownRemainMs: () => 3_600_000,
        maxCooldownWaitMs: 30 * 60 * 1000, // 上限 30min < 剩余 60min → 不等
        sleep,
      },
    );
    expect(sleep).not.toHaveBeenCalled();
    // 全失败 → markFailed,消息带冷却分类计数。
    expect(spies.markSucceeded).not.toHaveBeenCalled();
    expect(spies.markFailed).toHaveBeenCalledTimes(1);
    const msg = spies.markFailed.mock.calls[0]?.[2] as string;
    expect(msg).toContain("限流冷却 1");
    // 诚实 step:说明不等待、下轮幂等自动补。
    const texts = spies.recordStep.mock.calls.map(
      (c) => (c[2] as { text: string }).text,
    );
    expect(texts.some((t) => t.includes("超过等待上限"))).toBe(true);
  });

  it("未注入冷却端口(旧 host)→ 零回归:冷却失败按原样终态,不重试", async () => {
    const awemeIds = ["a1"];
    const { deps, spies } = makeDeps({ awemeIds });
    spies.fetchVideoUrl.mockImplementation(async () => {
      throw new FakeCooldownError(960_000);
    });
    await runTranscribe(
      ctx,
      { id: "task-cd3", taskType: "transcribe.douyin", inputData: { awemeIds } },
      deps, // 不带 isCooldownError/getCooldownRemainMs/sleep
    );
    expect(spies.markFailed).toHaveBeenCalledTimes(1);
    expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1); // 无重试
  });
});

describe("[T-357] 采集逐字稿后处理(落库前一遍,失败诚实落原文不阻断)", () => {
  it("后处理生效 → ensure 收到校正稿(非 ASR 原文),步骤注记「纠错+断句完成」,任务成功", async () => {
    const awemeIds = ["a1"];
    const { deps, spies, ensureCalls } = makeDeps({ awemeIds });
    const postprocess = vi.fn(
      async (_c: RequestContext, input: { awemeId: string; transcript: string }) => ({
        applied: true,
        transcript: `${input.transcript}(已校正)`,
      }),
    );
    await runTranscribe(
      ctx,
      { id: "t-pp1", taskType: "transcribe.douyin", inputData: { awemeIds } },
      { ...deps, postprocessTranscript: postprocess },
    );
    expect(postprocess).toHaveBeenCalledTimes(1);
    expect(postprocess.mock.calls[0]![1]).toEqual({
      awemeId: "a1",
      transcript: "逐字稿X",
    });
    expect(ensureCalls[0]!.transcript).toBe("逐字稿X(已校正)"); // 落库的是校正稿
    const stepTexts = spies.recordStep.mock.calls.map((c) => c[2].text);
    expect(stepTexts.some((t) => t.includes("后处理:纠错+断句完成"))).toBe(true);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  });

  it("后处理未执行(applied:false + reason)→ 落 ASR 原文,步骤注记「后处理未执行:<原因>」,不阻断", async () => {
    const awemeIds = ["a1"];
    const { deps, spies, ensureCalls } = makeDeps({ awemeIds });
    const postprocess = vi.fn(
      async (_c: RequestContext, input: { awemeId: string; transcript: string }) => ({
        applied: false,
        transcript: input.transcript,
        reason: "模型未配置(无可用 LLM 凭据)",
      }),
    );
    await runTranscribe(
      ctx,
      { id: "t-pp2", taskType: "transcribe.douyin", inputData: { awemeIds } },
      { ...deps, postprocessTranscript: postprocess },
    );
    expect(ensureCalls[0]!.transcript).toBe("逐字稿X"); // 诚实落原文
    const stepTexts = spies.recordStep.mock.calls.map((c) => c[2].text);
    expect(
      stepTexts.some((t) => t.includes("后处理未执行:模型未配置")),
    ).toBe(true);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1); // 转写链不因后处理挂掉
    expect(spies.markFailed).not.toHaveBeenCalled();
  });

  it("后处理直接抛错(实现违约)→ runner 双保险接住:落原文 + 注记,任务仍成功", async () => {
    const awemeIds = ["a1"];
    const { deps, spies, ensureCalls } = makeDeps({ awemeIds });
    const postprocess = vi.fn(async () => {
      throw new Error("后处理内部崩了");
    });
    await runTranscribe(
      ctx,
      { id: "t-pp3", taskType: "transcribe.douyin", inputData: { awemeIds } },
      { ...deps, postprocessTranscript: postprocess },
    );
    expect(ensureCalls[0]!.transcript).toBe("逐字稿X");
    const stepTexts = spies.recordStep.mock.calls.map((c) => c[2].text);
    expect(stepTexts.some((t) => t.includes("后处理未执行:后处理内部崩了"))).toBe(
      true,
    );
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  });

  it("未注入后处理端口(旧 host / 缺省)→ 零回归:落 ASR 原文,无后处理注记", async () => {
    const awemeIds = ["a1"];
    const { deps, spies, ensureCalls } = makeDeps({ awemeIds });
    await runTranscribe(
      ctx,
      { id: "t-pp4", taskType: "transcribe.douyin", inputData: { awemeIds } },
      deps, // 不带 postprocessTranscript
    );
    expect(ensureCalls[0]!.transcript).toBe("逐字稿X");
    const stepTexts = spies.recordStep.mock.calls.map((c) => c[2].text);
    expect(stepTexts.some((t) => t.includes("后处理"))).toBe(false);
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  });

  it("图集占位锚路径不走后处理(占位文本非 ASR 产文本)", async () => {
    const awemeIds = ["album1"];
    const { deps, spies } = makeDeps({
      awemeIds,
      videoSourceFor: () => ({ kind: "image-album" }),
    });
    const postprocess = vi.fn(async () => ({
      applied: true,
      transcript: "不该被调用",
    }));
    await runTranscribe(
      ctx,
      { id: "t-pp5", taskType: "transcribe.douyin", inputData: { awemeIds } },
      { ...deps, postprocessTranscript: postprocess },
    );
    expect(postprocess).not.toHaveBeenCalled();
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
  });
});
it('取消后的 ASR 返回不继续后处理或落稿，并原样交回取消状态',async()=>{
 const {deps,spies}=makeDeps({awemeIds:['one','two']});const controller=new AbortController();deps.signal=controller.signal;
 deps.transcribeAudio=vi.fn(async(_spec,opts)=>{expect(opts.signal).toBe(controller.signal);controller.abort();return {text:'迟到正文'};});
 deps.postprocessTranscript=vi.fn(async()=>({applied:false,transcript:'正文'}));
 await expect(runTranscribe(ctx,{id:'cancel-asr',taskType:'transcribe.douyin',inputData:{awemeIds:['one','two']}},deps)).rejects.toMatchObject({name:'AbortError'});
 expect(deps.postprocessTranscript).not.toHaveBeenCalled();expect(spies.ensureTranscriptArtifact).not.toHaveBeenCalled();expect(spies.markFailed).not.toHaveBeenCalled();expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1);
});
it('抽音阶段取消不再重取直链或启动 ASR',async()=>{
 const {deps,spies}=makeDeps({awemeIds:['one']});const controller=new AbortController();deps.signal=controller.signal;
 deps.streamAudio=vi.fn(async()=>{controller.abort();throw new DOMException('cancel','AbortError');});
 await expect(runTranscribe(ctx,{id:'cancel-stream',taskType:'transcribe.douyin',inputData:{awemeIds:['one']}},deps)).rejects.toMatchObject({name:'AbortError'});
 expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1);expect(spies.transcribeAudio).not.toHaveBeenCalled();expect(spies.markFailed).not.toHaveBeenCalled();
});
it('把同一个取消信号传给首次和重试取流、抽音端口',async()=>{
 const {deps}=makeDeps({awemeIds:['one']});const controller=new AbortController();deps.signal=controller.signal;
 const signals:unknown[]=[];let attempts=0;
 deps.fetchVideoUrl=async(...args)=>{signals.push(args[2]);return {playUrl:'https://fixture.invalid/audio'};};
 deps.streamAudio=async(...args)=>{signals.push(args[2]);if(++attempts===1)throw Error('expired');return new Uint8Array([1]);};
 await runTranscribe(ctx,{id:'forward-signal',taskType:'transcribe.douyin',inputData:{awemeIds:['one']}},deps);
 expect(signals).toEqual([controller.signal,controller.signal,controller.signal,controller.signal]);
});
it('冷却等待可立即取消，不等待到期、不重新抓取',async()=>{
 const {deps,spies}=makeDeps({awemeIds:['cooldown']});const controller=new AbortController();deps.signal=controller.signal;
 spies.fetchVideoUrl.mockRejectedValue(Object.assign(new Error('cooldown'),{name:'DouyinCooldownError'}));
 deps.isCooldownError=()=>true;deps.getCooldownRemainMs=()=>60_000;
 let entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});
 spies.recordStep.mockImplementation(async(_c,_id,data)=>{if(data.text.includes('等待冷却结束'))entered();});
 const running=runTranscribe(ctx,{id:'cancel-wait',taskType:'transcribe.douyin',inputData:{awemeIds:['cooldown']}},deps);
 const stopped=expect(running).rejects.toMatchObject({name:'AbortError'});
 await waiting;await Promise.resolve();controller.abort();await stopped;
 expect(spies.fetchVideoUrl).toHaveBeenCalledTimes(1);expect(spies.transcribeAudio).not.toHaveBeenCalled();expect(spies.markFailed).not.toHaveBeenCalled();
});
it.each([true,false])('已存事实探测返回 %s 时取消，不再启动恢复或取流',async(hasTranscript)=>{
 const {deps,spies}=makeDeps({awemeIds:['existing']});const controller=new AbortController();deps.signal=controller.signal;
 deps.hasTranscriptArtifact=async()=>{controller.abort();return hasTranscript;};deps.restoreTranscriptArtifact=vi.fn(async()=>{});
 await expect(runTranscribe(ctx,{id:'cancel-restore',taskType:'transcribe.douyin',inputData:{awemeIds:['existing']}},deps)).rejects.toMatchObject({name:'AbortError'});
 expect(deps.restoreTranscriptArtifact).not.toHaveBeenCalled();expect(spies.fetchVideoUrl).not.toHaveBeenCalled();expect(spies.markFailed).not.toHaveBeenCalled();
});
