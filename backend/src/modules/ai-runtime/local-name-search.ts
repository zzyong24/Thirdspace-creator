// [T-262] 编导 local.read 文件名搜索兜底(纯逻辑 + 注入式 fs,可单测)——
// readLocalFile 精确路径解析不到(相对路径无法归一 / realpath miss)时,提取 basename 在
// **scoped 目录集**(用户「总是允许该目录」授权过的目录 + 常用目录 Desktop/Documents/ThirdSpace)
// 按文件名搜同名文件,守 denylist(命中敏感段/名一律跳过)、限**深度 + 结果数 + 访问节点数**防爆。
// 真正的 fs 由 composition root(persistence-client)注入(本文件零 node 依赖 → 与 local-read-security
// 同款可单测)。安全铁律:**搜索范围 scoped 非全盘**(只从注入的 roots 出发);denylist 硬拒复用
// local-read-security 的 sensitivePathReason(经 isSensitive 注入);软链一律跳过(防环 + 防指向敏感区)。

/** 单次搜索最大递归深度(root=0,向下到该层的文件都会被匹配)。 */
export const LOCAL_SEARCH_MAX_DEPTH = 5;
/** 单次搜索最多返回的同名命中数(超出截断,truncated=true)。 */
export const LOCAL_SEARCH_MAX_RESULTS = 12;
/** 单次搜索最多访问的目录项数(dir + file,防超大树炸;超出截断)。 */
export const LOCAL_SEARCH_MAX_NODES = 6000;

// 遍历时跳过的重目录/无关目录(perf + 少噪声)。dotdir(以 . 开头)一律跳过 —— 顺带挡住
// .ssh/.aws/.gnupg 等敏感目录(它们也会被 isSensitive 二次挡)。
const SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".Trash",
  "Library", // ~/Library 巨大且含 Keychains 等;工作文件不会放这
  "Applications",
  "System",
  ".npm",
  ".pnpm-store",
]);

/** 遍历时是否跳过该子目录(dotdir 一律跳 + 重目录黑名单)。纯函数,可单测。 */
export function shouldSkipSearchDir(name: string): boolean {
  if (!name) return true;
  if (name.startsWith(".")) return true; // dotdir 不进(含 .ssh/.aws… 敏感目录)
  return SKIP_DIR_NAMES.has(name);
}

/** 取路径最后一段(/ 或 \ 分隔;跨平台;纯函数)。相对路径 `scripts/xxx.md` → `xxx.md`。 */
export function localBasename(p: string): string {
  const segs = (typeof p === "string" ? p : "").split(/[\\/]+/).filter(Boolean);
  return segs[segs.length - 1] ?? "";
}

/** 常用兜底搜索根(home 由调用方注入,纯函数不读 os):桌面 / 文档 / ThirdSpace 库。 */
export function defaultSearchRoots(home: string): string[] {
  const h = (typeof home === "string" ? home : "").replace(/\/+$/, "");
  if (!h) return [];
  return [`${h}/Desktop`, `${h}/Documents`, `${h}/ThirdSpace`];
}

/** 注入式 fs 目录项(把 node Dirent 收敛成三态布尔,本模块零 node 依赖)。 */
export interface LocalSearchDirent {
  name: string;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

/** 注入式 fs 端口(真实 IO 在 composition root):列目录 + 取文件大小。 */
export interface LocalSearchFs {
  readdir(dir: string): Promise<LocalSearchDirent[]>;
  fileSize(path: string): Promise<number | null>;
}

export interface LocalSearchHit {
  path: string;
  size: number | null;
  /** 扩展名(无扩展名 → "file"),渲候选卡/needApproval 卡用。 */
  type: string;
}

export interface LocalSearchResult {
  items: LocalSearchHit[];
  /** true = 命中结果数或访问节点数触顶提前停(可能还有更多同名文件),诚实告知用户。 */
  truncated: boolean;
}

function extType(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1) : "file";
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

/**
 * roots 去重 + 前缀去重(被更浅 root 覆盖的子目录 root 丢弃,避免重复扫描重叠子树)。
 * 末尾斜杠归一,空串剔除。纯函数,可单测。
 */
export function dedupeRoots(roots: string[]): string[] {
  const norm = roots
    .map((r) => (typeof r === "string" ? r.replace(/\/+$/, "") : ""))
    .filter(Boolean);
  const uniq = [...new Set(norm)].sort();
  const out: string[] = [];
  for (const r of uniq) {
    if (out.some((p) => r === p || r.startsWith(`${p}/`))) continue;
    out.push(r);
  }
  return out;
}

/**
 * [T-262] 在 scoped 目录集里按 basename 搜同名文件(BFS,scoped 非全盘)。
 * 硬边界:
 *   · **scoped**:只从注入的 roots(已授权目录 + 常用目录)出发,绝不上溯根盘;
 *   · **denylist**:每个文件/目录经 isSensitive 复检(命中 → 跳过,搜不到敏感文件);
 *   · **软链跳过**:防环 + 防软链指向敏感区;
 *   · **限深度**(maxDepth)+ **限结果数**(maxResults)+ **限访问节点数**(maxNodes)三重防爆。
 * 目标名大小写不敏感匹配(macOS 默认大小写不敏感文件系统)。任一 root readdir 失败(不存在/无权限)
 * → 静默跳过(诚实降级不炸)。
 */
export async function searchLocalByBasename(opts: {
  roots: string[];
  targetName: string;
  fs: LocalSearchFs;
  /** 敏感判定(注入 local-read-security 的 sensitivePathReason(p) != null)。 */
  isSensitive: (absPath: string) => boolean;
  maxDepth?: number;
  maxResults?: number;
  maxNodes?: number;
}): Promise<LocalSearchResult> {
  const maxDepth = opts.maxDepth ?? LOCAL_SEARCH_MAX_DEPTH;
  const maxResults = opts.maxResults ?? LOCAL_SEARCH_MAX_RESULTS;
  const maxNodes = opts.maxNodes ?? LOCAL_SEARCH_MAX_NODES;
  const target = opts.targetName.trim().toLowerCase();
  const items: LocalSearchHit[] = [];
  if (!target) return { items, truncated: false };

  const roots = dedupeRoots(opts.roots).filter((r) => !opts.isSensitive(r));
  const visited = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = roots.map((dir) => ({
    dir,
    depth: 0,
  }));
  let nodes = 0;
  let truncated = false;

  outer: while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (visited.has(dir)) continue;
    visited.add(dir);
    let dirents: LocalSearchDirent[];
    try {
      dirents = await opts.fs.readdir(dir);
    } catch {
      continue; // 目录不存在/无权限 → 跳过
    }
    for (const d of dirents) {
      nodes += 1;
      if (nodes > maxNodes) {
        truncated = true;
        break outer;
      }
      if (d.isSymlink) continue; // 软链一律跳过(防环 + 防指向敏感区)
      const child = joinPath(dir, d.name);
      if (opts.isSensitive(child)) continue; // denylist 硬拒
      if (d.isFile) {
        if (d.name.toLowerCase() === target) {
          items.push({
            path: child,
            size: await opts.fs.fileSize(child),
            type: extType(d.name),
          });
          if (items.length >= maxResults) {
            truncated = true;
            break outer;
          }
        }
      } else if (d.isDir) {
        if (depth < maxDepth && !shouldSkipSearchDir(d.name)) {
          queue.push({ dir: child, depth: depth + 1 });
        }
      }
    }
  }
  return { items, truncated };
}
