// 桌面运行时可执行文件解析的单一规则：
//   显式工具路径 → 壳层注入的随包 bin → 开发态 cwd/bin → PATH → 平台常见目录 → null。
//
// Finder / Windows 桌面快捷方式启动的进程不会读取用户 shell profile，PATH 往往只有系统
// 目录；因此运行期不能把 `which/where` 当成“用户是否安装”的真值。这里直接按目标平台
// 解析路径，既能命中随包工具，也能命中 Homebrew 等 GUI PATH 之外的常见安装目录。

export class ExecutablePathConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutablePathConfigurationError";
  }
}

export interface ResolveExecutablePathOptions {
  env?: Record<string, string | undefined>;
  existsSync?: (candidate: string) => boolean;
  cwd?: () => string;
  platform?: NodeJS.Platform;
  /** 该工具的显式绝对路径环境变量；设置但不存在时直接报错，不偷偷换另一把。 */
  explicitEnvVar?: string;
  /** 是否检查随包 bin。核心运行依赖(ffmpeg/ffprobe)为 true，可选系统工具为 false。 */
  bundled?: boolean;
  /** 额外的绝对候选路径，例如当前 sidecar 自带的 node runtime。 */
  preferredPaths?: readonly string[];
}

const WELL_KNOWN_DIRS: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"],
  linux: ["/usr/local/bin", "/usr/bin", "/bin"],
};

function trimPathValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 解析内部白名单工具的绝对路径；未安装的可选工具返回 null。 */
export function resolveExecutablePath(
  name: string,
  opts: ResolveExecutablePathOptions = {},
): string | null {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const cwd = opts.cwd ?? (() => process.cwd());
  const existsSync =
    opts.existsSync ??
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("node:fs") as typeof import("node:fs")).existsSync;

  const executable =
    platform === "win32" && !name.toLowerCase().endsWith(".exe")
      ? `${name}.exe`
      : name;
  const delimiter = platform === "win32" ? ";" : ":";
  const separator = platform === "win32" ? "\\" : "/";
  const joinDir = (dir: string, file: string) =>
    dir.endsWith(separator) ? `${dir}${file}` : `${dir}${separator}${file}`;

  if (opts.explicitEnvVar) {
    const explicitRaw = env[opts.explicitEnvVar]?.trim();
    if (explicitRaw) {
      const explicit = trimPathValue(explicitRaw);
      if (existsSync(explicit)) return explicit;
      throw new ExecutablePathConfigurationError(
        `环境变量 ${opts.explicitEnvVar} 指向的文件不存在:${explicit}。` +
          "请改成正确的可执行文件绝对路径，或删除该变量让 CreatorOS 自动查找。",
      );
    }
  }

  for (const preferred of opts.preferredPaths ?? []) {
    const candidate = trimPathValue(preferred);
    if (candidate && existsSync(candidate)) return candidate;
  }

  if (opts.bundled) {
    const injectedBin = env.CREATOROS_BIN_DIR?.trim();
    if (injectedBin) {
      const candidate = joinDir(trimPathValue(injectedBin), executable);
      if (existsSync(candidate)) return candidate;
    }
    // 开发态/旧壳兼容：正式桌面包以 CREATOROS_BIN_DIR 为真值，不依赖 cwd。
    const legacyBundled = joinDir(joinDir(cwd(), "bin"), executable);
    if (existsSync(legacyBundled)) return legacyBundled;
  }

  const pathDirs = (env.PATH ?? "")
    .split(delimiter)
    .map(trimPathValue)
    .filter(Boolean);
  const candidates = [
    ...pathDirs,
    ...(WELL_KNOWN_DIRS[platform] ?? []),
  ];
  const seen = new Set<string>();
  for (const dir of candidates) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const candidate = joinDir(dir, executable);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
