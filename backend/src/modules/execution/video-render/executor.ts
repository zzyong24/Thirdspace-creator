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
import * as path from "node:path";
import { resolveExecutablePath } from "@creatoros/ai-worker";
import {
  videoRenderParams,
  type RequestContext,
  type VideoRenderProps,
} from "@creatoros/contract";
import { buildChildEnv } from "../child-env";
import type { ExecutionExecutor, ExecutorRunOpts, ExecutorSandboxView } from "../executor-registry";
import { resolveInsideDir } from "../sandbox";
import {
  assertVideoLayoutSafety,
  collectMediaFiles,
  generateVideoRenderHtml,
} from "./template";

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
  /**
   * 解析渲染用 Chromium(playwright 已装);[T-281] 未装 → **自动下载**(playwright install
   * chromium,与 douyin-cdp/T-173 同源;带诚实进度回调,不静默、不逼用户先去别处扫码)。
   * onProgress:下载进度/阶段回给步骤流(可选)。
   */
  resolveChromium(onProgress?: (line: string) => void): Promise<string>;
  /** 解析 gsap.min.js 磁盘路径(npm gsap 包)。 */
  resolveGsapFile(): Promise<string>;
  /** hyperframes CLI 渲染 work/ → outputFile;进度回调喂步骤流。 */
  renderComposition(opts: {
    projectDir: string;
    outputFile: string;
    fps: number;
    chromiumPath: string;
    ffmpegPath: string;
    ffprobePath: string;
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
      // [RT-H06] env 收窄:ffprobe/ffmpeg/which 子进程只拿运行必需变量,
      // 密钥/DB/S3/master key 不进子进程(见 child-env.ts)。
      // [T-372 W5] windowsHide:Win 打包态 sidecar 无 console,spawn console 程序会闪黑窗。
      { signal, maxBuffer: 16 * 1024 * 1024, env: buildChildEnv(), windowsHide: true },
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

async function resolveMediaBinary(
  name: "ffmpeg" | "ffprobe",
): Promise<string | null> {
  return resolveExecutablePath(name, {
    explicitEnvVar:
      name === "ffmpeg"
        ? "CREATOROS_FFMPEG_PATH"
        : "CREATOROS_FFPROBE_PATH",
    bundled: true,
  });
}

/**
 * [T-284 修] **确定性兜底**:直接扫 PLAYWRIGHT_BROWSERS_PATH(instrumentation 设的随包
 * Chromium 目录)下的 `chromium-<rev>/<平台>/…` 二进制,不依赖 playwright 的 `executablePath()`。
 * 根因:随包 Chromium 就位、PLAYWRIGHT_BROWSERS_PATH 也设了、脱离 bundle 的忠实测试里
 * `executablePath()` 都命中——但打包混淆 runtime 里 executor 的 `executablePath()` 仍返回不到
 * (bundle 运行时的 playwright registry 路径解析脆弱),locate 的 try/catch 把错吞了 → 「未就绪」。
 * 这里不走 playwright registry,按已知目录结构自己拼路径,稳。
 */
async function locateBundledChromium(): Promise<string | null> {
  const browsersDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.cwd(), "browsers");
  try {
    const entries = await fs.readdir(browsersDir).catch(() => [] as string[]);
    // headed chromium-<rev>(executablePath 返回的那个;hyperframes 用它)。取最大 rev。
    const dir = entries
      .filter((e) => /^chromium-\d+$/.test(e))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))[0];
    if (!dir) return null;
    // 各平台二进制子路径(mac arm64 / mac x64 / linux / win)。
    const rels = [
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-linux/chrome",
      "chrome-win/chrome.exe",
    ];
    for (const rel of rels) {
      const p = path.join(browsersDir, dir, rel);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isFile()) return p;
    }
  } catch {
    // fall through → null
  }
  return null;
}

/**
 * 本地开发 / 回归脚本兜底：复用机器上已经安装的 Chromium 系浏览器。
 *
 * 正式安装包仍优先使用随包浏览器；这里只解决源码运行时并未安装
 * `@playwright/test`、但系统 Chrome/Edge 明明可用却被误报“Chromium 未就绪”的问题。
 */
export async function locateSystemChromium(): Promise<string | null> {
  const candidates = [
    process.env.CREATOROS_RENDER_CHROMIUM_PATH,
    process.env.CHROME_PATH,
    ...(process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "win32"
        ? [
            process.env.PROGRAMFILES
              ? path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
              : undefined,
            process.env["PROGRAMFILES(X86)"]
              ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
              : undefined,
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ]),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  return null;
}

/**
 * 渲染用 Chromium 定位:先确定性扫随包目录(T-284,打包版稳),再回落 playwright
 * `executablePath()`(dev / 系统缓存路径)。都拿不到 → null(调用方走注入下载兜底)。
 */
async function locatePlaywrightChromium(): Promise<string | null> {
  // ① 随包目录确定性命中(打包版主路径,不依赖 bundle runtime 的 playwright registry)。
  const bundled = await locateBundledChromium();
  if (bundled) return bundled;
  // ② 源码开发 / 回归脚本复用系统 Chrome；不要求额外安装一份 Playwright 浏览器。
  const system = await locateSystemChromium();
  if (system) return system;
  // ③ 回落 playwright executablePath(dev 装在系统缓存;混淆 runtime 里可能失效,故仅兜底)。
  try {
    const modName = ["@playwright", "/test"].join("");
    const { chromium } = (await import(/* webpackIgnore: true */ modName)) as {
      chromium: { executablePath(): string };
    };
    const p = chromium.executablePath();
    const stat = await fs.stat(p).catch(() => null);
    if (stat?.isFile()) return p;
  } catch (err) {
    // [T-284] 打包版这里常被吞;打一行诊断(万一兜底也没命中,日志能看到真因)。
    console.warn(
      `[video-render] playwright executablePath 兜底失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return null;
}

/**
 * [T-281 修回归] Chromium 未就绪时的**下载器**由组合根注入(不在本 executor 里 resolve
 * playwright)。根因:playwright 的 CLI 定位只能在 **frontend 上下文**做——
 *   · 字面量 `require.resolve("playwright/package.json")` → Turbopack 被 playwright 的 exports
 *     挡住 → **build error**(hyperframes 无 exports 才能字面量);
 *   · 包名拼接动态串藏过静态解析,但在 executor 所在的 `@creatoros/backend` chunk 里,
 *     `createRequire(import.meta.url)` 的解析基准指向 bundled chunk → 运行时「Cannot find
 *     module as expression is too dynamic」(用户实测)。
 * douyin-cdp 的 ensureChromiumInstalled 在 frontend/src/server(解析基准对、历史验证可下载),
 * 组合根 persistence-client 把它经 deps.downloadChromium 注入进来即可。未注入 → 诚实报错引导。
 */
export type ChromiumDownloader = (
  onProgress?: (line: string) => void,
) => Promise<void>;

/**
 * 可选成片视觉审核端口。模型调用只发生在组合根注入的 brain port；executor 自身不持有
 * provider/key，也不让渲染子进程联网。未配置或调用失败只记录审核状态，不阻断出片。
 */
export type VideoVisualReviewer = (
  ctx: RequestContext,
  input: { bytes: Uint8Array; mimeType: "image/jpeg"; prompt: string },
) => Promise<string | null>;

export interface VideoVisualReview {
  status: "reviewed" | "skipped" | "unavailable";
  verdict?: "pass" | "warn";
  summary: string;
  issues: Array<{
    code: string;
    message: string;
    severity: "warning" | "error";
  }>;
}

export function parseVideoVisualReview(raw: string): VideoVisualReview | null {
  const match = raw.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]) as Record<string, unknown>;
    const verdict = value.verdict === "pass" ? "pass" : value.verdict === "warn" ? "warn" : null;
    const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 240) : "";
    const issues = Array.isArray(value.issues)
      ? value.issues
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const issue = item as Record<string, unknown>;
            const code = typeof issue.code === "string" ? issue.code.trim().slice(0, 60) : "";
            const message =
              typeof issue.message === "string" ? issue.message.trim().slice(0, 240) : "";
            if (!code || !message) return null;
            return {
              code,
              message,
              severity: issue.severity === "error" ? ("error" as const) : ("warning" as const),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .slice(0, 8)
      : [];
    if (!verdict || !summary) return null;
    return { status: "reviewed", verdict, summary, issues };
  } catch {
    return null;
  }
}

const VIDEO_VISUAL_REVIEW_PROMPT = [
  "你是短视频成片质检员。下面是一张按时间顺序排列的 4×2 成片抽帧接触表。",
  "只检查可直接从画面判断的问题：B-roll 是否过小、黑边是否过大、是否遮挡或切掉人物脸、界面文字是否不可读、主画面与人物是否重叠、布局是否像静态大卡而缺少剪辑层次。",
  "不要评价脚本文案，不要猜测没有出现在抽帧里的内容。",
  "只输出 JSON：",
  '{"verdict":"pass|warn","summary":"一句中文结论","issues":[{"code":"face_occlusion|tiny_visual|excessive_letterbox|unreadable_ui|layout_overlap|static_editing","severity":"warning|error","message":"具体中文问题"}]}',
].join("\n");

async function resolvePlaywrightChromium(
  onProgress?: (line: string) => void,
  download?: ChromiumDownloader,
): Promise<string> {
  const found = await locatePlaywrightChromium();
  if (found) return found;
  // [T-281] 注入了下载器 → 自动下载(带诚实进度),再解析一次;没注入 → 诚实报错引导。
  if (download) {
    await download(onProgress);
    const after = await locatePlaywrightChromium();
    if (after) return after;
  }
  throw new Error(
    "渲染用 Chromium 未就绪 —— 请在终端执行 `npx playwright install chromium`,或先在「抖音号」页扫码采集一次(会自动下载),再重试渲染",
  );
}

/**
 * [T-289 真机逮到根因] 确定性 fs 定位 node_modules 里的文件 —— **不用 require.resolve**。
 * 病根:executor 打进 Next 混淆 bundle 后,`createRequire(import.meta.url).resolve("gsap/
 * package.json")` 被 Turbopack 转换,**返回 webpack 数字模块 ID(如 371609)而非文件路径**
 * → `path.dirname(371609)` 抛「The "path" argument must be of type string. Received type
 * number (371609)」——这正是用户实测「视频渲染卡了好久」的根,渲染在「生成合成模板」步崩(
 * 步骤流实锤 step6);dev 里同一 resolve 返回 `[externals]/gsap/package.json` 占位同样坏。
 * (T-254c 以为「字面量 specifier + serverExternalPackages」能修,实际打包混淆 runtime 仍坏。)
 *
 * 正解:从 process.cwd()(sidecar/frontend)起,按 `node_modules/<pkg>/<sub>` 及
 * `node_modules/.pnpm/<pkg>@ver/node_modules/<pkg>/<sub>` 直接扫真实文件。build-sidecar 已实拷
 * 完整 gsap/hyperframes(含 dist),这里保证运行时定位到。
 */
async function locateNodeModuleFile(
  pkg: string,
  sub: string,
): Promise<string | null> {
  const isFile = (p: string) =>
    fs.stat(p).then((s) => s.isFile()).catch(() => false);
  const roots = [
    path.join(process.cwd(), "node_modules"),
    path.resolve(process.cwd(), "..", "node_modules"), // sidecar/node_modules(frontend 的父)
    // [T-565] Windows 少文件 runtime 不再携带 node_modules。渲染器是磁盘 CLI，
    // 不能只靠 Node resolver；从壳注入的 runtime root 直接定位分层 vendor。
    ...(process.env.CREATOROS_RUNTIME_ROOT
      ? [
          path.join(
            process.env.CREATOROS_RUNTIME_ROOT,
            "layers",
            "core",
            "render",
            "vendor",
          ),
          path.join(
            process.env.CREATOROS_RUNTIME_ROOT,
            "frontend",
            ".next",
            "vendor",
          ),
        ]
      : []),
  ];
  for (const root of roots) {
    const direct = path.join(root, pkg, sub);
    if (await isFile(direct)) return direct;
    const pnpm = path.join(root, ".pnpm");
    const entries = await fs.readdir(pnpm).catch(() => [] as string[]);
    for (const e of entries.filter((x) => x.startsWith(`${pkg}@`))) {
      const p = path.join(pnpm, e, "node_modules", pkg, sub);
      if (await isFile(p)) return p;
    }
  }
  return null;
}

/** hyperframes CLI(dist/cli.js)磁盘路径 —— 确定性 fs 定位(不用 require.resolve,见上注释)。 */
async function resolveHyperframesCli(): Promise<string> {
  const p = await locateNodeModuleFile("hyperframes", "dist/cli.js");
  if (!p) {
    throw new Error(
      "渲染引擎 hyperframes(dist/cli.js)未找到 —— 打包实拷缺失,请重打包(desktop:package)",
    );
  }
  return p;
}

/** gsap 单文件(dist/gsap.min.js)磁盘路径 —— 确定性 fs 定位(同上)。 */
async function resolveGsapMinJs(): Promise<string> {
  const p = await locateNodeModuleFile("gsap", "dist/gsap.min.js");
  if (!p) {
    throw new Error(
      "渲染动效依赖 gsap(dist/gsap.min.js)未找到 —— 打包实拷缺失,请重打包(desktop:package)",
    );
  }
  return p;
}

async function renderWithHyperframesCli(opts: {
  projectDir: string;
  outputFile: string;
  fps: number;
  chromiumPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  signal: AbortSignal;
  onProgress: (line: string) => void;
}): Promise<void> {
  const cliJs = await resolveHyperframesCli();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliJs, "render", opts.projectDir, "--output", opts.outputFile, "--fps", String(opts.fps)],
      {
        // [RT-H06] env 收窄(修「子进程继承全量 process.env」):hyperframes CLI 及其
        // 再起的 Chromium 只拿运行必需变量 + 两个任务级显式变量;模型 key/DB/S3/
        // master key/NODE_OPTIONS 一律不透传(见 child-env.ts allowlist)。
        env: buildChildEnv({
          HYPERFRAMES_BROWSER_PATH: opts.chromiumPath,
          // HyperFrames 0.7.x 只识别自己的显式路径变量。Windows 上仅把随包
          // media/bin 塞进 PATH 会受 Path/PATH 大小写与 where.exe 解析影响，
          // 因此把已经验证可执行的绝对路径直接交给它。
          HYPERFRAMES_FFMPEG_PATH: opts.ffmpegPath,
          HYPERFRAMES_FFPROBE_PATH: opts.ffprobePath,
          HYPERFRAMES_TELEMETRY: "0",
          // CLI 交互态探测走 TTY;子进程无 TTY 天然非交互。
        }),
        stdio: ["ignore", "pipe", "pipe"],
        // [T-372 W5] windowsHide:Win 打包态 sidecar 无 console,spawn node.exe(console
        // 子系统)会闪黑窗;其下 Chromium 由 hyperframes 以 headless 起,无窗口面。
        windowsHide: true,
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

export function createDefaultVideoRenderEngine(
  // [T-281] Chromium 下载器由组合根(frontend)注入(见 ChromiumDownloader 注释);缺省 =
  //   不注入 → resolveChromium 未装时诚实报错引导(不在 backend 里 resolve playwright)。
  opts?: { downloadChromium?: ChromiumDownloader },
): VideoRenderEngine {
  return {
    findBinary: resolveMediaBinary,
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
    resolveChromium: (onProgress) =>
      resolvePlaywrightChromium(onProgress, opts?.downloadChromium),
    async resolveGsapFile() {
      return resolveGsapMinJs();
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
function imageNameFor(mountAs: string, mimeType?: string | null): string {
  const base = path.basename(mountAs).replace(/[^A-Za-z0-9._-]/g, "_");
  if (path.extname(base)) return base;
  const normalized = mimeType?.split(";", 1)[0]?.toLowerCase();
  const extension =
    normalized === "image/jpeg"
      ? ".jpg"
      : normalized === "image/webp"
        ? ".webp"
        : normalized === "image/gif"
          ? ".gif"
          : normalized === "image/avif"
            ? ".avif"
            : ".png";
  return `${base}${extension}`;
}

export function createVideoRenderExecutor(
  engine: VideoRenderEngine = createDefaultVideoRenderEngine(),
  options?: { reviewVisuals?: VideoVisualReviewer },
): ExecutionExecutor {
  return {
    taskType: "video.render",
    // [RT-H06] 网络姿态:渲染链(ffmpeg/hyperframes/Chromium)只处理沙箱本地文件,
    // 不主动出网(模板只引用 work/media/ 本地文件 + 本地 gsap)。诚实边界:无 OS 级
    // 网络沙箱,Chromium 理论上能访问网络 —— 但子进程 env 已收窄,进程树里没有任何
    // 密钥可外传(见编排 network 门 + child-env.ts)。
    networkPosture: options?.reviewVisuals ? "brain-ports" : "none",
    paramsSchema: videoRenderParams, // spec.params = { props };goal 由编排 parse 后才混入
    async run(sandbox: ExecutorSandboxView, params, opts: ExecutorRunOpts) {
      const { signal, reportStep } = opts;
      const props = (params as { props: VideoRenderProps }).props;

      // 0) 工具链检测：正式桌面包优先使用随包 ffmpeg/ffprobe；开发态再回落系统安装。
      await reportStep("检测工具链(ffmpeg/ffprobe/Chromium)");
      const [ffmpeg, ffprobe] = await Promise.all([
        engine.findBinary("ffmpeg"),
        engine.findBinary("ffprobe"),
      ]);
      if (!ffmpeg || !ffprobe) {
        throw new Error(
          "随包渲染组件 ffmpeg/ffprobe 缺失或不可用。" +
            "请先重新安装最新版应用；开发环境可安装后重试:" +
            FFMPEG_INSTALL_HINT,
        );
      }
      // [T-281] Chromium 未装 → 引擎自动下载(playwright install chromium),进度回步骤流
      // (不再直接报错逼用户先去抖音扫码;下载 ~340MB 有诚实进度,装过秒过)。
      const chromiumPath = await engine.resolveChromium((line) => {
        void reportStep(line).catch(() => {});
      });
      throwIfAborted(signal);

      // 1) 输入核对:props 引用的每个文件必须已物化在 input/(路径防护同沙箱)
      const inputMimeTypes = new Map(
        sandbox.inputs.map((input) => [input.mountAs, input.mimeType] as const),
      );
      const media = collectMediaFiles(props, inputMimeTypes);
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
        const outName = imageNameFor(f, inputMimeTypes.get(f));
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
      await reportStep("检查主画面可读面积与人物遮挡安全区");
      assertVideoLayoutSafety(renamedProps);
      const html = generateVideoRenderHtml(renamedProps, {
        mediaPrefix: "media/",
        imageFiles: new Set(media.images.map(rename)),
      });
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
        ffmpegPath: ffmpeg,
        ffprobePath: ffprobe,
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

      let visualReview: VideoVisualReview = {
        status: "skipped",
        summary: "未配置视觉模型，已完成确定性布局与遮挡校验。",
        issues: [],
      };
      if (options?.reviewVisuals && opts.ctx) {
        try {
          await reportStep("抽帧进行成片视觉审核(不阻断出片)");
          const contactSheet = path.join(workDir, "visual-review.jpg");
          const interval = Math.max(1, props.talkingHead.durationSec / 8);
          await engine.runFfmpeg(
            ffmpeg,
            [
              "-y",
              "-i",
              finalFile,
              "-vf",
              `fps=1/${interval.toFixed(3)},scale=480:-2,tile=4x2:padding=0:margin=0`,
              "-frames:v",
              "1",
              contactSheet,
            ],
            signal,
          );
          const raw = await options.reviewVisuals(opts.ctx, {
            bytes: await fs.readFile(contactSheet),
            mimeType: "image/jpeg",
            prompt: VIDEO_VISUAL_REVIEW_PROMPT,
          });
          if (raw) {
            visualReview =
              parseVideoVisualReview(raw) ?? {
                status: "unavailable",
                summary: "视觉模型返回格式不可解析，成片仍已正常生成。",
                issues: [],
              };
          }
        } catch (err) {
          visualReview = {
            status: "unavailable",
            summary: `视觉审核暂不可用：${err instanceof Error ? err.message : String(err)}`.slice(0, 260),
            issues: [],
          };
        }
      }

      return {
        summary: `成片 final.mp4(${props.talkingHead.durationSec.toFixed(1)}s,${props.delivery.width}x${props.delivery.height}/${props.delivery.fps}fps,${props.scenes.length} 场景)`,
        meta: {
          durationSec: props.talkingHead.durationSec,
          sceneCount: props.scenes.length,
          brollCount: props.broll.length,
          captionCount: props.captions.length,
          visualReview,
        },
      };
    },
  };
}
