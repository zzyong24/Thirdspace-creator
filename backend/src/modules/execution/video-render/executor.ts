// [T-254a] video.render executor(HyperFrames 确定性渲染,SPEC 2026-07-11
// execution-layer-video-pipeline §3.1 步骤4)。
//
// 步骤流:素材预处理(ffprobe 探针 → 统一 H.264 proxy,短 GOP `-g 30`,skill 坑单全防)
// → 模板生成 index.html 落沙箱 work/ → hyperframes CLI 渲染(帧捕获,puppeteer 指向
// playwright 已装 Chromium)→ 交付转码(H.264/yuv420p/bt709/faststart 固定命令)
// → out/final.mp4(经确认卡采纳才入库)。
//
// 依赖策略(与 SPEC §3.2 一致):
//   - `hyperframes`(npm,HeyGen 开源 Apache-2.0)= CLI 子进程调用(**不** import 其
//     模块 —— B 案子进程形状,abort 直接 kill);LICENSE 收录见 docs/licenses/。
//     TODO(T-255b gate-F1):app「关于/开源许可」页落地时收录 HyperFrames LICENSE 全文。
//   - Chromium:复用 playwright 已装浏览器(douyin-cdp/T-173 同源,executablePath 传
//     HYPERFRAMES_BROWSER_PATH);未装 → 诚实报错引导(不在渲染路径里偷偷下载 ~340MB)。
//   - ffmpeg:v1 检测系统安装,缺失诚实报错引导 `brew install ffmpeg`(不打包 ffmpeg-static)。
//
// 全部外部调用走 deps 注入(默认真实现)—— 编排/步骤/失败路径可 fake 引擎单测,不真渲。
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { videoRenderParams, type VideoRenderProps } from "@creatoros/contract";
import type { ExecutionExecutor, ExecutorRunOpts, ExecutorSandboxView } from "../executor-registry";
import { resolveInsideDir } from "../sandbox";
import { collectMediaFiles, generateVideoRenderHtml } from "./template";

// ── 可注入的引擎面(测试 fake 掉,不碰真 ffmpeg/真浏览器/真渲染)────────────────────
export interface VideoRenderEngine {
  /** 系统 ffmpeg/ffprobe 检测(which);缺失 → null(executor 诚实报错引导安装)。 */
  findBinary(name: "ffmpeg" | "ffprobe"): Promise<string | null>;
  /** ffprobe 探针:视频流 codec + 时长。 */
  probeVideo(
    ffprobe: string,
    file: string,
    signal: AbortSignal,
  ): Promise<{ codec: string; durationSec: number }>;
  /** 跑一条 ffmpeg 命令(转码);非 0 退出 → throw。 */
  runFfmpeg(ffmpeg: string, args: string[], signal: AbortSignal): Promise<void>;
  /** 解析渲染用 Chromium(playwright 已装);未装 → throw 诚实引导。 */
  resolveChromium(): Promise<string>;
  /** 解析 gsap.min.js 磁盘路径(npm gsap 包)。 */
  resolveGsapFile(): Promise<string>;
  /** hyperframes CLI 渲染 work/ → outputFile;进度回调喂步骤流。 */
  renderComposition(opts: {
    projectDir: string;
    outputFile: string;
    fps: number;
    chromiumPath: string;
    signal: AbortSignal;
    onProgress: (line: string) => void;
  }): Promise<void>;
}

// ── 默认真实现 ─────────────────────────────────────────────────────────────────
function execFileAsync(
  file: string,
  args: string[],
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { signal, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${path.basename(file)} 失败: ${stderr?.slice(0, 400) || err.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function whichBinary(name: string): Promise<string | null> {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, [name], new AbortController().signal);
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

/**
 * 渲染用 Chromium = playwright 已装浏览器(douyin-cdp/T-173 同一份缓存:
 * Mac ~/Library/Caches/ms-playwright,桌面包 bundlePlaywright 同源)。**包名拼接**
 * 避开 Next 构建期静态解析(douyin-cdp 同款手法)。
 */
async function resolvePlaywrightChromium(): Promise<string> {
  try {
    const modName = ["@playwright", "/test"].join("");
    const { chromium } = (await import(/* webpackIgnore: true */ modName)) as {
      chromium: { executablePath(): string };
    };
    const p = chromium.executablePath();
    const stat = await fs.stat(p).catch(() => null);
    if (stat?.isFile()) return p;
  } catch {
    // fallthrough → 诚实报错
  }
  throw new Error(
    "渲染用 Chromium 未就绪:请先在「采集/扫码」功能触发一次浏览器下载(playwright install chromium),再重试渲染",
  );
}

/** 解析 npm 包磁盘路径(运行时解析,包名拼接防打包器静态追踪)。 */
function resolvePkgFile(pkgParts: string[], relFile: string): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve(pkgParts.join("") + "/package.json");
  return path.join(path.dirname(pkgJson), relFile);
}

async function renderWithHyperframesCli(opts: {
  projectDir: string;
  outputFile: string;
  fps: number;
  chromiumPath: string;
  signal: AbortSignal;
  onProgress: (line: string) => void;
}): Promise<void> {
  // hyperframes CLI:bin = dist/cli.js(package.json 无 exports 字段,直接 join)。
  const cliJs = resolvePkgFile(["hyper", "frames"], "dist/cli.js");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliJs, "render", opts.projectDir, "--output", opts.outputFile, "--fps", String(opts.fps)],
      {
        env: {
          ...process.env,
          HYPERFRAMES_BROWSER_PATH: opts.chromiumPath,
          HYPERFRAMES_TELEMETRY: "0",
          // CLI 交互态探测走 TTY;子进程无 TTY 天然非交互。
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let lastErr = "";
    const onData = (buf: Buffer): void => {
      const text = buf.toString("utf8");
      lastErr = text.slice(-800);
      // 进度行形如 "Capturing frame 120/300" —— 抽给步骤流
      const m = /Capturing frame (\d+)\/(\d+)/.exec(text);
      if (m) opts.onProgress(`捕帧 ${m[1]}/${m[2]}`);
      else if (text.includes("Encoding video")) opts.onProgress("编码中");
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const onAbort = (): void => {
      child.kill("SIGKILL"); // abort 贯通到子进程(T-239c 模式)
    };
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => {
      opts.signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("exit", (code, sig) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (opts.signal.aborted) reject(new Error("渲染已中止"));
      else if (code === 0) resolve();
      else
        reject(
          new Error(
            `hyperframes render 退出码 ${code ?? sig}: ${lastErr.replace(/\s+/g, " ").trim().slice(-300)}`,
          ),
        );
    });
  });
}

export function createDefaultVideoRenderEngine(): VideoRenderEngine {
  return {
    findBinary: whichBinary,
    async probeVideo(ffprobe, file, signal) {
      const { stdout } = await execFileAsync(
        ffprobe,
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name",
          "-show_entries",
          "format=duration",
          "-of",
          "json",
          file,
        ],
        signal,
      );
      const parsed = JSON.parse(stdout) as {
        streams?: Array<{ codec_name?: string }>;
        format?: { duration?: string };
      };
      const codec = parsed.streams?.[0]?.codec_name;
      const durationSec = Number(parsed.format?.duration ?? NaN);
      if (!codec || !Number.isFinite(durationSec)) {
        throw new Error(`ffprobe 未识别出视频流: ${path.basename(file)}`);
      }
      return { codec, durationSec };
    },
    async runFfmpeg(ffmpeg, args, signal) {
      await execFileAsync(ffmpeg, args, signal);
    },
    resolveChromium: resolvePlaywrightChromium,
    async resolveGsapFile() {
      return resolvePkgFile(["g", "sap"], "dist/gsap.min.js");
    },
    renderComposition: renderWithHyperframesCli,
  };
}

// ── executor 本体 ──────────────────────────────────────────────────────────────
const FFMPEG_INSTALL_HINT =
  process.platform === "darwin"
    ? "brew install ffmpeg"
    : process.platform === "linux"
      ? "sudo apt install ffmpeg"
      : "https://ffmpeg.org/download.html";

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("渲染已中止");
  }
}

/** 媒体文件名 → work/media/ 下的安全落名(保留原名;proxy 统一 .mp4)。 */
function proxyNameFor(mountAs: string): string {
  const base = path.basename(mountAs).replace(/[^A-Za-z0-9._-]/g, "_");
  return base.replace(/\.[^.]*$/, "") + ".mp4";
}
function imageNameFor(mountAs: string): string {
  return path.basename(mountAs).replace(/[^A-Za-z0-9._-]/g, "_");
}

export function createVideoRenderExecutor(
  engine: VideoRenderEngine = createDefaultVideoRenderEngine(),
): ExecutionExecutor {
  return {
    taskType: "video.render",
    paramsSchema: videoRenderParams, // spec.params = { props };goal 由编排 parse 后才混入
    async run(sandbox: ExecutorSandboxView, params, opts: ExecutorRunOpts) {
      const { signal, reportStep } = opts;
      const props = (params as { props: VideoRenderProps }).props;

      // 0) 工具链检测(缺 ffmpeg → 诚实报错引导安装,不打包 ffmpeg-static)
      await reportStep("检测工具链(ffmpeg/ffprobe/Chromium)");
      const [ffmpeg, ffprobe] = await Promise.all([
        engine.findBinary("ffmpeg"),
        engine.findBinary("ffprobe"),
      ]);
      if (!ffmpeg || !ffprobe) {
        throw new Error(
          `未检测到系统 ffmpeg/ffprobe(视频渲染必需)。请安装后重试:${FFMPEG_INSTALL_HINT}`,
        );
      }
      const chromiumPath = await engine.resolveChromium();
      throwIfAborted(signal);

      // 1) 输入核对:props 引用的每个文件必须已物化在 input/(路径防护同沙箱)
      const media = collectMediaFiles(props);
      const allFiles = [...media.videos, ...media.images];
      for (const f of allFiles) {
        const abs = resolveInsideDir(sandbox.inputDir, f);
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat?.isFile()) {
          throw new Error(`props 引用的素材未物化到沙箱: ${f}(检查任务 inputs.mountAs)`);
        }
      }

      // 2) 工程目录:work/(index.html + gsap + media/);产物只认 out/
      const workDir = path.join(sandbox.dir, "work");
      const mediaDir = path.join(workDir, "media");
      await fs.mkdir(mediaDir, { recursive: true });

      // 3) 素材预处理:视频统一转 H.264 proxy(短 GOP -g 30,捕帧 seek 稳定;HEVC 等
      //    非 h264 编码这里一并归一)。图片直拷。文件名映射喂给模板。
      const nameMap = new Map<string, string>();
      for (const f of media.videos) {
        throwIfAborted(signal);
        const src = resolveInsideDir(sandbox.inputDir, f);
        const probe = await engine.probeVideo(ffprobe, src, signal);
        const outName = proxyNameFor(f);
        nameMap.set(f, outName);
        await reportStep(
          `预处理 ${f}(${probe.codec} ${probe.durationSec.toFixed(1)}s → h264 proxy,-g 30)`,
        );
        await engine.runFfmpeg(
          ffmpeg,
          [
            "-y",
            "-i",
            src,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-g",
            "30",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            path.join(mediaDir, outName),
          ],
          signal,
        );
      }
      for (const f of media.images) {
        const outName = imageNameFor(f);
        nameMap.set(f, outName);
        await fs.copyFile(resolveInsideDir(sandbox.inputDir, f), path.join(mediaDir, outName));
      }

      // 4) 模板生成 index.html(props 内文件引用替换为 media/ 落名)+ gsap 落盘
      await reportStep("生成合成模板 index.html");
      const rename = (f: string): string => nameMap.get(f) ?? f;
      const renamedProps: VideoRenderProps = {
        ...props,
        talkingHead: { ...props.talkingHead, file: rename(props.talkingHead.file) },
        broll: props.broll.map((b) => ({ ...b, file: rename(b.file) })),
        scenes: props.scenes.map((s) => ({
          ...s,
          cards: s.cards.map((c) => (c.kind === "image" ? { ...c, file: rename(c.file) } : c)),
        })),
      };
      const html = generateVideoRenderHtml(renamedProps, { mediaPrefix: "media/" });
      await fs.writeFile(path.join(workDir, "index.html"), html, "utf8");
      await fs.copyFile(await engine.resolveGsapFile(), path.join(workDir, "gsap.min.js"));

      // 5) HyperFrames 渲染(帧捕获;abort → kill 子进程)
      throwIfAborted(signal);
      await reportStep(
        `HyperFrames 渲染(${props.delivery.width}x${props.delivery.height}/${props.delivery.fps}fps,${props.talkingHead.durationSec.toFixed(1)}s)`,
      );
      const rawFile = path.join(workDir, "render_raw.mp4");
      let lastReported = "";
      await engine.renderComposition({
        projectDir: workDir,
        outputFile: rawFile,
        fps: props.delivery.fps,
        chromiumPath,
        signal,
        onProgress: (line) => {
          if (line === lastReported) return;
          lastReported = line;
          void reportStep(line).catch(() => {});
        },
      });

      // 6) 交付转码(固定命令:H.264/yuv420p/bt709/faststart —— 平台兼容基线)
      throwIfAborted(signal);
      await reportStep("交付转码(H.264/yuv420p/bt709/faststart)");
      const finalFile = path.join(sandbox.outDir, "final.mp4");
      await engine.runFfmpeg(
        ffmpeg,
        [
          "-y",
          "-i",
          rawFile,
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-colorspace",
          "bt709",
          "-color_primaries",
          "bt709",
          "-color_trc",
          "bt709",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          finalFile,
        ],
        signal,
      );

      return {
        summary: `成片 final.mp4(${props.talkingHead.durationSec.toFixed(1)}s,${props.delivery.width}x${props.delivery.height}/${props.delivery.fps}fps,${props.scenes.length} 场景)`,
        meta: {
          durationSec: props.talkingHead.durationSec,
          sceneCount: props.scenes.length,
          brollCount: props.broll.length,
          captionCount: props.captions.length,
        },
      };
    },
  };
}
