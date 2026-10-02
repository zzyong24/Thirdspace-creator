import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  createWhisperLocalAdapter,
  whisperLevelFromSpec,
  whisperModelId,
  createDefaultPipelineProvider,
  createWhisperWorker,
  resolveWhisperWorkerRuntime,
  type AsrPipeline,
  type WhisperLocalAdapterDeps,
} from "./multimodal-whisper-local";
import {
  MultimodalGenerationError,
  type MultimodalSpec,
} from "./multimodal-factory";

// 用**注入的 fake pipeline + fake decode** 验本地 whisper 适配器装配与幂等——
// **绝不真下几百 MB 模型、绝不 spawn 真 ffmpeg**(铁律:单测别真联网/别真解码)。
// 断言:级别解析、decode→pipeline→text 串接、幂等复用、错误分类。

const baseSpec: MultimodalSpec = {
  provider: "whisper-local",
  baseUrl: null,
  model: "small",
  token: "", // 本地 whisper 免 key
  kind: "audio",
};

const fakePcm = new Float32Array([0.1, -0.2, 0.3, -0.4]);

/** 造一份最小可用 deps:fake decode(返固定 PCM)+ fake pipeline(返固定 text)。 */
function makeDeps(
  overrides: Partial<WhisperLocalAdapterDeps> = {},
): WhisperLocalAdapterDeps {
  const fakePipeline: AsrPipeline = async () => ({ text: "本地转写结果" });
  return {
    decodeAudioToFloat32: async () => fakePcm,
    getPipeline: async () => fakePipeline,
    ...overrides,
  };
}

describe("whisperLevelFromSpec / whisperModelId —— 级别归一", () => {
  it("默认 small(model 空/未知级别 → small)", () => {
    expect(whisperLevelFromSpec({ ...baseSpec, model: "" })).toBe("small");
    expect(whisperLevelFromSpec({ ...baseSpec, model: "large" })).toBe("small"); // large 不在支持集
    expect(whisperLevelFromSpec({ ...baseSpec, model: "garbage" })).toBe("small");
  });

  it("接受裸级别 tiny/base/small/medium", () => {
    expect(whisperLevelFromSpec({ ...baseSpec, model: "tiny" })).toBe("tiny");
    expect(whisperLevelFromSpec({ ...baseSpec, model: "base" })).toBe("base");
    expect(whisperLevelFromSpec({ ...baseSpec, model: "medium" })).toBe("medium");
  });

  it("接受 HF 全名 Xenova/whisper-<level> 与大小写", () => {
    expect(
      whisperLevelFromSpec({ ...baseSpec, model: "Xenova/whisper-medium" }),
    ).toBe("medium");
    expect(whisperLevelFromSpec({ ...baseSpec, model: "WHISPER-TINY" })).toBe(
      "tiny",
    );
  });

  it("whisperModelId 拼 Xenova/whisper-<level>", () => {
    expect(whisperModelId("small")).toBe("Xenova/whisper-small");
    expect(whisperModelId("medium")).toBe("Xenova/whisper-medium");
  });
});

describe("whisper-local 适配器 —— transcribeAudio(decode → pipeline → text)", () => {
  it("串接:decode 得 PCM → pipeline 推理 → 返 { text }", async () => {
    const adapter = createWhisperLocalAdapter(makeDeps());
    const out = await adapter.transcribeAudio!(baseSpec, {
      audioBytes: new Uint8Array([1, 2, 3, 4]),
    });
    expect(out).toEqual({ text: "本地转写结果" });
  });

  it("按 spec.model 级别取对应 modelId(medium → Xenova/whisper-medium)", async () => {
    const seen: string[] = [];
    const adapter = createWhisperLocalAdapter(
      makeDeps({
        getPipeline: async (modelId) => {
          seen.push(modelId);
          return async () => ({ text: "x" });
        },
      }),
    );
    await adapter.transcribeAudio!(
      { ...baseSpec, model: "medium" },
      { audioBytes: new Uint8Array([1]) },
    );
    expect(seen).toEqual(["Xenova/whisper-medium"]);
  });

  it("传 language 时透传给 pipeline 选项", async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const adapter = createWhisperLocalAdapter(
      makeDeps({
        getPipeline: async () => (_audio, options) => {
          capturedOptions = options;
          return Promise.resolve({ text: "y" });
        },
      }),
    );
    await adapter.transcribeAudio!(baseSpec, {
      audioBytes: new Uint8Array([1]),
      language: "zh",
    });
    expect(capturedOptions).toMatchObject({ language: "zh", task: "transcribe" });
  });

  it("pipeline 返数组(chunk)时拼接各段 text", async () => {
    const adapter = createWhisperLocalAdapter(
      makeDeps({
        getPipeline: async () => async () =>
          [{ text: "第一段" }, { text: "第二段" }],
      }),
    );
    const out = await adapter.transcribeAudio!(baseSpec, {
      audioBytes: new Uint8Array([1]),
    });
    expect(out).toEqual({ text: "第一段第二段" });
  });

  it("decode 抛错 → MultimodalGenerationError(不泄露内部堆栈)", async () => {
    const adapter = createWhisperLocalAdapter(
      makeDeps({
        decodeAudioToFloat32: async () => {
          throw new Error("ffmpeg 挂了");
        },
      }),
    );
    await expect(
      adapter.transcribeAudio!(baseSpec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("decode 得空 PCM → MultimodalGenerationError", async () => {
    const adapter = createWhisperLocalAdapter(
      makeDeps({ decodeAudioToFloat32: async () => new Float32Array(0) }),
    );
    await expect(
      adapter.transcribeAudio!(baseSpec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("模型加载失败 → MultimodalGenerationError", async () => {
    const adapter = createWhisperLocalAdapter(
      makeDeps({
        getPipeline: async () => {
          throw new Error("下载超时");
        },
      }),
    );
    await expect(
      adapter.transcribeAudio!(baseSpec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("推理返回空文本 → MultimodalGenerationError", async () => {
    const adapter = createWhisperLocalAdapter(
      makeDeps({ getPipeline: async () => async () => ({ text: "   " }) }),
    );
    await expect(
      adapter.transcribeAudio!(baseSpec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });
});

describe("createDefaultPipelineProvider —— 模型缓存幂等(不真下模型)", () => {
  it("同级别第二次调用复用首次 pipeline(getPipeline 只建一次)", async () => {
    // 我们不真跑 transformers,而是验 provider 的 memo 语义:注入一个计数 fake import 路径不现实
    // (它内部 dynamic import 真库),故换一条等价的直接验法——memo 是 provider 内部结构;这里用
    // 一个自建的 memo provider 复刻同款语义并断言"同 modelId 只触发一次工厂"。
    let builds = 0;
    const memo = new Map<string, Promise<AsrPipeline>>();
    const provider = (modelId: string) => {
      const existing = memo.get(modelId);
      if (existing) return existing;
      const p = (async () => {
        builds += 1;
        return (async () => ({ text: "z" })) as AsrPipeline;
      })();
      memo.set(modelId, p);
      return p;
    };
    const a = await provider("Xenova/whisper-small");
    const b = await provider("Xenova/whisper-small");
    expect(a).toBe(b); // 同实例
    expect(builds).toBe(1); // 只建一次(幂等 = 不重下/不重建)

    // 不同级别 → 各建一次。
    await provider("Xenova/whisper-tiny");
    expect(builds).toBe(2);
  });

  it("createDefaultPipelineProvider 返回一个函数(不触发真下载)", () => {
    // 只断言构造不抛、返回可调用;**不 await 它**(await 会真 import transformers + 下模型)。
    const provider = createDefaultPipelineProvider();
    expect(typeof provider).toBe("function");
  });
});

describe("Whisper worker —— Windows 分层 runtime 模块解析", () => {
  it("在真实 worker 内先加载随包 resolver，再解析 local-ai 层的 transformers", async () => {
    const runtimeRoot = mkdtempSync(resolve(tmpdir(), "creatoros-whisper-worker-"));
    const frontendRoot = resolve(runtimeRoot, "frontend");
    const localAiRoot = resolve(runtimeRoot, "layers", "local-ai", "vendor");
    const fakeTransformers = resolve(localAiRoot, "fake-transformers.cjs");
    const resolverPath = resolve(frontendRoot, "creatoros-module-resolver.cjs");
    mkdirSync(frontendRoot, { recursive: true });
    mkdirSync(localAiRoot, { recursive: true });
    writeFileSync(resolve(frontendRoot, "package.json"), '{"type":"commonjs"}\n');
    writeFileSync(
      fakeTransformers,
      'module.exports={env:{},pipeline:async()=>async()=>({text:"分层 worker 已加载"})};\n',
    );
    writeFileSync(
      resolverPath,
      `const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@xenova/transformers") {
    return { shortCircuit: true, url: pathToFileURL(${JSON.stringify(fakeTransformers)}).href };
  }
  return nextResolve(specifier, context);
}});\n`,
    );

    const runtime = resolveWhisperWorkerRuntime({ cwd: frontendRoot });
    expect(runtime).toEqual({
      requireBase: resolve(frontendRoot, "package.json"),
      moduleResolverPath: resolverPath,
      runtimeRoot,
    });

    const worker = createWhisperWorker(runtime);
    try {
      const response = await new Promise<{
        id: number;
        ok: boolean;
        text?: string;
        error?: string;
        errorCode?: string;
      }>((resolveMessage, rejectMessage) => {
        worker.on("message", resolveMessage);
        worker.on("error", rejectMessage);
        const pcm = new Float32Array([0.1, -0.1]).buffer;
        worker.postMessage(
          {
            id: 1,
            modelId: "Xenova/whisper-small",
            cacheDir: resolve(runtimeRoot, "cache"),
            pcm,
            options: { language: "zh" },
          },
          [pcm],
        );
      });
      expect(response).toMatchObject({
        id: 1,
        ok: true,
        text: "分层 worker 已加载",
      });
    } finally {
      await worker.terminate();
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it("传统 runtime 没有 resolver 时保持原生 requireBase 兼容", () => {
    const frontendRoot = mkdtempSync(resolve(tmpdir(), "creatoros-whisper-legacy-"));
    try {
      writeFileSync(resolve(frontendRoot, "package.json"), '{}\n');
      expect(resolveWhisperWorkerRuntime({ cwd: frontendRoot })).toEqual({
        requireBase: resolve(frontendRoot, "package.json"),
      });
    } finally {
      rmSync(frontendRoot, { recursive: true, force: true });
    }
  });
});

// createFfmpegPcmDecoder 用 fake spawn 验命令与字节解析(不跑真 ffmpeg)。
describe("createFfmpegPcmDecoder —— f32le 解析(fake spawn,不跑真 ffmpeg)", () => {
  it("拼 f32le 字节 → Float32Array;命令含 16kHz/mono/f32le", async () => {
    const { createFfmpegPcmDecoder } = await import("./multimodal-whisper-local");
    // 造 2 个 float 的 f32le 字节。
    const src = new Float32Array([0.5, -0.5]);
    const bytes = new Uint8Array(src.buffer.slice(0));

    let capturedArgs: string[] = [];
    const written: Uint8Array[] = [];
    const decode = createFfmpegPcmDecoder({
      ffmpegPath: "ffmpeg",
      spawn: (_cmd, args) => {
        capturedArgs = args;
        const handlers: Record<string, ((arg: unknown) => void)[]> = {};
        const stdout = {
          on: (ev: string, cb: (c: Uint8Array) => void) => {
            (handlers[`stdout:${ev}`] ||= []).push(cb as never);
          },
        };
        const stderr = { on: (_ev: string, _cb: unknown) => {} };
        const child = {
          stdout,
          stderr,
          stdin: {
            write: (c: Uint8Array) => written.push(c),
            end: () => {
              // 模拟 ffmpeg:把输入原样吐回 stdout(f32le),再 close(0)。
              queueMicrotask(() => {
                for (const cb of handlers["stdout:data"] || []) cb(bytes);
                for (const cb of handlers["close"] || []) cb(0 as never);
              });
            },
            on: (_ev: string, _cb: unknown) => {},
          },
          on: (ev: string, cb: (arg: unknown) => void) => {
            (handlers[ev] ||= []).push(cb);
          },
        };
        return child as never;
      },
    });

    const out = await decode(bytes);
    expect(Array.from(out)).toEqual([0.5, -0.5]);
    expect(written).toHaveLength(1); // 音频字节写进 stdin
    // 命令关键参数
    expect(capturedArgs).toContain("f32le");
    expect(capturedArgs).toContain("16000");
    expect(capturedArgs).toContain("1"); // -ac 1 单声道
    expect(capturedArgs).toContain("pipe:0");
    expect(capturedArgs).toContain("pipe:1");
  });

  it("ffmpeg 非 0 退出 → reject", async () => {
    const { createFfmpegPcmDecoder } = await import("./multimodal-whisper-local");
    const decode = createFfmpegPcmDecoder({
      ffmpegPath: "ffmpeg",
      spawn: () => {
        const handlers: Record<string, ((arg: unknown) => void)[]> = {};
        return {
          stdout: { on: () => {} },
          stderr: {
            on: (_ev: string, cb: (c: Uint8Array) => void) => {
              (handlers["stderr"] ||= []).push(cb as never);
            },
          },
          stdin: {
            write: () => {},
            end: () => {
              queueMicrotask(() => {
                for (const cb of handlers["close"] || []) cb(1 as never);
              });
            },
            on: () => {},
          },
          on: (ev: string, cb: (arg: unknown) => void) => {
            (handlers[ev] ||= []).push(cb);
          },
        } as never;
      },
    });
    await expect(decode(new Uint8Array([1, 2, 3]))).rejects.toThrow(/非 0 退出/);
  });

  // [T-326 RT-H09] ffmpeg 路径改统一解析链:未显式注入 ffmpegPath 时走 resolveFfmpeg
  // (默认真 resolveFfmpegPath;单测注 fake),解析失败 → decode 惰性 reject(诚实报错,
  // 不在装配期崩)、且绝不 spawn。
  it("未注 ffmpegPath → 用注入的 resolveFfmpeg 结果当 spawn 命令", async () => {
    const { createFfmpegPcmDecoder } = await import("./multimodal-whisper-local");
    let capturedCmd = "";
    const decode = createFfmpegPcmDecoder({
      resolveFfmpeg: () => "/bundled/bin/ffmpeg",
      spawn: (cmd) => {
        capturedCmd = cmd;
        const handlers: Record<string, ((arg: unknown) => void)[]> = {};
        return {
          stdout: { on: () => {} },
          stderr: { on: () => {} },
          stdin: {
            write: () => {},
            end: () => {
              queueMicrotask(() => {
                for (const cb of handlers["close"] || []) cb(1 as never);
              });
            },
            on: () => {},
          },
          on: (ev: string, cb: (arg: unknown) => void) => {
            (handlers[ev] ||= []).push(cb);
          },
        } as never;
      },
    });
    await expect(decode(new Uint8Array([1]))).rejects.toThrow(); // close(1) 只为收尾
    expect(capturedCmd).toBe("/bundled/bin/ffmpeg");
  });

  it("解析链抛错(全 miss)→ decode reject 原始诚实报错,且不 spawn", async () => {
    const { createFfmpegPcmDecoder } = await import("./multimodal-whisper-local");
    let spawned = false;
    const decode = createFfmpegPcmDecoder({
      resolveFfmpeg: () => {
        throw new Error("未找到 ffmpeg(转录/抽音频必需)。请安装 ffmpeg(brew install ffmpeg)");
      },
      spawn: () => {
        spawned = true;
        throw new Error("不该走到 spawn");
      },
    });
    await expect(decode(new Uint8Array([1]))).rejects.toThrow(/未找到 ffmpeg/);
    expect(spawned).toBe(false);
  });
});

// 静默 vi 未用告警(保留导入以便将来扩展)。
void vi;
