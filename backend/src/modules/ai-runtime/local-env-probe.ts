// [T-256a] 环境感知扩展 —— 工具探测(tool detection)纯函数层(零 IO,可单测)。
// 让编导「知道」用户电脑装了哪些系统工具(ffmpeg/node/python/git…),缺失时诚实引导安装,
// 不吹不装。真正的探测 IO(which/版本读取)在 composition root(persistence-client 的
// detectTools 端口),本文件只负责:① 白名单(决定能探哪些工具)② 防注入(工具名不得含 shell
// 元字符)③ 请求解析(把编导请求的名字过滤成白名单子集,非法名诚实回报)④ 版本串解析。
//
// 安全铁律(SPEC §5 + T-256a):**只读探测,不执行任意命令**。工具名一律来自本文件的白名单
// 常量、绝不来自对话拼接;端口层用**固定 arg 数组** spawn(`which <name>` / `<name> --version`),
// 绝不拼 shell 字符串。哪怕对话里被诱导传 `git; rm -rf /`,resolveToolsToProbe 也会因它不过
// isShellSafeToolName / 不在白名单而落进 rejected,永远到不了 spawn。

/** 单个可探测工具的规格(白名单条目)。 */
export interface ToolProbeSpec {
  /** 可执行名(探测键)—— 只允许小写字母/数字/`. _ + -`,无路径分隔/无 shell 元字符。 */
  readonly name: string;
  /** 版本读取参数(固定 arg 数组,端口层原样 spawn;绝不拼串)。 */
  readonly versionArgs: readonly string[];
  /** 一句话用途(编导转述给用户;缺失引导时也用)。 */
  readonly purpose: string;
  /** 缺失时的安装引导(macOS 优先 brew,诚实给出可执行命令/链接)。 */
  readonly installHint: string;
}

/**
 * 工具探测白名单(单一真值)。SPEC §5 要求「至少 ffmpeg/node/python/git」,这里覆盖之 +
 * ffprobe(随 ffmpeg 一起,读音视频元信息)。**可配清单**:扩展只需在此加一行(名字必须过
 * isShellSafeToolName;版本参数用只读探测参数)。顺序即默认探测顺序。
 */
export const TOOL_PROBE_ALLOWLIST: readonly ToolProbeSpec[] = [
  {
    name: "ffmpeg",
    versionArgs: ["-version"],
    purpose: "音视频转码/抽音频/剪辑合成(逐字稿抽音轨、成片渲染都靠它)",
    installHint: "brew install ffmpeg",
  },
  {
    name: "ffprobe",
    versionArgs: ["-version"],
    purpose: "读音视频元信息(时长/分辨率/码率)",
    installHint: "brew install ffmpeg(随 ffmpeg 一起装)",
  },
  {
    name: "node",
    versionArgs: ["--version"],
    purpose: "运行 JS 脚本与工具链",
    installHint: "https://nodejs.org 下载,或 brew install node",
  },
  {
    name: "python3",
    versionArgs: ["--version"],
    purpose: "运行 Python 脚本(数据处理/自动化)",
    installHint: "brew install python,或 https://python.org 下载",
  },
  {
    name: "git",
    versionArgs: ["--version"],
    purpose: "版本控制",
    installHint: "xcode-select --install,或 brew install git",
  },
] as const;

/** 白名单名字集(O(1) 查)。 */
const ALLOWLIST_NAMES: ReadonlySet<string> = new Set(
  TOOL_PROBE_ALLOWLIST.map((t) => t.name),
);

// 工具名安全形态:小写字母/数字开头,其后只允许 `[a-z0-9._+-]`。禁一切空白/斜杠/分号/管道/
// 反引号/$()/引号 等 shell 元字符 —— 这是防注入第一道(即便某名进了白名单,形态也须先合法)。
const SHELL_SAFE_TOOL_NAME = /^[a-z0-9][a-z0-9._+-]*$/;

/**
 * 工具名是否 shell 安全(纯形态校验,与白名单无关)—— 防注入锚点。含空格/`;`/`|`/`&`/
 * `$()`/反引号/斜杠/`..` 等一律 false。绝不允许把工具名当 shell 片段拼进命令。
 */
export function isShellSafeToolName(name: unknown): boolean {
  return typeof name === "string" && SHELL_SAFE_TOOL_NAME.test(name);
}

/**
 * 探测请求解析(纯函数)。
 *   - requested 空/未给 → 探全部白名单(默认全查);
 *   - requested 给了 → 逐个 trim+lower,**过 isShellSafeToolName 且 ∈ 白名单**才进 probe
 *     (去重、保持白名单顺序);其余(危险字符/非白名单)进 rejected 供编导诚实回报。
 * 关键不变量:probe 的每个元素都来自 TOOL_PROBE_ALLOWLIST 常量,绝不含对话拼接的字符串。
 */
export function resolveToolsToProbe(requested?: readonly unknown[]): {
  probe: ToolProbeSpec[];
  rejected: string[];
} {
  const cleaned =
    Array.isArray(requested) && requested.length > 0
      ? requested
          .map((r) => (typeof r === "string" ? r.trim().toLowerCase() : ""))
          .filter((r) => r.length > 0)
      : [];
  if (cleaned.length === 0) {
    return { probe: [...TOOL_PROBE_ALLOWLIST], rejected: [] };
  }
  const wanted = new Set<string>();
  const rejected: string[] = [];
  for (const raw of cleaned) {
    if (isShellSafeToolName(raw) && ALLOWLIST_NAMES.has(raw)) {
      wanted.add(raw);
    } else if (!rejected.includes(raw)) {
      rejected.push(raw);
    }
  }
  // 保白名单声明顺序(而非请求顺序)—— 输出稳定,便于测试锚定。
  const probe = TOOL_PROBE_ALLOWLIST.filter((t) => wanted.has(t.name));
  return { probe, rejected };
}

// 版本号形态:major.minor(.patch)。从 `--version` 输出里抓第一个命中(能拿则拿,拿不到 null)。
// 兼容 "git version 2.39.5 (...)" / "ffmpeg version 6.1.1 ..." / "v20.11.0" / "Python 3.11.6"。
const VERSION_TOKEN = /\d+\.\d+(?:\.\d+)?/;

/**
 * 从 `--version` 原始输出解析版本串(纯函数)。抓第一个 `x.y(.z)` token;无则 null(诚实降级,
 * installed 仍可为 true —— 探到路径但版本读不出不算未装)。
 */
export function parseToolVersion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(VERSION_TOKEN);
  return m ? m[0] : null;
}

/** [T-256a] 单个工具探测结果(端口 detectTools 回,工具结果透传)。 */
export interface DetectedTool {
  readonly name: string;
  /** 是否已装(PATH 上探到可执行)。 */
  readonly installed: boolean;
  /** 可执行绝对路径(未装 → null)。 */
  readonly path: string | null;
  /** 版本串(能拿则拿,拿不到/未装 → null)。 */
  readonly version: string | null;
  /** 一句话用途(白名单常量,编导转述用)。 */
  readonly purpose: string;
  /** 缺失时的安装引导(installed=true → null,诚实不冗余)。 */
  readonly installHint: string | null;
}

/** [T-256a] detectTools 端口返回:探测结果 + 被拒的非法/非白名单请求名(诚实回报)。 */
export interface DetectToolsResult {
  readonly tools: DetectedTool[];
  readonly rejected: string[];
}
