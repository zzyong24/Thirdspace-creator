// ffmpeg 可执行路径解析(T-326 RT-H09)—— douyin-cdp 抽音(frontend)与 whisper-local
// PCM 解码(ai-worker)共用的**单一真值解析链**。此前两处默认硬编码
// `/opt/homebrew/bin/ffmpeg`:Intel Mac(Homebrew 在 /usr/local)、Windows、无 Homebrew
// 的机器上转录/抽音**稳定失败**。统一为四级解析(全 miss 诚实报错,绝不静默):
//
//   ① 显式 env `CREATOROS_FFMPEG_PATH`:用户/宿主显式指定,最高优先。**指了但文件不存在
//      → 直接报错**(不静默降级去找别的 ffmpeg —— 配错路径必须暴露,否则用户以为在用
//      自己指定的那把,实际走了别处的,行为漂移难查)。
//   ② 随包 sidecar 约定位置:正式包由 Rust 壳注入绝对 `CREATOROS_BIN_DIR`，开发态/旧壳
//      才回落 `<cwd>/bin/ffmpeg[.exe]`。build-sidecar 把静态 ffmpeg/ffprobe 实拷到
//      `sidecar/frontend/bin/`，运行时不再靠 Finder/快捷方式启动时不可靠的 cwd 猜位置。
//   ③ PATH 上的 ffmpeg:逐目录 existsSync(**不 spawn which/where** —— 纯 fs,可注入单测、
//      无子进程开销)。PATH miss 后再兜**常见安装目录**:macOS GUI app(Tauri 壳起的
//      sidecar)拿到的 launchd PATH 通常只有 /usr/bin:/bin:/usr/sbin:/sbin,**不含**
//      /opt/homebrew/bin → Homebrew 用户在打包 app 里会 miss PATH,这层兜住(也让旧硬编码
//      路径的机器行为不回退)。
//   ④ 全 miss → FfmpegNotFoundError,错误信息告诉用户装 ffmpeg(按平台给安装命令)或配
//      CREATOROS_FFMPEG_PATH。**诚实失败**,上层(douyin-cdp / whisper-local)各自把它归入
//      自己的错误类型,用户在任务失败详情里能看到可执行的解决办法。
//
// 依赖全部可注入(env / existsSync / cwd / platform)→ 解析链可确定性单测,不碰真 fs。

import {
  ExecutablePathConfigurationError,
  resolveExecutablePath,
  type ResolveExecutablePathOptions,
} from "./executable-path";

/** ffmpeg 全链找不到(或显式配置指错)时抛出 —— 携带面向用户的安装/配置引导。 */
export class FfmpegNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FfmpegNotFoundError";
  }
}

/** resolveFfmpegPath 的可注入依赖(默认真 process.env / fs.existsSync / process.cwd / 本机平台)。 */
export type ResolveFfmpegPathOptions = ResolveExecutablePathOptions;

/** 按平台给「怎么装」的一句话引导(诚实、可执行;放进报错信息)。 */
function installHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "brew install ffmpeg";
  if (platform === "linux") return "sudo apt install ffmpeg(或发行版对应包管理器)";
  return "从 https://ffmpeg.org/download.html 下载并安装";
}

/**
 * 解析 ffmpeg 可执行路径(解析链见文件头注释)。找不到 → 抛 FfmpegNotFoundError(诚实报错,
 * 信息含安装引导 + CREATOROS_FFMPEG_PATH 配置提示)。**调用方应在真正要 spawn 时才调**
 * (惰性解析:装配期不解析,避免「装了适配器但还没用到转录」的进程因缺 ffmpeg 而崩)。
 */
export function resolveFfmpegPath(
  opts: ResolveFfmpegPathOptions = {},
): string {
  const platform = opts.platform ?? process.platform;
  try {
    const found = resolveExecutablePath("ffmpeg", {
      ...opts,
      explicitEnvVar: "CREATOROS_FFMPEG_PATH",
      bundled: true,
    });
    if (found) return found;
  } catch (err) {
    if (err instanceof ExecutablePathConfigurationError) {
      throw new FfmpegNotFoundError(err.message);
    }
    throw err;
  }
  throw new FfmpegNotFoundError(
    "未找到 ffmpeg(转录/抽音频必需)。已查随包组件、PATH 及常见安装目录，均无。" +
      `请安装 ffmpeg(${installHint(platform)}),` +
      `或设置环境变量 CREATOROS_FFMPEG_PATH 指向 ffmpeg 可执行文件后重试。`,
  );
}

/** ffprobe 与 ffmpeg 同包分发；给渲染/媒体元信息探针复用同一解析规则。 */
export function resolveFfprobePath(
  opts: ResolveFfmpegPathOptions = {},
): string {
  const platform = opts.platform ?? process.platform;
  try {
    const found = resolveExecutablePath("ffprobe", {
      ...opts,
      explicitEnvVar: "CREATOROS_FFPROBE_PATH",
      bundled: true,
    });
    if (found) return found;
  } catch (err) {
    if (err instanceof ExecutablePathConfigurationError) {
      throw new FfmpegNotFoundError(err.message);
    }
    throw err;
  }
  throw new FfmpegNotFoundError(
    "未找到 ffprobe(读取音视频信息必需)。已查随包组件、PATH 及常见安装目录，均无。" +
      `请安装 ffmpeg(${installHint(platform)}，会同时安装 ffprobe),` +
      "或设置环境变量 CREATOROS_FFPROBE_PATH 指向 ffprobe 可执行文件后重试。",
  );
}
