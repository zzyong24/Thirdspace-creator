// [T-254a] video.render executor 编排单测(fake 引擎,不真渲):步骤流顺序、
// 素材预处理→模板落盘→渲染→交付无损整理链路、ffmpeg 缺失诚实报错、abort 贯通、
// props 引用未物化素材报错。
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  videoRenderProps,
  type RequestContext,
  type VideoRenderProps,
} from "@creatoros/contract";
import type { ExecutorSandboxView } from "../executor-registry";
import {
  buildHyperframesProcessArgs,
  calculateDeliveryBitrate,
  createVideoRenderExecutor,
  formatHyperframesProcessError,
  formatMediaProcessError,
  locateSystemChromium,
  type VideoRenderEngine,
} from "./executor";

let root: string;
let sandbox: ExecutorSandboxView;

function props(): VideoRenderProps {
  return videoRenderProps.parse({
    meta: { title: "测试片", brandLabel: "月明" },
    talkingHead: { file: "th.mp4", durationSec: 12 },
    captions: [{ start: 0, end: 3, cn: "第一句", en: "First" }],
    scenes: [
      {
        id: "s1",
        label: "HOOK",
        title: "开场",
        startSec: 0,
        endSec: 12,
        role: "hook",
        cards: [{ kind: "image", at: 2, file: "shot.png", label: "截图证据" }],
      },
    ],
    broll: [{ at: 4, file: "b1.mp4", label: "录屏" }],
  });
}

interface EngineCalls {
  ffmpegArgs: string[][];
  probed: string[];
  rendered: Array<{
    projectDir: string;
    outputFile: string;
    fps: number;
    quality: string;
    videoBitrate: string;
    videoFrameFormat: string;
    ffmpegPath: string;
    ffprobePath: string;
  }>;
}

function fakeEngine(
  calls: EngineCalls,
  overrides: Partial<VideoRenderEngine> = {},
): VideoRenderEngine {
  return {
    async findBinary(name) {
      return `/fake/${name}`;
    },
    async probeVideo(_ffprobe, file) {
      calls.probed.push(path.basename(file));
      return {
        codec: "hevc",
        profile: "Main 10",
        width: 1920,
        height: 1080,
        pixFmt: "yuv420p10le",
        avgFrameRate: "30/1",
        rFrameRate: "30/1",
        colorSpace: "bt2020nc",
        colorPrimaries: "bt2020",
        colorTransfer: "smpte2084",
        bitRate: 20_000_000,
        durationSec: 12,
      };
    },
    async probeDelivery() {
      return {
        codec: "h264",
        profile: "High",
        width: 1920,
        height: 1080,
        pixFmt: "yuv420p",
        avgFrameRate: "30/1",
        rFrameRate: "30/1",
        colorSpace: "bt709",
        colorPrimaries: "bt709",
        colorTransfer: "bt709",
        bitRate: 8_000_000,
        durationSec: 12,
      };
    },
    async verifyFfmpegDecode() {
      return true;
    },
    async runFfmpeg(_ffmpeg, args) {
      calls.ffmpegArgs.push(args);
      await fs.writeFile(args[args.length - 1]!, "fake-mp4");
    },
    async resolveChromium() {
      return "/fake/chrome";
    },
    async resolveGsapFile() {
      const p = path.join(root, "gsap.min.js");
      await fs.writeFile(p, "// fake gsap");
      return p;
    },
    async renderComposition(opts) {
      calls.rendered.push({
        projectDir: opts.projectDir,
        outputFile: opts.outputFile,
        fps: opts.fps,
        quality: opts.quality,
        videoBitrate: opts.videoBitrate,
        videoFrameFormat: opts.videoFrameFormat,
        ffmpegPath: opts.ffmpegPath,
        ffprobePath: opts.ffprobePath,
      });
      // 真 CLI 前置:工程里必须已有 index.html + gsap + media
      await fs.access(path.join(opts.projectDir, "index.html"));
      await fs.access(path.join(opts.projectDir, "gsap.min.js"));
      opts.onProgress("捕帧 30/360");
      await fs.writeFile(opts.outputFile, "fake-raw-render");
    },
    ...overrides,
  };
}

async function makeSandbox(): Promise<ExecutorSandboxView> {
  const dir = path.join(root, "task1");
  const inputDir = path.join(dir, "input");
  const outDir = path.join(dir, "out");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  for (const f of ["th.mp4", "b1.mp4", "shot.png"]) {
    await fs.writeFile(path.join(inputDir, f), `fake-${f}`);
  }
  return {
    taskId: "task1",
    dir,
    inputDir,
    outDir,
    inputs: [
      { assetId: "a1", mountAs: "th.mp4", size: 10, mimeType: "video/mp4" },
      { assetId: "a2", mountAs: "b1.mp4", size: 10, mimeType: "video/mp4" },
      { assetId: "a3", mountAs: "shot.png", size: 10, mimeType: "image/png" },
    ],
  };
}

function runOpts(steps: string[], controller = new AbortController()) {
  return {
    signal: controller.signal,
    reportStep: async (text: string) => {
      steps.push(text);
    },
  };
}

const requestContext: RequestContext = {
  userId: "user-a",
  accountId: "acct-a",
  requestId: "request-a",
  source: "user",
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "video-render-exec-"));
  sandbox = await makeSandbox();
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("createVideoRenderExecutor", () => {
  it("[T-853] FFmpeg 诊断同时保留启动首部与真正失败尾部", () => {
    const stderr = [
      "ffmpeg version 6.0 Copyright (c) FFmpeg developers",
      ...Array.from({ length: 30 }, (_, index) => `configuration line ${index}`),
      "[Parsed_colorspace_0] Unsupported input primaries 2 (unknown)",
      "Error while processing the decoded data for stream #0:0",
    ].join("\n");

    const diagnostic = formatMediaProcessError(stderr, "exit code 1");

    expect(diagnostic).toContain("ffmpeg version 6.0");
    expect(diagnostic).toContain("Unsupported input primaries 2 (unknown)");
    expect(diagnostic).toContain("Error while processing");
  });

  it("[T-845] Windows 分层 runtime 的正式渲染显式预加载同一模块解析器", async () => {
    const runtimeRoot = path.join(root, "runtime");
    const cli = path.join(
      runtimeRoot,
      "layers",
      "core",
      "render",
      "vendor",
      "hyperframes",
      "dist",
      "cli.js",
    );
    const resolver = path.join(
      runtimeRoot,
      "frontend",
      "creatoros-module-resolver.cjs",
    );
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.mkdir(path.dirname(resolver), { recursive: true });
    await fs.writeFile(cli, "// hyperframes");
    await fs.writeFile(resolver, "// resolver");

    await expect(
      buildHyperframesProcessArgs(cli, ["render", "project"], runtimeRoot),
    ).resolves.toEqual([
      "--require",
      resolver,
      cli,
      "render",
      "project",
    ]);
  });

  it("[T-845] 分层 runtime 缺解析器时在拉起子进程前明确失败", async () => {
    const runtimeRoot = path.join(root, "runtime");
    const cli = path.join(
      runtimeRoot,
      "layers",
      "core",
      "render",
      "vendor",
      "hyperframes",
      "dist",
      "cli.js",
    );
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.writeFile(cli, "// hyperframes");

    await expect(
      buildHyperframesProcessArgs(cli, ["render"], runtimeRoot),
    ).rejects.toThrow(/Windows 分层渲染运行时缺少模块解析器.*重新安装最新版应用/);
  });

  it("[T-845] 开发态与传统 node_modules runtime 不强制依赖分层解析器", async () => {
    const cli = path.join(root, "node_modules", "hyperframes", "dist", "cli.js");
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.writeFile(cli, "// hyperframes");

    await expect(
      buildHyperframesProcessArgs(cli, ["--help"], undefined),
    ).resolves.toEqual([cli, "--help"]);
  });

  it("[T-845] 模块加载错误同时保留缺失包名与尾部错误码并隐藏本机用户名", () => {
    const message = formatHyperframesProcessError(
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sharp' imported from C:\\Users\\real-user\\AppData\\Local\\CreatorOS\\runtime\\cli.js",
      "    at moduleResolve (...) { code: 'ERR_MODULE_NOT_FOUND' } Node.js v25.9.0",
    );

    expect(message).toContain("Cannot find package 'sharp'");
    expect(message).toContain("ERR_MODULE_NOT_FOUND");
    expect(message).not.toContain("real-user");
  });

  it("源码回归可通过显式路径复用系统 Chrome，不依赖 @playwright/test", async () => {
    const chrome = path.join(root, "chrome-for-regression");
    await fs.writeFile(chrome, "fake chrome");
    const before = process.env.CREATOROS_RENDER_CHROMIUM_PATH;
    process.env.CREATOROS_RENDER_CHROMIUM_PATH = chrome;
    try {
      await expect(locateSystemChromium()).resolves.toBe(chrome);
    } finally {
      if (before === undefined) delete process.env.CREATOROS_RENDER_CHROMIUM_PATH;
      else process.env.CREATOROS_RENDER_CHROMIUM_PATH = before;
    }
  });

  it("paramsSchema = { props } 契约(坏 props 被编排挡在执行前)", () => {
    const executor = createVideoRenderExecutor(fakeEngine({ ffmpegArgs: [], probed: [], rendered: [] }));
    expect(executor.taskType).toBe("video.render");
    expect(executor.paramsSchema!.safeParse({ props: props() }).success).toBe(true);
    expect(executor.paramsSchema!.safeParse({ props: { meta: {} } }).success).toBe(false);
  });

  it("全链路:非兼容视频只转一次高质量 mezzanine → HyperFrames 高码率编码 → final 无损 remux", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const steps: string[] = [];
    const executor = createVideoRenderExecutor(fakeEngine(calls));
    const result = await executor.run(sandbox, { goal: "渲染", props: props() }, runOpts(steps));

    // 素材预处理:两个 HEVC/HDR 视频只做一次高质量 SDR mezzanine，不再用 CRF18 proxy。
    expect(calls.probed).toEqual(["th.mp4", "b1.mp4"]);
    const preparationArgs = calls.ffmpegArgs.slice(0, 2);
    for (const args of preparationArgs) {
      expect(args).toContain("libx264");
      expect(args.join(" ")).toContain("-preset slow");
      expect(args.join(" ")).toContain("-crf 10");
      expect(args.join(" ")).toContain("zscale");
      expect(args.join(" ")).toContain("tonemap");
      expect(args.join(" ")).toContain(
        "-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709",
      );
      expect(args.join(" ")).not.toContain("veryfast");
    }
    // 模板真落沙箱 work/
    const html = await fs.readFile(path.join(sandbox.dir, "work", "index.html"), "utf8");
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('src="media/th.mp4"');
    // 渲染指向 work/,输出 raw
    expect(calls.rendered).toHaveLength(1);
    expect(calls.rendered[0]!.fps).toBe(30);
    expect(calls.rendered[0]!.quality).toBe("high");
    expect(calls.rendered[0]!.videoBitrate).toBe("10000k");
    expect(calls.rendered[0]!.videoFrameFormat).toBe("png");
    expect(calls.rendered[0]!.ffmpegPath).toBe("/fake/ffmpeg");
    expect(calls.rendered[0]!.ffprobePath).toBe("/fake/ffprobe");
    // final 只整理容器，不再发生第二次视频编码。
    const delivery = calls.ffmpegArgs.at(-1)!;
    expect(delivery.join(" ")).toContain("-c copy");
    expect(delivery.join(" ")).not.toContain("libx264");
    expect(delivery.join(" ")).not.toContain("libx265");
    expect(delivery.join(" ")).toContain("-movflags +faststart");
    await fs.access(path.join(sandbox.outDir, "final.mp4"));
    expect(result.summary).toContain("final.mp4");
    // 步骤流:工具链→预处理→模板→渲染→捕帧进度→转码
    expect(steps.some((s) => s.includes("检测工具链"))).toBe(true);
    expect(steps.some((s) => s.includes("准备 th.mp4"))).toBe(true);
    expect(steps.some((s) => s.includes("HyperFrames 高质量渲染"))).toBe(true);
    expect(steps.some((s) => s.includes("捕帧 30/360"))).toBe(true);
    expect(steps.some((s) => s.includes("无损整理"))).toBe(true);
    expect(result.meta?.deliveryQuality).toMatchObject({
      targetKbps: 10000,
      minimumKbps: 5000,
      actualKbps: 8000,
      status: "pass",
      warningCode: null,
    });
  });

  it("[T-902] 方形主素材使用安全舞台并保留左下人物，仍生成 HTML 并进入 HyperFrames", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const steps: string[] = [];
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeDelivery() {
          return {
            codec: "h264",
            profile: "High",
            width: 1080,
            height: 1920,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            bitRate: 8_000_000,
            durationSec: 12,
          };
        },
      }),
    );
    const base = props();
    const squareProps = videoRenderProps.parse({
      ...base,
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: base.scenes.map((scene) => ({ ...scene, cards: [] })),
      broll: [
        {
          at: 4,
          file: "b1.mp4",
          durationSec: 4,
          label: "方形操作素材",
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1024,
          sourceHeight: 1024,
        },
      ],
      direction: {
        motionThesis: "方形操作素材接管主舞台",
        beatGraph: [
          {
            id: "square-takeover",
            sceneIdx: 0,
            startSec: 4,
            endSec: 8,
            subject: { kind: "broll", ref: "broll:b1.mp4" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
    });

    await expect(
      executor.run(
        sandbox,
        { goal: "渲染方形素材", props: squareProps },
        runOpts(steps),
      ),
    ).resolves.toMatchObject({ summary: expect.stringContaining("final.mp4") });

    expect(calls.rendered).toHaveLength(1);
    expect(steps).not.toContainEqual(expect.stringMatching(/人物已隐藏/));
    const html = await fs.readFile(
      path.join(sandbox.dir, "work", "index.html"),
      "utf8",
    );
    expect(html).toContain('src="media/b1.mp4"');
    expect(html).toContain(
      'left:54,top:1188,width:264,height:469,borderRadius:24',
    );
    expect(html).not.toMatch(/(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
  });

  it("安全 H.264 通过 FFmpeg 全流解码后只 remux，不再调用重复的 Chromium 首帧预检", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    let chromiumChecks = 0;
    const engine = fakeEngine(calls, {
      async probeVideo(_ffprobe, file) {
        calls.probed.push(path.basename(file));
        return {
          codec: "h264",
          profile: "High",
          width: 1920,
          height: 1080,
          pixFmt: "yuv420p",
          avgFrameRate: "30/1",
          rFrameRate: "30/1",
          colorSpace: "bt709",
          colorPrimaries: "bt709",
          colorTransfer: "bt709",
          bitRate: 12_000_000,
          durationSec: 12,
        };
      },
    });
    Object.assign(engine, {
      verifyChromiumDecode: async () => {
        chromiumChecks += 1;
        return false;
      },
    });
    const executor = createVideoRenderExecutor(engine);

    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: props() },
      runOpts([]),
    );

    const preparationArgs = calls.ffmpegArgs.slice(0, 2);
    expect(preparationArgs).toHaveLength(2);
    for (const args of preparationArgs) {
      expect(args.join(" ")).toContain("-c copy");
      expect(args.join(" ")).not.toContain("libx264");
    }
    expect(result.meta?.inputPreparation).toEqual([
      expect.objectContaining({ file: "th.mp4", strategy: "remux" }),
      expect.objectContaining({ file: "b1.mp4", strategy: "remux" }),
    ]);
    expect(chromiumChecks).toBe(0);
  });

  it("[T-853] H.264/yuv420p 缺少全部色彩元数据时只归一标签，不调用要求已知输入的 colorspace", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeVideo(_ffprobe, file) {
          calls.probed.push(path.basename(file));
          return {
            codec: "h264",
            profile: "High",
            width: 768,
            height: 1344,
            pixFmt: "yuv420p",
            avgFrameRate: "24/1",
            rFrameRate: "24/1",
            colorSpace: "unknown",
            colorPrimaries: "unknown",
            colorTransfer: "unknown",
            bitRate: 5_000_000,
            durationSec: 6.583,
          };
        },
      }),
    );

    await executor.run(
      sandbox,
      { goal: "渲染", props: { ...props(), broll: [] } },
      runOpts([]),
    );

    const preparation = calls.ffmpegArgs[0]!.join(" ");
    expect(preparation).toContain("-vf format=yuv420p");
    expect(preparation).not.toContain("colorspace=all=bt709");
    expect(preparation).not.toContain("zscale=");
    expect(preparation).toContain("-color_primaries bt709");
  });

  it("H.264 未通过 FFmpeg 全流解码时只回退一次高质量 mezzanine", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeVideo(_ffprobe, file) {
          calls.probed.push(path.basename(file));
          return {
            codec: "h264",
            profile: "High",
            width: 1920,
            height: 1080,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            bitRate: 12_000_000,
            durationSec: 12,
          };
        },
        async verifyFfmpegDecode() {
          return false;
        },
      }),
    );

    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: { ...props(), broll: [] } },
      runOpts([]),
    );

    expect(calls.ffmpegArgs).toHaveLength(2);
    expect(calls.ffmpegArgs[0]!.join(" ")).toContain("libx264");
    expect(calls.ffmpegArgs[0]!.join(" ")).toContain("-crf 10");
    expect(result.meta?.inputPreparation).toEqual([
      expect.objectContaining({ file: "th.mp4", strategy: "mezzanine" }),
    ]);
  });

  it("高质量 mezzanine 直接进入真实渲染，不再被额外浏览器预检误阻断", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(fakeEngine(calls));

    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: { ...props(), broll: [] } },
      runOpts([]),
    );

    expect(result.meta?.inputPreparation).toEqual([
      expect.objectContaining({ file: "th.mp4", strategy: "mezzanine" }),
    ]);
    expect(calls.rendered).toHaveLength(1);
  });

  it("[T-901] 结构校验通过但平均码率低于建议值时保留成片并写入告警", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const steps: string[] = [];
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeDelivery() {
          return {
            codec: "h264",
            profile: "High",
            width: 1920,
            height: 1080,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            bitRate: 3_250_000,
            durationSec: 12,
          };
        },
      }),
    );

    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: props() },
      runOpts(steps),
    );

    await fs.access(path.join(sandbox.outDir, "final.mp4"));
    expect(result.meta?.deliveryQuality).toMatchObject({
      targetKbps: 10000,
      minimumKbps: 5000,
      actualKbps: 3250,
      status: "warning",
      warningCode: "BITRATE_BELOW_RECOMMENDED",
    });
    expect(steps).toContain(
      "成片可用，平均码率 3250kbps 低于建议值 5000kbps；已保留成片并记录质量提醒",
    );
  });

  it("stream.bit_rate 缺失时只用 v:0 packet bytes 计算视频平均码率", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeDelivery() {
          return {
            codec: "h264",
            profile: "High",
            width: 1920,
            height: 1080,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            bitRate: null,
            videoPacketBytes: 12_000_000,
            durationSec: 12,
          };
        },
      }),
    );

    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: props() },
      runOpts([]),
    );
    expect(result.meta?.deliveryQuality).toMatchObject({ actualKbps: 8000 });
  });

  it("交付尺寸或色彩标签与项目契约不一致时失败关闭", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeDelivery() {
          return {
            codec: "h264",
            profile: "High",
            width: 1280,
            height: 720,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: null,
            colorTransfer: null,
            bitRate: 8_000_000,
            durationSec: 12,
          };
        },
      }),
    );

    await expect(
      executor.run(sandbox, { goal: "渲染", props: props() }, runOpts([])),
    ).rejects.toThrow(/DELIVERY_MISMATCH.*size=1280x720.*color=bt709\/\?\/\?/);
  });

  it("既无流码率也无 v:0 packet bytes 时报 PROBE_INVALID", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async probeDelivery() {
          return {
            codec: "h264",
            profile: "High",
            width: 1920,
            height: 1080,
            pixFmt: "yuv420p",
            avgFrameRate: "30/1",
            rFrameRate: "30/1",
            colorSpace: "bt709",
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            bitRate: null,
            videoPacketBytes: null,
            durationSec: 12,
          };
        },
      }),
    );

    await expect(
      executor.run(sandbox, { goal: "渲染", props: props() }, runOpts([])),
    ).rejects.toThrow(/PROBE_INVALID.*v:0 packet bytes/);
  });

  it("目标码率公式按画幅和 fps 确定性缩放并限制在 4–24 Mbps", () => {
    expect(calculateDeliveryBitrate({ width: 1920, height: 1080, fps: 30 }))
      .toEqual({ targetKbps: 10000, minimumKbps: 5000 });
    expect(calculateDeliveryBitrate({ width: 1920, height: 1080, fps: 60 }))
      .toEqual({ targetKbps: 20000, minimumKbps: 10000 });
    expect(calculateDeliveryBitrate({ width: 640, height: 360, fps: 24 }))
      .toEqual({ targetKbps: 4000, minimumKbps: 2000 });
    expect(calculateDeliveryBitrate({ width: 7680, height: 4320, fps: 60 }))
      .toEqual({ targetKbps: 24000, minimumKbps: 12000 });
  });

  it("配置视觉模型时抽 8 帧接触表审核，并把遮脸/微缩等问题写入 manifest meta", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const steps: string[] = [];
    const executor = createVideoRenderExecutor(fakeEngine(calls), {
      reviewVisuals: async (_ctx, input) => {
        expect(input.mimeType).toBe("image/jpeg");
        expect(input.bytes.byteLength).toBeGreaterThan(0);
        expect(input.prompt).toContain("遮挡或切掉人物脸");
        return JSON.stringify({
          verdict: "warn",
          summary: "主画面压住人物，界面文字偏小。",
          issues: [
            { code: "face_occlusion", severity: "error", message: "人物只露半张脸。" },
            { code: "tiny_visual", severity: "warning", message: "录屏文字无法阅读。" },
          ],
        });
      },
    });
    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: props() },
      { ...runOpts(steps), ctx: requestContext },
    );

    expect(executor.networkPosture).toBe("brain-ports");
    expect(calls.ffmpegArgs.at(-1)?.join(" ")).toContain("tile=4x2");
    expect(steps.some((step) => step.includes("视觉审核"))).toBe(true);
    expect(result.meta?.visualReview).toMatchObject({
      status: "reviewed",
      verdict: "warn",
    });
    expect(
      (result.meta?.visualReview as { issues?: unknown[] }).issues?.[0],
    ).toMatchObject({ code: "face_occlusion", severity: "error" });
  });

  it("视觉审核不可用不阻断出片，只诚实记录 unavailable", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(fakeEngine(calls), {
      reviewVisuals: async () => {
        throw new Error("视觉模型超时");
      },
    });
    const result = await executor.run(
      sandbox,
      { goal: "渲染", props: props() },
      { ...runOpts([]), ctx: requestContext },
    );
    await fs.access(path.join(sandbox.outDir, "final.mp4"));
    expect(result.meta?.visualReview).toMatchObject({
      status: "unavailable",
      summary: expect.stringContaining("视觉模型超时"),
    });
  });

  it.each(["legacy", "stable"] as const)("[T-1037/T-546] %s 图片 B-roll 引用在物化改名后仍按 MIME 和正确时间渲染", async (mode) => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(fakeEngine(calls));
    const screenshotAssetId = "asset-screenshot-without-extension";
    await fs.writeFile(
      path.join(sandbox.inputDir, screenshotAssetId),
      "fake-png",
    );
    sandbox = {
      ...sandbox,
      inputs: [
        ...sandbox.inputs,
        {
          assetId: screenshotAssetId,
          mountAs: screenshotAssetId,
          size: 10,
          mimeType: "image/png",
        },
      ],
    };
    const imageBrollProps = videoRenderProps.parse({
      ...props(),
      broll: [{ id: mode === "stable" ? "stable-broll" : undefined, at: 4, file: screenshotAssetId, label: "官网截图" }],
      scenes: props().scenes.map((scene) => ({ ...scene, cards: [] })),
      direction: {
        motionThesis: "真实截图在声明拍点接管主视觉。",
        beatGraph: [
          {
            id: "screenshot_takeover",
            sceneIdx: 0,
            startSec: 5,
            endSec: 8,
            subject: { kind: "broll", ref: `broll:${mode === "stable" ? "stable-broll" : screenshotAssetId}` },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
    });

    await executor.run(
      sandbox,
      { goal: "渲染", props: imageBrollProps },
      runOpts([]),
    );

    expect(calls.probed).toEqual(["th.mp4"]);
    const html = await fs.readFile(
      path.join(sandbox.dir, "work", "index.html"),
      "utf8",
    );
    expect(html).toContain(
      `src="media/${screenshotAssetId}.png"`,
    );
    expect(html).toMatch(
      new RegExp(`src="media/${screenshotAssetId}\\.png"[^>]+data-start="5\\.00"`),
    );
    expect(html).toMatch(
      new RegExp(`<img[^>]+src="media/${screenshotAssetId}\\.png"`),
    );
    expect(html).not.toMatch(
      new RegExp(`<video[^>]+src="media/${screenshotAssetId}\\.png"`),
    );
  });

  it("随包 ffmpeg/ffprobe 缺失 → 先提示重装应用，开发态保留安装引导", async () => {
    const executor = createVideoRenderExecutor(
      fakeEngine({ ffmpegArgs: [], probed: [], rendered: [] }, { findBinary: async () => null }),
    );
    await expect(
      executor.run(sandbox, { props: props() }, runOpts([])),
    ).rejects.toThrow(
      /随包渲染组件 ffmpeg\/ffprobe 缺失.*重新安装最新版应用.*(brew install ffmpeg|apt install ffmpeg|ffmpeg\.org)/,
    );
  });

  it("Chromium 未就绪 → 诚实报错(不偷偷下载)", async () => {
    const executor = createVideoRenderExecutor(
      fakeEngine(
        { ffmpegArgs: [], probed: [], rendered: [] },
        {
          resolveChromium: async () => {
            throw new Error("渲染用 Chromium 未就绪:请先触发浏览器下载");
          },
        },
      ),
    );
    await expect(executor.run(sandbox, { props: props() }, runOpts([]))).rejects.toThrow(
      /Chromium 未就绪/,
    );
  });

  it("props 引用未物化素材 → 执行前报错(不空跑渲染)", async () => {
    const p = props();
    p.broll[0]!.file = "missing.mp4";
    const executor = createVideoRenderExecutor(fakeEngine({ ffmpegArgs: [], probed: [], rendered: [] }));
    await expect(executor.run(sandbox, { props: p }, runOpts([]))).rejects.toThrow(
      /未物化到沙箱: missing\.mp4/,
    );
  });

  it("abort 贯通:渲染前中止 → 立即抛出,不再触发渲染", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const controller = new AbortController();
    const executor = createVideoRenderExecutor(
      fakeEngine(calls, {
        async runFfmpeg(_f, args) {
          // 第一条正式输入准备命令期间用户丢弃任务
          controller.abort(new Error("用户丢弃任务,执行已中止"));
          await fs.writeFile(args[args.length - 1]!, "fake");
        },
      }),
    );
    await expect(
      executor.run(sandbox, { props: props() }, runOpts([], controller)),
    ).rejects.toThrow(/中止/);
    expect(calls.rendered).toHaveLength(0);
  });
});
