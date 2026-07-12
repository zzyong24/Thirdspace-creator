import "server-only";
import * as fs from "node:fs";
import * as nodePath from "node:path";

// [T-253] local.read 授权表 —— 编导读本机文件的「运行时逐次授权」状态(Claude Code 权限模型的
// 卡片化)。两级授权:
//   · 一次授权(允许一次):内存级,进程内有效,**读一次即消耗**(下次同路径再弹确认卡);
//   · 目录授权(总是允许该目录):持久化到 `.auth/local-read-grants.json`(与 `.auth/douyin`、
//     `.auth/web` 同栖身地:本机状态、gitignore 不入库),目录前缀匹配,越用越顺。
// 单机产品(Next server 与用户同机),以简单可靠为准:不建表、不进 settings schema。
// 授权表只回答「读之前要不要弹卡」;敏感 denylist 硬门(local-read-security)在授权之上,
// 无论授权与否都拒 —— 授权表**不承担**安全职责。

interface GrantState {
  /** userId → 一次授权的**已归一 realpath** 集(读一次即 delete)。 */
  once: Map<string, Set<string>>;
  /** userId → 「总是允许」目录集(已归一 realpath;前缀匹配)。 */
  dirs: Map<string, Set<string>>;
  /** dirs 是否已从磁盘加载过(懒加载一次)。 */
  loaded: boolean;
}

// globalThis 单例:与 persistence bundle 同款防 HMR 重置(dev 下模块会被重新求值)。
const globalForGrants = globalThis as unknown as {
  __creatorosLocalReadGrants?: GrantState;
};

function state(): GrantState {
  if (!globalForGrants.__creatorosLocalReadGrants) {
    globalForGrants.__creatorosLocalReadGrants = {
      once: new Map(),
      dirs: new Map(),
      loaded: false,
    };
  }
  return globalForGrants.__creatorosLocalReadGrants;
}

/** 持久化文件路径(env 可覆盖,测试注入临时文件)。 */
export function grantsFilePath(): string {
  return (
    process.env.CREATOROS_LOCAL_READ_GRANTS_FILE ??
    nodePath.join(process.cwd(), ".auth", "local-read-grants.json")
  );
}

// 懒加载持久化的目录授权(坏文件/不存在 → 空表,诚实降级不崩)。
function ensureLoaded(): void {
  const s = state();
  if (s.loaded) return;
  s.loaded = true;
  try {
    const raw = fs.readFileSync(grantsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [userId, dirs] of Object.entries(parsed)) {
      if (!Array.isArray(dirs)) continue;
      s.dirs.set(
        userId,
        new Set(dirs.filter((d): d is string => typeof d === "string")),
      );
    }
  } catch {
    // 文件不存在/损坏 → 空表(用户重新授权即可,不炸)。
  }
}

// best-effort 落盘(失败只记日志 —— 内存授权本轮仍生效,重启后需重授)。
function persistDirs(): void {
  const s = state();
  const out: Record<string, string[]> = {};
  for (const [userId, dirs] of s.dirs) out[userId] = [...dirs];
  try {
    const file = grantsFilePath();
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf8");
  } catch (err) {
    console.warn("[local-read-grants] persist failed:", err);
  }
}

/** 一次授权:允许该 user 读这个**已归一路径**一次(下次读弹卡)。 */
export function grantOnce(userId: string, resolvedPath: string): void {
  const s = state();
  const set = s.once.get(userId) ?? new Set<string>();
  set.add(resolvedPath);
  s.once.set(userId, set);
}

/** 目录授权:该目录(含子路径)从此免弹卡。持久化。 */
export function grantAlwaysDir(userId: string, resolvedDir: string): void {
  ensureLoaded();
  const s = state();
  const set = s.dirs.get(userId) ?? new Set<string>();
  set.add(resolvedDir);
  s.dirs.set(userId, set);
  persistDirs();
}

/**
 * 授权判定:resolvedPath 是否已被允许。命中目录授权(自身或任一父目录在 dirs 里)→ 'dir';
 * 命中一次授权(精确路径)→ 'once';都没有 → null(弹确认卡)。
 */
export function checkGrant(
  userId: string,
  resolvedPath: string,
): "dir" | "once" | null {
  ensureLoaded();
  const s = state();
  const dirs = s.dirs.get(userId);
  if (dirs) {
    for (const dir of dirs) {
      if (resolvedPath === dir || resolvedPath.startsWith(`${dir}/`)) {
        return "dir";
      }
    }
  }
  if (s.once.get(userId)?.has(resolvedPath)) return "once";
  return null;
}

/** 消耗一次授权(成功读取后调;目录授权不消耗)。 */
export function consumeOnce(userId: string, resolvedPath: string): void {
  state().once.get(userId)?.delete(resolvedPath);
}

/** 测试用:清空全部授权状态(含 loaded 标记,便于换 grants 文件)。 */
export function resetLocalReadGrantsForTest(): void {
  globalForGrants.__creatorosLocalReadGrants = {
    once: new Map(),
    dirs: new Map(),
    loaded: false,
  };
}
