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
import { TranscribeConfigError } from "@/server/ai/multimodal/resolve";
import { DouyinAudioFetchError } from "@/server/ingestion/douyin-cdp";
import { runTranscribe, type TranscribeRunnerDeps } from "./transcribe-runner";

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
  resolveThrows?: Error | null;
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

  const fetchVideoUrl = vi.fn(async (_c: RequestContext, awemeId: string) => ({
    playUrl: `https://v.example/${awemeId}?play=1`,
  }));
  const streamAudio = vi.fn(async (_c: RequestContext, playUrl: string) => {
    const awemeId = playUrl.split("/").pop()!.split("?")[0]!;
    const boom = opts.streamThrowsFor?.(awemeId) ?? null;
    if (boom) throw boom;
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
    ): Promise<GeneratedTranscript> => ({ text: "逐字稿X" }),
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

  const deps: TranscribeRunnerDeps = {
    ai: { markRunning, recordStep, markSucceeded, markFailed },
    fetchVideoUrl,
    streamAudio,
    resolveTranscribeSpec,
    transcribeAudio,
    registry: FAKE_REGISTRY,
    hasTranscriptArtifact,
    ensureTranscriptArtifact,
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
      transcribeAudio,
      hasTranscriptArtifact,
      ensureTranscriptArtifact,
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
    expect(spies.markSucceeded).toHaveBeenCalledTimes(1);
    expect(spies.markFailed).not.toHaveBeenCalled();
    // recordStep 至少一条(逐条)+ 末尾汇总。
    expect(spies.recordStep).toHaveBeenCalled();
    // ensureTranscriptArtifact 写入调用(transcript 非空)收到真逐字稿 "逐字稿X"。
    const writeCall = ensureCalls.find((c) => c.transcript !== "");
    expect(writeCall?.transcript).toBe("逐字稿X");
    expect(writeCall?.source).toBe("transcribed");
    expect(writeCall?.awemeId).toBe("7400000000000000001");
  });

  it("F7-a:ASR 未配(TranscribeConfigError)→ 整任务停 markFailed,不 markSucceeded", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["a1", "a2"],
      resolveThrows: new TranscribeConfigError("transcribe.audio 未配置"),
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
    // 引导文案提到「设置」+「ASR」(去配 transcribe.audio)。
    const [, , msg] = spies.markFailed.mock.calls[0]!;
    expect(String(msg)).toContain("设置");
    // ASR 未配对整批成立:第一条就停,不应处理第二条(streamAudio 只跑到第一条)。
    // resolve 在第一条抛 → transcribeAudio 从未成功;markSucceeded 未调即证「整任务停」。
    expect(spies.transcribeAudio).not.toHaveBeenCalled();
  });

  it("F7-b:多 aweme,其中一条 streamAudio 抛 → 该 aweme 失败、其余成功、任务不整体崩(markSucceeded 带失败计数)", async () => {
    const { deps, spies } = makeDeps({
      awemeIds: ["ok1", "bad", "ok2"],
      streamThrowsFor: (id) =>
        id === "bad"
          ? new DouyinAudioFetchError("ffmpeg 非 0 退出 (直链失效)")
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
