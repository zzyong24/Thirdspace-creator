// ffmpeg 可执行路径解析(T-326 RT-H09)—— douyin-cdp 抽音(frontend)与 whisper-local
// PCM 解码(ai-worker)共用的**单一真值解析链**。此前两处默认硬编码
// `/opt/homebrew/bin/ffmpeg`:Intel Mac(Homebrew 在 /usr/local)、Windows、无 Homebrew
// 的机器上转录/抽音**稳定失败**。统一为四级解析(全 miss 诚实报错,绝不静默):
//
//   ① 显式 env `CREATOROS_FFMPEG_PATH`:用户/宿主显式指定,最高优先。**指了但文件不存在
//      → 直接报错**(不静默降级去找别的 ffmpeg —— 配错路径必须暴露,否则用户以为在用
//      自己指定的那把,实际走了别处的,行为漂移难查)。
//   ② 随包 sidecar 约定位置 `<cwd>/bin/ffmpeg[.exe]`:打包版 server.js 从
//      `<runtime>/sidecar/frontend` 跑(cwd 即该目录),build-sidecar 的 bundleFfmpeg 把
//      静态 ffmpeg 实拷到 `sidecar/frontend/bin/`。与 T-284 的
//      `PLAYWRIGHT_BROWSERS_PATH = <cwd>/browsers` 同款 cwd 约定。dev 没有这个目录 → 跳过。
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

/** ffmpeg 全链找不到(或显式配置指错)时抛出 —— 携带面向用户的安装/配置引导。 */
export class FfmpegNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FfmpegNotFoundError";
  }
}

/** resolveFfmpegPath 的可注入依赖(默认真 process.env / fs.existsSync / process.cwd / 本机平台)。 */
export interface ResolveFfmpegPathOptions {
  env?: Record<string, string | undefined>;
  existsSync?: (p: string) => boolean;
  cwd?: () => string;
  platform?: NodeJS.Platform;
}

// PATH miss 后兜底的常见安装目录(按平台)。macOS 顺序:Apple Silicon Homebrew →
// Intel Homebrew → 系统;Linux:发行版包管理器落点。Windows 无标准安装目录,不兜。
const WELL_KNOWN_DIRS: Partial<Record<string, readonly string[]>> = {
  darwin: ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"],
  linux: ["/usr/bin", "/usr/local/bin"],
};

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
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const cwd = opts.cwd ?? (() => process.cwd());
  const existsSync =
    opts.existsSync ??
    // 惰性 require node:fs(server-only;与 whisper-local 同款,避免顶层拉 node 内建进任何客户端 bundle)。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("node:fs") as typeof import("node:fs")).existsSync;

  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  // 分隔符按**目标平台**显式给(不用 path.delimiter/sep —— 那是宿主的;注入 platform 单测
  // win32 行为时必须按 win32 语义切 PATH)。
  const pathDelim = platform === "win32" ? ";" : ":";
  const dirSep = platform === "win32" ? "\\" : "/";
  const joinDir = (dir: string, name: string) =>
    dir.endsWith(dirSep) ? `${dir}${name}` : `${dir}${dirSep}${name}`;

  // ① 显式 env —— 最高优先;指了但不存在 → 报错不降级。
  const explicit = env.CREATOROS_FFMPEG_PATH?.trim();
  if (explicit) {
    if (existsSync(explicit)) return explicit;
    throw new FfmpegNotFoundError(
      `环境变量 CREATOROS_FFMPEG_PATH 指向的文件不存在:${explicit}。` +
        `请改成正确的 ffmpeg 可执行文件路径,或删掉该环境变量让系统自动查找。`,
    );
  }

  // ② 随包 sidecar 约定位置 <cwd>/bin/ffmpeg[.exe]。
  const bundled = joinDir(joinDir(cwd(), "bin"), exe);
  if (existsSync(bundled)) return bundled;

  // ③ PATH 逐目录 + 常见安装目录兜底。
  const pathDirs = (env.PATH ?? "")
    .split(pathDelim)
    .map((d) => d.trim())
    .filter(Boolean);
  for (const dir of [...pathDirs, ...(WELL_KNOWN_DIRS[platform] ?? [])]) {
    const candidate = joinDir(dir, exe);
    if (existsSync(candidate)) return candidate;
  }

  // ④ 全 miss —— 诚实报错(装什么/怎么配,一条信息说清)。
  throw new FfmpegNotFoundError(
    `未找到 ffmpeg(转录/抽音频必需)。已查:随包路径 ${bundled}、PATH 及常见安装目录,均无。` +
      `请安装 ffmpeg(${installHint(platform)}),` +
      `或设置环境变量 CREATOROS_FFMPEG_PATH 指向 ffmpeg 可执行文件后重试。`,
  );
}
