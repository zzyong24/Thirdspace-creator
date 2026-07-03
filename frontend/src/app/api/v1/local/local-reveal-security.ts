import * as fs from "node:fs/promises";
import * as path from "node:path";

// [T-055d gate-F1] 「在 Finder 打开/显示」的路径防护(SPEC §7.2)。单机产品的本地
// server 会对解析出的路径执行 `open`,所以这里是硬门,三重防护缺一不可:
//   1. path.resolve + relative 检查 —— 相对 key 解析后必须仍在 root 下
//      (拦 `../../etc` 与绝对路径注入);
//   2. 显式拒绝绝对路径 / 含 NUL 的 key;
//   3. realpath 复检 —— 解析 symlink 后的真实路径仍须在 root(真实路径)下
//      (拦「root 内放一个指向 /etc 的软链」)。
// 纯函数 + fs 复检拆开:resolveInsideRoot 可无盘单测,realpathInsideRoot 在
// 集成测试里用真临时目录 + symlink 验。

export class LocalPathViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalPathViolation";
  }
}

/**
 * 第 1+2 重(纯函数,无盘):把相对 key 解析到 root 下的绝对路径。
 * key 为绝对路径 / 含 NUL / 逃逸 root → throw LocalPathViolation。
 */
export function resolveInsideRoot(rootPath: string, key: string): string {
  if (!key || key.includes("\0")) {
    throw new LocalPathViolation("invalid key");
  }
  if (path.isAbsolute(key)) {
    throw new LocalPathViolation("absolute key rejected");
  }
  const root = path.resolve(rootPath);
  const abs = path.resolve(root, key);
  const rel = path.relative(root, abs);
  if (rel === "" ) return abs; // key 解析到 root 本身(项目目录场景不会,防御性放行 root)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new LocalPathViolation("path escapes storage root");
  }
  return abs;
}

/**
 * 第 3 重(fs):realpath 复检 —— 目标(或其最近存在的祖先)的真实路径仍在 root
 * 真实路径下。symlink 指向 root 外 → throw。目标不存在 → 返回 null(由调用方 404)。
 */
export async function realpathInsideRoot(
  rootPath: string,
  absPath: string,
): Promise<string | null> {
  const rootReal = await fs.realpath(path.resolve(rootPath)).catch(() => null);
  if (!rootReal) return null;
  const real = await fs.realpath(absPath).catch(() => null);
  if (!real) return null;
  const rel = path.relative(rootReal, real);
  if (rel !== "" && (rel.startsWith("..") || path.isAbsolute(rel))) {
    throw new LocalPathViolation("symlink escapes storage root");
  }
  return real;
}
