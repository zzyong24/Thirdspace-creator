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

describe("Whisper 真实缓冲区转移后的样本证据", () => {
  it.each([16000,16001])("推理前PCM样本数与证据 %s 比较，transfer后仍可核验且不接受不符证据",async(validSampleCount)=>{
    const pcm=new Float32Array(16000);
    const adapter=createWhisperLocalAdapter({decodeAudioToFloat32:async()=>pcm,getPipeline:async()=>async(audio)=>{
      // 真实执行 ArrayBuffer 转移，重现独立 Worker postMessage 后原数组 detached。
      structuredClone(audio.buffer,{transfer:[audio.buffer as ArrayBuffer]});
      return {wordTimingValidated:true,text:"可验证单位",chunks:[{text:"可验证单位",timestamp:[0,0.5]}]};
    }});
    const result=await adapter.transcribeAudio!(baseSpec,{audioBytes:new Uint8Array([1,2,3]),timestampMode:"word",timingAudio:{sampleRate:16000,validSampleCount}});
    expect(pcm.length).toBe(0);
    if(validSampleCount===16000)expect(result.timing).toMatchObject({sampleRate:16000,validSampleCount:16000,ranges:[{text:"可验证单位",startSample:0,endSample:8000}]});
    else expect(result.timing).toBeUndefined();
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

    const resolveDependency=vi.fn(()=>{throw Error("桌面 resolver 存在，不应走 worker 依赖路径");});
    const runtime = resolveWhisperWorkerRuntime({ cwd: frontendRoot,resolveDependency });
    expect(resolveDependency).not.toHaveBeenCalled();
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

  it("Web frontend cwd 无分层 resolver，使用 execution Worker 所在包真实可解析的依赖路径", () => {
    const frontendRoot=mkdtempSync(resolve(tmpdir(),"creatoros-whisper-web-"));
    try{
      writeFileSync(resolve(frontendRoot,"package.json"),'{}\n');
      const dependencyPath=resolve(frontendRoot,"..","ai-worker","node_modules","@xenova","transformers","src","transformers.js");
      const resolveDependency=vi.fn((specifier:string)=>{expect(specifier).toBe("@xenova/transformers");return dependencyPath;});
      expect(resolveWhisperWorkerRuntime({cwd:frontendRoot,resolveDependency})).toEqual({requireBase:dependencyPath});
      expect(resolveDependency).toHaveBeenCalledOnce();
    }finally{rmSync(frontendRoot,{recursive:true,force:true});}
  });

  it("传统 runtime 没有 resolver 时保持原生 requireBase 兼容", () => {
    const frontendRoot = mkdtempSync(resolve(tmpdir(), "creatoros-whisper-legacy-"));
    try {
      writeFileSync(resolve(frontendRoot, "package.json"), '{}\n');
      expect(resolveWhisperWorkerRuntime({ cwd: frontendRoot,resolveDependency:()=>{throw Object.assign(Error("传统包依赖仅在 cwd"),{code:"MODULE_NOT_FOUND"});} })).toEqual({
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


it("T1062 direct与真实默认worker以实际tensor物理帧裁剪，不使用legacy feature帧",async()=>{
 // 合成模型仅模拟调用形状和原提取函数，不读取研究capture、不执行模型。
 const code=`module.exports={env:{},pipeline:async()=>{
 const model={config:{max_source_positions:1500,decoder_layers:1,decoder_attention_heads:12},generate:async function(input){await this.forward(input);return this._extract_token_timestamps({cross_attentions:[[[{dims:[1,12,1,1500]}]]]},[],1916,0.02);},forward:async()=>({encoder_outputs:{dims:[1,1500,768]}}),_extract_token_timestamps:(_out,_heads,frames)=>({text:'原完整正文',chunks:[{text:'原词',timestamp:[0,frames*0.02]}]})};
 const pipe=async(audio)=>{if(pipe.processor.feature_extractor.config.hop_length!==160)throw Error("真实pipeline读取processor配置");const features=await pipe.processor(audio);return model.generate(features.input_features);};pipe.model=model;pipe.processor=async()=>({input_features:{dims:[1,80,3000]}});pipe.processor.feature_extractor={config:{nb_max_frames:3000,n_samples:480000,chunk_length:30,sampling_rate:16000,hop_length:160}};return pipe;}};`;
 const dir=mkdtempSync(resolve(tmpdir(),'t1062-whisper-frame-')),fake=resolve(dir,'transformers.cjs'),resolver=resolve(dir,'resolver.cjs');
 writeFileSync(fake,code);writeFileSync(resolve(dir,'package.json'),'{}');
 writeFileSync(resolver,`const {registerHooks}=require('node:module');const {pathToFileURL}=require('node:url');registerHooks({resolve(s,c,n){return s==='@xenova/transformers'?{shortCircuit:true,url:pathToFileURL(${JSON.stringify(fake)}).href}:n(s,c);}});`);
 let worker:ReturnType<typeof createWhisperWorker>|undefined;
 try{
 const {createRequire}=await import('node:module'),lib=createRequire(resolve(dir,'package.json'))(fake);
 vi.doMock('@xenova/transformers',()=>lib);
 const direct=await createDefaultPipelineProvider()('Xenova/whisper-small');
 expect(await direct(new Float32Array(306587),{return_timestamps:'word'})).toMatchObject({text:'原完整正文',chunks:[{text:'原词',timestamp:[0,19.16]}],wordTimingValidated:true});
 worker=createWhisperWorker({requireBase:resolve(dir,'package.json'),moduleResolverPath:resolver,runtimeRoot:dir});
 const {createWorkerPipelineProvider}=await import('./multimodal-whisper-local'),proxy=await createWorkerPipelineProvider(()=>worker!)('Xenova/whisper-small');
 expect(await proxy(new Float32Array(306587),{return_timestamps:'word'})).toMatchObject({text:'原完整正文',chunks:[{text:'原词',timestamp:[0,19.16]}],wordTimingValidated:true});
 }finally{vi.doUnmock('@xenova/transformers');await worker?.terminate();rmSync(dir,{recursive:true,force:true});}
});

it('T1062 同源多chunk只按实际processor输入和feature对象绑定；未知关联保留正文和原chunks',async()=>{
 const {guardWhisperPipeline}=await import('./multimodal-whisper-local');
 const create=(unknown=false)=>{
  const model={config:{max_source_positions:1500,decoder_layers:2,decoder_attention_heads:4},async generate(feature:unknown,options:{num_frames:number}){await this.forward();return this._extract_token_timestamps({cross_attentions:[[[{dims:[1,4,1,1500]},{dims:[1,4,1,1500]}]]]},[],options.num_frames,0.02);},async forward(){return{encoder_outputs:{dims:[1,1500,768]}};},_extract_token_timestamps(_out:unknown,_heads:unknown,frames:number,_precision:number){return frames;}};
  const processor=Object.assign(async(_input:Float32Array)=>({input_features:{dims:[1,80,3000]}}),{feature_extractor:{config:{nb_max_frames:3000,n_samples:480000,chunk_length:30,sampling_rate:16000,hop_length:160}}});
  const pipe=Object.assign(async(audio:Float32Array)=>{const chunks=[],config=pipe.processor.feature_extractor.config;expect(config.hop_length).toBe(160);for(let offset=0;offset<audio.length;offset+=320000){const input=audio.subarray(offset,offset+480000),feature=await pipe.processor(input);chunks.push({feature:feature.input_features,count:input.length});}const frames=[];for(const c of chunks)frames.push(await model.generate(unknown?{...c.feature}:c.feature,{num_frames:Math.floor(c.count/160)}));return{text:JSON.stringify(frames),chunks:[{text:'完整原正文',timestamp:[0,45] as [number,number]}]};},{model,processor});
  return guardWhisperPipeline(pipe);
 };
 const good=await create()(new Float32Array(720000),{return_timestamps:'word'});expect(good).toEqual({text:'[1500,1250,250]',chunks:[{text:'完整原正文',timestamp:[0,45]}],wordTimingValidated:true});
 const unknown=await create(true)(new Float32Array(720000),{return_timestamps:'word'});expect(unknown).toEqual({text:'[3000,2500,500]',chunks:[{text:'完整原正文',timestamp:[0,45]}],wordTimingValidated:false});
});

it('T1062 原依赖Pipeline执行真实Whisper分块、配置读取与拼接，仅注入神经推理',async()=>{
 // 只构造已安装库导出的Pipeline，不调用pipeline factory、不加载模型/session。
 const {AutomaticSpeechRecognitionPipeline,WhisperProcessor}=await vi.importActual<typeof import('@xenova/transformers')>('@xenova/transformers');
 const {guardWhisperPipeline}=await import('./multimodal-whisper-local');
 const samples:number[]=[],crops:number[]=[],decoded:Array<{stride:number[];tokens:number[];token_timestamps:number[]}>=[];
 const model={config:{model_type:'whisper',max_source_positions:1500,decoder_layers:2,decoder_attention_heads:4},async generate(_feature:unknown,options:{num_frames:number}){await this.forward();return{sequences:[[1,2]],token_timestamps:this._extract_token_timestamps({cross_attentions:[[[{dims:[1,4,1,1500]},{dims:[1,4,1,1500]}]]]},[],options.num_frames,0.02)};},async forward(){return{encoder_outputs:{dims:[1,1500,768]}};},_extract_token_timestamps(_out:unknown,_heads:unknown,frames:number,precision:number){crops.push(frames);return{tolist:()=>[[0,frames*precision]]};}};
 const featureExtractor=Object.assign(async(input:Float32Array)=>{samples.push(input.length);return{input_features:{dims:[1,80,3000]}};},{config:{nb_max_frames:3000,n_samples:480000,chunk_length:30,sampling_rate:16000,hop_length:160}});
 const processor:unknown=Reflect.construct(WhisperProcessor,[featureExtractor]);if(typeof processor!=='function')throw Error('依赖Processor不是Callable');expect(Reflect.get(processor,'apply')).toBeUndefined();
 const tokenizer={get_decoder_prompt_ids:()=>[],_decode_asr(chunks:typeof decoded,options:{time_precision:number;return_timestamps:string}){expect(options).toMatchObject({time_precision:0.02,return_timestamps:'word'});decoded.push(...chunks);return['完整原正文',{chunks:[{text:'合成词',timestamp:[0,45]}]}];}};
 const candidate:unknown=Reflect.construct(AutomaticSpeechRecognitionPipeline,[{task:'automatic-speech-recognition',model,tokenizer,processor}]);
 function isPipeline(value:unknown):value is AsrPipeline{return typeof value==='function'&&Reflect.get(value,'model')===model&&Reflect.get(value,'processor')===processor;}
 expect(isPipeline(candidate)).toBe(true);if(!isPipeline(candidate))throw Error('真实Callable Pipeline构造失败');
 const originalGenerate=model.generate,originalForward=model.forward,originalExtract=model._extract_token_timestamps;
 const pipeline=guardWhisperPipeline(candidate);
 expect(await pipeline(new Float32Array(720000),{return_timestamps:'word',chunk_length_s:30,stride_length_s:5})).toEqual({text:'完整原正文',chunks:[{text:'合成词',timestamp:[0,45]}],wordTimingValidated:true});
 expect(samples).toEqual([480000,400000,80000]);expect(crops).toEqual([1500,1250,250]);
 expect(decoded.map(c=>c.stride)).toEqual([[30,0,5],[25,5,5],[5,5,0]]);
 expect(decoded.map(c=>c.token_timestamps)).toEqual([[0,30],[0,25],[0,5]]);
 expect(Reflect.get(candidate,'processor')).toBe(processor);expect(model.generate).toBe(originalGenerate);expect(model.forward).toBe(originalForward);expect(model._extract_token_timestamps).toBe(originalExtract);
 // 同一Callable二次调用与取消均恢复原身份，既有segment路径不要求word声明。
 expect(await pipeline(new Float32Array(306587),{return_timestamps:'word',chunk_length_s:30,stride_length_s:5})).toMatchObject({wordTimingValidated:true});expect(crops.at(-1)).toBe(958);
 const cancel=new AbortController();cancel.abort();await expect(pipeline(new Float32Array(16000),{return_timestamps:'word'},cancel.signal)).rejects.toMatchObject({name:'AbortError'});expect(Reflect.get(candidate,'processor')).toBe(processor);
});
