// [RT-H06] 执行层子进程 env 收窄(allowlist)。
//
// 病根(T-326 审计 RT-H06):video.render 的 hyperframes 子进程直接 `...process.env`
// 继承全量 env ——「沙箱内」代码(及其再起的 Chromium/ffmpeg 子进程树)能读到模型 key、
// DB/S3 配置、master key 并外传。本平台(桌面单机,无 docker/无 OS 级网络命名空间)
// 没有能真正强制子进程断网的沙箱,**secrets 不进子进程树**是当下能真做到的第一道硬隔离。
//
// 原则:**allowlist,不是 denylist** —— 只透传进程运行必需的少数运行时变量,其余一律
// 不给(将来新增的密钥变量天然不会漏进来)。默认排除之列(靠 allowlist 结构性排除,
// 非逐个点名):一切模型 key(ANTHROPIC/MINIMAX/OPENAI…)、DATABASE_URL/PG* 等 DB 配置、
// S3_*/AWS_* 对象存储凭证、CREATOROS_MASTER_KEY、以及 NODE_OPTIONS(可注入 --require
// preload,等价于任意代码注入,绝不透传)。
//
// 消费方:video-render/executor.ts 的全部子进程(which/where、ffprobe、ffmpeg、
// hyperframes CLI → Chromium)。agentic executor 不起子进程(进程内循环 + 注入端口),
// 无此面。

/** 子进程运行必需的 env allowlist(跨平台合集;source 里不存在的键自然跳过)。 */
const CHILD_ENV_ALLOWLIST: readonly string[] = [
  // 跨平台基础:可执行查找 / 用户目录 / 临时目录 / 区域 / 时区
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TZ",
  "USER",
  "LOGNAME",
  // macOS:CoreFoundation 文本编码(Chromium/CLI 工具会读)
  "__CF_USER_TEXT_ENCODING",
  // Linux:显示 / 字体 / XDG 运行时目录 / 动态库查找(headless Chromium、ffmpeg 发行版装法会读)
  "DISPLAY",
  "XAUTHORITY",
  "XDG_RUNTIME_DIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "FONTCONFIG_PATH",
  "LD_LIBRARY_PATH",
  // Windows:系统目录 / 用户配置目录 / 可执行扩展(where/子进程解析必需)
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
];

/**
 * 构造子进程 env:allowlist 从 source(默认 process.env)拷贝 + 调用方显式追加
 * 的任务级变量(如 HYPERFRAMES_BROWSER_PATH)。extra 覆盖同名 allowlist 键。
 */
export function buildChildEnv(
  extra: Record<string, string> = {},
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const v = source[key];
    if (typeof v === "string") env[key] = v;
  }
  return { ...env, ...extra };
}
