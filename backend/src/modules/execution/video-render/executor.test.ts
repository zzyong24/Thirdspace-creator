// [T-254a] video.render executor 编排单测(fake 引擎,不真渲):步骤流顺序、
// 素材预处理→模板落盘→渲染→交付转码链路、ffmpeg 缺失诚实报错、abort 贯通、
// props 引用未物化素材报错。
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import type { ExecutorSandboxView } from "../executor-registry";
import { createVideoRenderExecutor, type VideoRenderEngine } from "./executor";

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
  rendered: Array<{ projectDir: string; outputFile: string; fps: number }>;
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
      return { codec: "hevc", durationSec: 12 };
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

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "video-render-exec-"));
  sandbox = await makeSandbox();
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("createVideoRenderExecutor", () => {
  it("paramsSchema = { props } 契约(坏 props 被编排挡在执行前)", () => {
    const executor = createVideoRenderExecutor(fakeEngine({ ffmpegArgs: [], probed: [], rendered: [] }));
    expect(executor.taskType).toBe("video.render");
    expect(executor.paramsSchema!.safeParse({ props: props() }).success).toBe(true);
    expect(executor.paramsSchema!.safeParse({ props: { meta: {} } }).success).toBe(false);
  });

  it("全链路:预处理(全视频 h264 proxy -g 30)→ 模板落盘 → 渲染 → 交付转码 out/final.mp4", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const steps: string[] = [];
    const executor = createVideoRenderExecutor(fakeEngine(calls));
    const result = await executor.run(sandbox, { goal: "渲染", props: props() }, runOpts(steps));

    // 素材预处理:两个视频都过 proxy(hevc→h264),短 GOP -g 30
    expect(calls.probed).toEqual(["th.mp4", "b1.mp4"]);
    const proxyArgs = calls.ffmpegArgs.slice(0, 2);
    for (const args of proxyArgs) {
      expect(args).toContain("libx264");
      expect(args.join(" ")).toContain("-g 30");
    }
    // 模板真落沙箱 work/
    const html = await fs.readFile(path.join(sandbox.dir, "work", "index.html"), "utf8");
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('src="media/th.mp4"');
    // 渲染指向 work/,输出 raw
    expect(calls.rendered).toHaveLength(1);
    expect(calls.rendered[0]!.fps).toBe(30);
    // 交付转码固定命令(bt709/yuv420p/faststart)→ out/final.mp4
    const delivery = calls.ffmpegArgs.at(-1)!;
    expect(delivery.join(" ")).toContain("-pix_fmt yuv420p");
    expect(delivery.join(" ")).toContain("-colorspace bt709");
    expect(delivery.join(" ")).toContain("-movflags +faststart");
    await fs.access(path.join(sandbox.outDir, "final.mp4"));
    expect(result.summary).toContain("final.mp4");
    // 步骤流:工具链→预处理→模板→渲染→捕帧进度→转码
    expect(steps.some((s) => s.includes("检测工具链"))).toBe(true);
    expect(steps.some((s) => s.includes("预处理 th.mp4"))).toBe(true);
    expect(steps.some((s) => s.includes("HyperFrames 渲染"))).toBe(true);
    expect(steps.some((s) => s.includes("捕帧 30/360"))).toBe(true);
    expect(steps.some((s) => s.includes("交付转码"))).toBe(true);
  });

  it("[T-546] 图片 B-roll 按已物化 MIME 直拷，不交给 ffprobe 当视频探测", async () => {
    const calls: EngineCalls = { ffmpegArgs: [], probed: [], rendered: [] };
    const executor = createVideoRenderExecutor(fakeEngine(calls));
    const imageBrollProps = videoRenderProps.parse({
      ...props(),
      broll: [{ at: 4, file: "shot.png", label: "官网截图" }],
      scenes: props().scenes.map((scene) => ({ ...scene, cards: [] })),
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
    expect(html).toContain('src="media/shot.png"');
  });

  it("随包 ffmpeg/ffprobe 缺失 → 先提示重装 CreatorOS，开发态保留安装引导", async () => {
    const executor = createVideoRenderExecutor(
      fakeEngine({ ffmpegArgs: [], probed: [], rendered: [] }, { findBinary: async () => null }),
    );
    await expect(
      executor.run(sandbox, { props: props() }, runOpts([])),
    ).rejects.toThrow(
      /随包渲染组件 ffmpeg\/ffprobe 缺失.*重新安装最新版 CreatorOS.*(brew install ffmpeg|apt install ffmpeg|ffmpeg\.org)/,
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
          // 第一条 proxy 命令期间用户丢弃任务
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
