// [T-254a] video.render executor(HyperFrames 确定性渲染,SPEC 2026-07-11
// execution-layer-video-pipeline §3.1 步骤4)。
//
// 步骤流:素材预处理(ffprobe 探针 → 安全 H.264 无损 remux /其他格式一次高质量 mezzanine)
// → 模板生成 index.html 落沙箱 work/ → HyperFrames CLI 进行唯一一次正式视频编码
// → 最终文件只做 stream-copy faststart remux → ffprobe 交付硬门
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
import { copyFileCopyOnWrite } from "../../../lib/copy-file-copy-on-write";
import {
  assertVideoLayoutSafety,
  collectMediaFiles,
  generateVideoRenderHtml,
} from "./template";

// ── 可注入的引擎面(测试 fake 掉,不碰真 ffmpeg/真浏览器/真渲染)────────────────────
export interface VideoProbe {
  codec: string;
  profile: string | null;
  width: number | null;
  height: number | null;
  pixFmt: string | null;
  avgFrameRate: string | null;
  rFrameRate: string | null;
  colorSpace: string | null;
  colorPrimaries: string | null;
  colorTransfer: string | null;
  bitRate: number | null;
  durationSec: number;
  streamDurationSec?: number | null;
  formatDurationSec?: number | null;
  formatSizeBytes?: number | null;
  videoPacketBytes?: number | null;
}

export interface VideoRenderEngine {
  /** 系统 ffmpeg/ffprobe 检测(which);缺失 → null(executor 诚实报错引导安装)。 */
  findBinary(name: "ffmpeg" | "ffprobe"): Promise<string | null>;
  /** ffprobe 探针:正式输入兼容判断所需的视频流元数据。 */
  probeVideo(
    ffprobe: string,
    file: string,
    signal: AbortSignal,
  ): Promise<VideoProbe>;
  /** 最终交付探针；stream.bit_rate 缺失时额外统计 v:0 packet bytes。 */
  probeDelivery(
    ffprobe: string,
    file: string,
    signal: AbortSignal,
  ): Promise<VideoProbe>;
  /** FFmpeg 全流解码 smoke；坏流返回 false，中止仍抛出。 */
  verifyFfmpegDecode(
    ffmpeg: string,
    file: string,
    signal: AbortSignal,
  ): Promise<boolean>;
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
    quality: "high";
    videoBitrate: string;
    videoFrameFormat: "png";
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
          reject(
            new Error(
              `${path.basename(file)} 失败: ${formatMediaProcessError(stderr, err.message)}`,
            ),
          );
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

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * [T-845] Windows 少文件 runtime 把 HyperFrames 与其 external 依赖放在并列 vendor
 * 层，Node 原生 walk-up 无法解析。主 server 的 module hook 不会继承到新 Node 进程，
 * 所以正式渲染必须像 closure RAT 一样显式 `--require` 同一 resolver。
 *
 * 传统 node_modules / 开发态不使用分层 vendor，保持原 argv，避免把 Windows 专属
 * runtime 契约强加给 macOS 与源码运行。NODE_OPTIONS 仍不透传，安全边界不变。
 */
export async function buildHyperframesProcessArgs(
  cliJs: string,
  cliArgs: readonly string[],
  runtimeRoot: string | undefined = process.env.CREATOROS_RUNTIME_ROOT,
): Promise<string[]> {
  if (!runtimeRoot) return [cliJs, ...cliArgs];

  const renderVendorRoot = path.join(
    runtimeRoot,
    "layers",
    "core",
    "render",
    "vendor",
  );
  if (!isPathInside(renderVendorRoot, cliJs)) {
    return [cliJs, ...cliArgs];
  }

  const resolver = path.join(
    runtimeRoot,
    "frontend",
    "creatoros-module-resolver.cjs",
  );
  const resolverStat = await fs.stat(resolver).catch(() => null);
  if (!resolverStat?.isFile()) {
    throw new Error(
      "Windows 分层渲染运行时缺少模块解析器，请重新安装最新版应用后再制作视频。",
    );
  }
  return ["--require", resolver, cliJs, ...cliArgs];
}

function redactHyperframesDiagnostic(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED]")
    .replace(
      /((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/gi, "$1[USER]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[USER]")
    .replace(/\/home\/[^/\s]+/g, "/home/[USER]")
    .replace(/\s+/g, " ")
    .trim();
}

/** 保留 Node 错误首部的缺失包名和尾部错误码，同时限制长度并隐藏本机用户名。 */
export function formatHyperframesProcessError(head: string, tail: string): string {
  const safeHead = redactHyperframesDiagnostic(head).slice(0, 500);
  const safeTail = redactHyperframesDiagnostic(tail).slice(-500);
  if (!safeHead) return safeTail || "渲染子进程未返回错误详情";
  if (!safeTail || safeHead === safeTail || safeHead.endsWith(safeTail)) return safeHead;
  return `${safeHead} … ${safeTail}`;
}

/**
 * FFmpeg/ffprobe 把版本横幅放在 stderr 首部、真正的滤镜/解码错误放在尾部。
 * 不能再只截前 400 字；这里复用同一脱敏规则，保留首尾且限制持久化长度。
 */
export function formatMediaProcessError(
  stderr: string,
  fallback: string,
): string {
  const safe = redactHyperframesDiagnostic(stderr);
  if (!safe) {
    return (
      redactHyperframesDiagnostic(fallback) || "媒体进程未返回错误详情"
    );
  }
  const head = safe.slice(0, 500);
  const tail = safe.slice(-1_000);
  if (head === tail || head.endsWith(tail)) return head;
  return `${head} … ${tail}`;
}

async function renderWithHyperframesCli(opts: {
  projectDir: string;
  outputFile: string;
  fps: number;
  quality: "high";
  videoBitrate: string;
  videoFrameFormat: "png";
  chromiumPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  signal: AbortSignal;
  onProgress: (line: string) => void;
}): Promise<void> {
  const cliJs = await resolveHyperframesCli();
  const cliArgs = await buildHyperframesProcessArgs(
    cliJs,
    [
      "render",
      opts.projectDir,
      "--output",
      opts.outputFile,
      "--fps",
      String(opts.fps),
      "--quality",
      opts.quality,
      "--video-bitrate",
      opts.videoBitrate,
      "--video-frame-format",
      opts.videoFrameFormat,
    ],
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      cliArgs,
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
          // resolver 虽能从自身 __dirname 推导根目录，仍显式传递同一绝对 root，
          // 避免安装目录重排时 resolver 与 executor 对分层根产生不同理解。
          ...(process.env.CREATOROS_RUNTIME_ROOT
            ? { CREATOROS_RUNTIME_ROOT: process.env.CREATOROS_RUNTIME_ROOT }
            : {}),
          // CLI 交互态探测走 TTY;子进程无 TTY 天然非交互。
        }),
        stdio: ["ignore", "pipe", "pipe"],
        // [T-372 W5] windowsHide:Win 打包态 sidecar 无 console,spawn node.exe(console
        // 子系统)会闪黑窗;其下 Chromium 由 hyperframes 以 headless 起,无窗口面。
        windowsHide: true,
      },
    );
    let errorHead = "";
    let errorTail = "";
    const onData = (buf: Buffer): void => {
      const text = buf.toString("utf8");
      if (errorHead.length < 2_000) {
        errorHead = `${errorHead}${text}`.slice(0, 2_000);
      }
      errorTail = `${errorTail}${text}`.slice(-2_000);
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
            `hyperframes render 退出码 ${code ?? sig}: ${formatHyperframesProcessError(errorHead, errorTail)}`,
          ),
        );
    });
  });
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function probeVideoMetadata(
  ffprobe: string,
  file: string,
  signal: AbortSignal,
): Promise<VideoProbe> {
  const { stdout } = await execFileAsync(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,profile,width,height,pix_fmt,avg_frame_rate,r_frame_rate,color_space,color_primaries,color_transfer,bit_rate,duration:format=duration,size",
      "-of",
      "json",
      file,
    ],
    signal,
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const stream = parsed.streams?.[0];
  const codec = typeof stream?.codec_name === "string" ? stream.codec_name : "";
  const streamDurationSec = finiteNumber(stream?.duration);
  const formatDurationSec = finiteNumber(parsed.format?.duration);
  const durationSec = streamDurationSec ?? formatDurationSec;
  if (!codec || durationSec == null || durationSec <= 0) {
    throw new Error(`PROBE_INVALID: ffprobe 未识别出有效视频流 ${path.basename(file)}`);
  }
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    codec,
    profile: text(stream?.profile),
    width: finiteNumber(stream?.width),
    height: finiteNumber(stream?.height),
    pixFmt: text(stream?.pix_fmt),
    avgFrameRate: text(stream?.avg_frame_rate),
    rFrameRate: text(stream?.r_frame_rate),
    colorSpace: text(stream?.color_space),
    colorPrimaries: text(stream?.color_primaries),
    colorTransfer: text(stream?.color_transfer),
    bitRate: finiteNumber(stream?.bit_rate),
    durationSec,
    streamDurationSec,
    formatDurationSec,
    formatSizeBytes: finiteNumber(parsed.format?.size),
    videoPacketBytes: null,
  };
}

async function countVideoPacketBytes(
  ffprobe: string,
  file: string,
  signal: AbortSignal,
): Promise<number | null> {
  const { stdout } = await execFileAsync(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_packets",
      "-show_entries",
      "packet=size",
      "-of",
      "csv=p=0",
      file,
    ],
    signal,
  );
  let total = 0;
  let count = 0;
  for (const line of stdout.split(/\r?\n/)) {
    const value = Number(line.trim().replace(/^"|"$/g, ""));
    if (!Number.isFinite(value) || value < 0) continue;
    total += value;
    count += 1;
  }
  return count > 0 && Number.isSafeInteger(total) && total > 0 ? total : null;
}

export function createDefaultVideoRenderEngine(
  // [T-281] Chromium 下载器由组合根(frontend)注入(见 ChromiumDownloader 注释);缺省 =
  //   不注入 → resolveChromium 未装时诚实报错引导(不在 backend 里 resolve playwright)。
  opts?: { downloadChromium?: ChromiumDownloader },
): VideoRenderEngine {
  return {
    findBinary: resolveMediaBinary,
    async probeVideo(ffprobe, file, signal) {
      return probeVideoMetadata(ffprobe, file, signal);
    },
    async probeDelivery(ffprobe, file, signal) {
      const probe = await probeVideoMetadata(ffprobe, file, signal);
      if (probe.bitRate != null && probe.bitRate > 0) return probe;
      return {
        ...probe,
        videoPacketBytes: await countVideoPacketBytes(ffprobe, file, signal),
      };
    },
    async verifyFfmpegDecode(ffmpeg, file, signal) {
      try {
        await execFileAsync(
          ffmpeg,
          [
            "-v",
            "error",
            "-xerror",
            "-i",
            file,
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
          ],
          signal,
        );
        return true;
      } catch (error) {
        if (signal.aborted) throw error;
        return false;
      }
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

export function calculateDeliveryBitrate(delivery: {
  width: number;
  height: number;
  fps: number;
}): { targetKbps: number; minimumKbps: number } {
  const raw =
    (10_000 * delivery.width * delivery.height * delivery.fps) /
    (1920 * 1080 * 30);
  const targetKbps = Math.min(
    24_000,
    Math.max(4_000, Math.round(raw / 100) * 100),
  );
  return { targetKbps, minimumKbps: Math.floor(targetKbps * 0.5) };
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

const SAFE_H264_PROFILES = new Set([
  "baseline",
  "constrained baseline",
  "main",
  "high",
]);

function isHdrProbe(probe: VideoProbe): boolean {
  const transfer = normalized(probe.colorTransfer);
  const primaries = normalized(probe.colorPrimaries);
  const space = normalized(probe.colorSpace);
  return (
    transfer === "smpte2084" ||
    transfer === "arib-std-b67" ||
    transfer === "hlg" ||
    primaries.startsWith("bt2020") ||
    space.startsWith("bt2020")
  );
}

function hasUnknownColorMetadata(probe: VideoProbe): boolean {
  const isUnknown = (value: string | null | undefined): boolean => {
    const color = normalized(value);
    return (
      !color ||
      color === "unknown" ||
      color === "unspecified" ||
      color === "reserved"
    );
  };
  return (
    isUnknown(probe.colorSpace) ||
    isUnknown(probe.colorPrimaries) ||
    isUnknown(probe.colorTransfer)
  );
}

function isStaticSafeH264(probe: VideoProbe): boolean {
  return (
    normalized(probe.codec) === "h264" &&
    SAFE_H264_PROFILES.has(normalized(probe.profile)) &&
    normalized(probe.pixFmt) === "yuv420p" &&
    normalized(probe.colorSpace) === "bt709" &&
    normalized(probe.colorPrimaries) === "bt709" &&
    normalized(probe.colorTransfer) === "bt709" &&
    !isHdrProbe(probe)
  );
}

function parseFrameRate(value: string | null | undefined): number | null {
  if (!value) return null;
  const [numeratorText, denominatorText] = value.split("/", 2);
  const numerator = Number(numeratorText);
  const denominator = denominatorText == null ? 1 : Number(denominatorText);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null;
  }
  return numerator / denominator;
}

function assertDeliveryQuality(
  probe: VideoProbe,
  delivery: { width: number; height: number; fps: number },
  expectedDurationSec: number,
  bitrate: { targetKbps: number; minimumKbps: number },
): { actualKbps: number; fps: number; durationSec: number } {
  const fps = parseFrameRate(probe.avgFrameRate ?? probe.rFrameRate);
  const durationSec = probe.streamDurationSec ?? probe.durationSec;
  const formatDurationSec = probe.formatDurationSec ?? probe.durationSec;
  if (
    fps == null ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    !Number.isFinite(formatDurationSec) ||
    formatDurationSec <= 0
  ) {
    throw new Error("PROBE_INVALID: 最终成片缺少有效 fps 或时长");
  }
  const actualKbps =
    probe.bitRate != null && probe.bitRate > 0
      ? Math.floor(probe.bitRate / 1000)
      : probe.videoPacketBytes != null && probe.videoPacketBytes > 0
        ? Math.floor((probe.videoPacketBytes * 8) / durationSec / 1000)
        : null;
  if (actualKbps == null || !Number.isFinite(actualKbps)) {
    throw new Error("PROBE_INVALID: 最终成片缺少视频流码率与 v:0 packet bytes");
  }
  const fpsTolerance = Math.max(0.01, delivery.fps / 1000);
  const durationTolerance = Math.max(0.25, 2 / delivery.fps);
  const mismatches: string[] = [];
  if (normalized(probe.codec) !== "h264") mismatches.push(`codec=${probe.codec}`);
  if (probe.width !== delivery.width || probe.height !== delivery.height) {
    mismatches.push(`size=${probe.width ?? "?"}x${probe.height ?? "?"}`);
  }
  if (normalized(probe.pixFmt) !== "yuv420p") mismatches.push(`pix_fmt=${probe.pixFmt ?? "?"}`);
  if (
    normalized(probe.colorSpace) !== "bt709" ||
    normalized(probe.colorPrimaries) !== "bt709" ||
    normalized(probe.colorTransfer) !== "bt709"
  ) {
    mismatches.push(
      `color=${probe.colorSpace ?? "?"}/${probe.colorPrimaries ?? "?"}/${probe.colorTransfer ?? "?"}`,
    );
  }
  if (Math.abs(fps - delivery.fps) > fpsTolerance) mismatches.push(`fps=${fps.toFixed(3)}`);
  if (
    Math.abs(durationSec - expectedDurationSec) > durationTolerance ||
    Math.abs(formatDurationSec - expectedDurationSec) > durationTolerance
  ) {
    mismatches.push(
      `duration=${durationSec.toFixed(3)}/${formatDurationSec.toFixed(3)}`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(`DELIVERY_MISMATCH: ${mismatches.join(", ")}`);
  }
  if (actualKbps < bitrate.minimumKbps) {
    throw new Error(
      `BITRATE_BELOW_MIN: actualKbps=${actualKbps}, minimumKbps=${bitrate.minimumKbps}, targetKbps=${bitrate.targetKbps}`,
    );
  }
  return { actualKbps, fps, durationSec };
}

/** 视频文件名 → work/media/ 下的安全正式渲染输入名(统一 .mp4)。 */
function renderInputNameFor(mountAs: string): string {
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

      // 3) 正式渲染输入准备：安全 H.264 经 FFmpeg 全流解码后只 remux；
      //    其他编码只生成一次高质量 mezzanine。预览 proxy 绝不进入正式合成。
      //    不在真实渲染前重复启动 Chromium 做首帧预检；HyperFrames 自己负责实际解码。
      const nameMap = new Map<string, string>();
      const inputPreparation: Array<{
        file: string;
        sourceCodec: string;
        strategy: "remux" | "mezzanine";
      }> = [];
      for (const f of media.videos) {
        throwIfAborted(signal);
        const src = resolveInsideDir(sandbox.inputDir, f);
        const probe = await engine.probeVideo(ffprobe, src, signal);
        const outName = renderInputNameFor(f);
        const preparedFile = path.join(mediaDir, outName);
        nameMap.set(f, outName);
        let strategy: "remux" | "mezzanine" = "mezzanine";
        if (
          isStaticSafeH264(probe) &&
          (await engine.verifyFfmpegDecode(ffmpeg, src, signal))
        ) {
          await reportStep(
            `准备 ${f}(${probe.codec} ${probe.durationSec.toFixed(1)}s → 无损 remux)`,
          );
          try {
            await engine.runFfmpeg(
              ffmpeg,
              [
                "-y",
                "-i",
                src,
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                preparedFile,
              ],
              signal,
            );
            strategy = "remux";
          } catch (error) {
            if (signal.aborted) throw error;
          }
        }
        if (strategy !== "remux") {
          const hdr = isHdrProbe(probe);
          const unknownColorMetadata = !hdr && hasUnknownColorMetadata(probe);
          const needsSdrConversion =
            hdr ||
            unknownColorMetadata ||
            normalized(probe.colorSpace) !== "bt709" ||
            normalized(probe.colorPrimaries) !== "bt709" ||
            normalized(probe.colorTransfer) !== "bt709";
          await reportStep(
            `准备 ${f}(${probe.codec} ${probe.durationSec.toFixed(1)}s → 高质量 mezzanine${hdr ? ",HDR→SDR" : ""})`,
          );
          const colorFilter = hdr
            ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
            : unknownColorMetadata
              // 缺输入色彩标签时 colorspace 滤镜无法建立转换矩阵；只规范像素格式，
              // 输出编码参数在下方统一写入 BT.709 标签。此分支明确非 HDR，不做 tone-map。
              ? "format=yuv420p"
              : "colorspace=all=bt709:fast=0,format=yuv420p";
          await engine.runFfmpeg(
            ffmpeg,
            [
              "-y",
              "-i",
              src,
              ...(needsSdrConversion ? ["-vf", colorFilter] : []),
              "-c:v",
              "libx264",
              "-preset",
              "slow",
              "-crf",
              "10",
              "-g",
              "30",
              "-pix_fmt",
              "yuv420p",
              "-colorspace",
              "bt709",
              "-color_primaries",
              "bt709",
              "-color_trc",
              "bt709",
              "-x264-params",
              "colorprim=bt709:transfer=bt709:colormatrix=bt709",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-movflags",
              "+faststart",
              preparedFile,
            ],
            signal,
          );
        }
        inputPreparation.push({
          file: path.basename(f),
          sourceCodec: probe.codec,
          strategy,
        });
      }
      for (const f of media.images) {
        const outName = imageNameFor(f, inputMimeTypes.get(f));
        nameMap.set(f, outName);
        await copyFileCopyOnWrite(
          resolveInsideDir(sandbox.inputDir, f),
          path.join(mediaDir, outName),
        );
      }

      // 4) 模板生成 index.html(props 内文件引用替换为 media/ 落名)+ gsap 落盘
      await reportStep("生成合成模板 index.html");
      const rename = (f: string): string => nameMap.get(f) ?? f;
      const renamedProps: VideoRenderProps = {
        ...props,
        ...(props.direction
          ? {
              direction: {
                ...props.direction,
                beatGraph: props.direction.beatGraph.map((beat) =>
                  beat.subject.kind === "broll"
                    ? {
                        ...beat,
                        subject: {
                          ...beat.subject,
                          ref: `broll:${rename(beat.subject.ref.replace(/^broll:/, ""))}`,
                        },
                      }
                    : beat,
                ),
              },
            }
          : {}),
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
      const deliveryBitrate = calculateDeliveryBitrate(props.delivery);
      await reportStep(
        `HyperFrames 高质量渲染(${props.delivery.width}x${props.delivery.height}/${props.delivery.fps}fps,${deliveryBitrate.targetKbps}kbps,${props.talkingHead.durationSec.toFixed(1)}s)`,
      );
      const rawFile = path.join(workDir, "render_raw.mp4");
      let lastReported = "";
      await engine.renderComposition({
        projectDir: workDir,
        outputFile: rawFile,
        fps: props.delivery.fps,
        quality: "high",
        videoBitrate: `${deliveryBitrate.targetKbps}k`,
        videoFrameFormat: "png",
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

      // 6) HyperFrames 已完成唯一一次正式视频编码；final 只做 MP4 faststart remux。
      throwIfAborted(signal);
      await reportStep("交付文件无损整理(stream copy + faststart)");
      const finalFile = path.join(sandbox.outDir, "final.mp4");
      await engine.runFfmpeg(
        ffmpeg,
        [
          "-y",
          "-i",
          rawFile,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          finalFile,
        ],
        signal,
      );

      await reportStep("校验正式成片(codec/尺寸/fps/色彩/码率)");
      const deliveryProbe = await engine.probeDelivery(
        ffprobe,
        finalFile,
        signal,
      );
      const deliveryQuality = assertDeliveryQuality(
        deliveryProbe,
        props.delivery,
        props.talkingHead.durationSec,
        deliveryBitrate,
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
          inputPreparation,
          deliveryQuality: {
            targetKbps: deliveryBitrate.targetKbps,
            minimumKbps: deliveryBitrate.minimumKbps,
            actualKbps: deliveryQuality.actualKbps,
            codec: deliveryProbe.codec,
            profile: deliveryProbe.profile,
            width: deliveryProbe.width,
            height: deliveryProbe.height,
            fps: deliveryQuality.fps,
            pixFmt: deliveryProbe.pixFmt,
            colorSpace: deliveryProbe.colorSpace,
            colorPrimaries: deliveryProbe.colorPrimaries,
            colorTransfer: deliveryProbe.colorTransfer,
            durationSec: deliveryQuality.durationSec,
          },
          visualReview,
        },
      };
    },
  };
}
