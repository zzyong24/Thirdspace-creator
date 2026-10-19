// 执行层沙箱(T-255a,SPEC 2026-07-11 execution-layer §2)。
//
// 布局:`<workspacesRoot>/<taskId>/{input/, out/}`。
//   - input/:任务 inputs 按 assetId 从对象存储**物化为只读文件**(引擎/executor 永不
//     直连 PGlite/资产库 —— 数据壁垒全留脑侧);
//   - out/:executor 唯一的产物区,跑完由编排收割成 manifest。
//
// 路径防护复用 local-reveal-security 模式(frontend/src/app/api/v1/local/
// local-reveal-security.ts 的三重防护):纯函数 resolve+relative 检查拦 `../`/绝对路径/
// NUL;收割时 lstat 跳过 symlink(拦「out/ 里放一个指向 /etc 的软链」)。敏感文件
// denylist 见 sensitive-files.ts(T-253 共库)。
import * as fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExecutionArtifact, ExecutionTaskInput } from "@creatoros/contract";
import { isSensitiveFileName } from "./sensitive-files";

export class SandboxPathViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxPathViolation";
  }
}

export class SandboxOutputLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxOutputLimitError";
  }
}

export interface SandboxPaths {
  taskId: string;
  dir: string;
  inputDir: string;
  outDir: string;
}

export interface MaterializedInput {
  assetId: string;
  mountAs: string;
  size: number;
  mimeType: string | null;
}

/**
 * 工作区根:CREATOROS_WORKSPACES_ROOT env 可配;缺省落 media root 旁
 * (`~/CreatorOS/workspaces`,与 media-root.ts 的 `~/CreatorOS/media` 同级)。
 */
export function resolveWorkspacesRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (env.CREATOROS_WORKSPACES_ROOT ?? "").trim();
  if (raw.length > 0) {
    if (raw === "~") return os.homedir();
    if (raw.startsWith("~/") || raw.startsWith("~\\")) {
      return path.resolve(os.homedir(), raw.slice(2));
    }
    return path.resolve(raw);
  }
  return path.join(os.homedir(), "CreatorOS", "workspaces");
}

// taskId 直接成为目录名 —— 只放行 id 安全字符集,拦一切路径语义字符。
const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/;

/** taskId → 沙箱目录绝对路径(taskId 非法/含路径语义字符 → throw)。 */
export function sandboxDirFor(root: string, taskId: string): string {
  if (!taskId || !SAFE_TASK_ID.test(taskId) || taskId.includes("..")) {
    throw new SandboxPathViolation(`invalid taskId: ${taskId}`);
  }
  return path.join(path.resolve(root), taskId);
}

/**
 * 第 1+2 重防护(local-reveal-security 模式,纯函数):把相对 key 解析到 base 下的
 * 绝对路径;绝对路径/NUL/逃逸 base → throw SandboxPathViolation。
 */
export function resolveInsideDir(baseDir: string, key: string): string {
  if (!key || key.includes("\0")) {
    throw new SandboxPathViolation("invalid path");
  }
  if (path.isAbsolute(key)) {
    throw new SandboxPathViolation("absolute path rejected");
  }
  const base = path.resolve(baseDir);
  const abs = path.resolve(base, key);
  const rel = path.relative(base, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SandboxPathViolation("path escapes sandbox");
  }
  return abs;
}

/** 建沙箱目录骨架(input/ + out/)。幂等(recursive mkdir)。 */
export async function createSandbox(
  root: string,
  taskId: string,
): Promise<SandboxPaths> {
  const dir = sandboxDirFor(root, taskId);
  const inputDir = path.join(dir, "input");
  const outDir = path.join(dir, "out");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  return { taskId, dir, inputDir, outDir };
}

/**
 * 输入物化:assetId → Assets service 写入 input/<mountAs> → 只读文件(0o444)。
 * local-fs 由资产模块优先用 CoW/reflink；远端存储仍可下载后普通写入。
 *   - mountAs 路径穿越防护(resolveInsideDir)+ 敏感文件名 denylist;
 *   - 资产读不到(越权/无文件)→ throw(诚实失败,不静默空跑)。
 */
export async function materializeInputs(
  sandbox: SandboxPaths,
  inputs: readonly ExecutionTaskInput[],
  materializeAsset: (
    assetId: string,
    destinationPath: string,
    exact?: {assetFileId?:string;fileDigest?:string},
  ) => Promise<{ size: number; mimeType: string } | null>,
): Promise<MaterializedInput[]> {
  const materialized: MaterializedInput[] = [];
  for (const input of inputs) {
    const abs = resolveInsideDir(sandbox.inputDir, input.mountAs);
    if (isSensitiveFileName(path.basename(abs))) {
      throw new SandboxPathViolation(
        `敏感文件名被拒绝物化: ${input.mountAs}`,
      );
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const loaded = await materializeAsset(input.assetId, abs,input.assetFileId||input.fileDigest?{assetFileId:input.assetFileId,fileDigest:input.fileDigest}:undefined);
    const stat = await fs.lstat(abs).catch(() => null);
    if (!loaded || !stat || !stat.isFile() || stat.size === 0) {
      throw new Error(`输入资产读取失败(assetId=${input.assetId})`);
    }
    // SEMANTIC_BOUNDARY_ALLOW: 流式字节摘要仅验证冻结源身份，不判断媒体内容。
    if(input.fileDigest){const hash=createHash("sha256");for await(const chunk of createReadStream(abs))hash.update(chunk);if(hash.digest("hex")!==input.fileDigest)throw new Error("冻结媒体字节已变化，请重新读取原始文件");}
    await fs.chmod(abs, 0o444);
    materialized.push({
      assetId: input.assetId,
      mountAs: input.mountAs,
      size: stat.size,
      mimeType: loaded.mimeType || null,
    });
  }
  return materialized;
}

// 收割清单的文件数硬顶(防 executor 疯写小文件撑爆清单)。
const MAX_ARTIFACTS = 500;

// 常见产物 ext → mime(与 lib/mime-ext.ts 的 mime→ext 表互逆的最小子集;未知 → null,
// 诚实不瞎猜 —— 采纳入库时 null 兜底 application/octet-stream)。
const MIME_FOR_EXT: Readonly<Record<string, string>> = {
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".csv": "text/csv",
  ".srt": "application/x-subrip",
  ".vtt": "text/vtt",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export function mimeForFileName(fileName: string): string | null {
  return MIME_FOR_EXT[path.extname(fileName).toLowerCase()] ?? null;
}

/**
 * 收割 out/ 产物清单:递归遍历,跳过 symlink(路径防护)与敏感文件名(denylist),
 * 总量超 maxOutputMB → throw SandboxOutputLimitError(任务诚实失败,不截断)。
 * 返回 path 为相对 out/ 的 POSIX 风格路径。
 */
export async function harvestArtifacts(
  sandbox: SandboxPaths,
  opts: { maxOutputMB: number },
): Promise<ExecutionArtifact[]> {
  const artifacts: ExecutionArtifact[] = [];
  let totalBytes = 0;
  const maxBytes = opts.maxOutputMB * 1024 * 1024;

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const stat = await fs.lstat(abs); // lstat:symlink 本体,不 follow
      if (stat.isSymbolicLink()) continue; // 软链一律不收(拦逃逸)
      if (stat.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!stat.isFile()) continue;
      if (isSensitiveFileName(entry.name)) continue; // denylist:不收不报,清单干净
      totalBytes += stat.size;
      if (totalBytes > maxBytes) {
        throw new SandboxOutputLimitError(
          `产物总量超过 maxOutputMB=${opts.maxOutputMB} 硬顶`,
        );
      }
      if (artifacts.length >= MAX_ARTIFACTS) {
        throw new SandboxOutputLimitError(
          `产物文件数超过 ${MAX_ARTIFACTS} 硬顶`,
        );
      }
      const rel = path.relative(sandbox.outDir, abs).split(path.sep).join("/");
      artifacts.push({
        path: rel,
        fileName: entry.name,
        size: stat.size,
        mimeType: mimeForFileName(entry.name),
      });
    }
  }

  await walk(sandbox.outDir);
  // 稳定排序(路径字典序)—— 清单可比对、测试可断言。
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  return artifacts;
}

/**
 * 按 manifest 相对路径读一个产物实体(采纳入库用)。路径防护 + 敏感名双检;
 * 文件不存在 → null(调用方诚实报「产物已丢失」)。
 */
export async function readArtifactBytes(
  root: string,
  taskId: string,
  relPath: string,
): Promise<Uint8Array | null> {
  const outDir = path.join(sandboxDirFor(root, taskId), "out");
  const abs = resolveInsideDir(outDir, relPath);
  if (isSensitiveFileName(path.basename(abs))) {
    throw new SandboxPathViolation(`敏感文件名拒绝读取: ${relPath}`);
  }
  const stat = await fs.lstat(abs).catch(() => null);
  if (!stat || !stat.isFile()) return null; // symlink/目录/缺失都不读
  return fs.readFile(abs);
}

/** 清理沙箱(丢弃/采纳后)。幂等:目录不存在 → no-op。 */
export async function cleanupSandbox(
  root: string,
  taskId: string,
): Promise<void> {
  const dir = sandboxDirFor(root, taskId);
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * 执行成功并已收割 out/ 后，输入副本与 work/ 中间产物已失去用途。
 * 只删除两个固定目录，保留 out/ 供用户确认，也保留未来可能新增的诊断目录。
 */
export async function pruneSandboxIntermediates(
  root: string,
  taskId: string,
): Promise<void> {
  const dir = sandboxDirFor(root, taskId);
  await Promise.all([
    fs.rm(path.join(dir, "input"), { recursive: true, force: true }),
    fs.rm(path.join(dir, "work"), { recursive: true, force: true }),
  ]);
}

export interface InterruptedRenderFrameSweepResult {
  directoriesRemoved: number;
  filesRemoved: number;
  bytesRemoved: number;
}

/**
 * 应用重启意味着上一进程的 HyperFrames 已经不再运行。定向删除其来不及回收的
 * `captured-frames/`，不碰 out/、正式素材或其他诊断文件。
 */
export async function sweepInterruptedRenderFrames(
  root: string,
): Promise<InterruptedRenderFrameSweepResult> {
  const result: InterruptedRenderFrameSweepResult = {
    directoriesRemoved: 0,
    filesRemoved: 0,
    bytesRemoved: 0,
  };
  const resolvedRoot = path.resolve(root);
  const taskEntries = await fs
    .readdir(resolvedRoot, { withFileTypes: true })
    .catch(() => []);

  async function measureDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await measureDirectory(abs);
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat?.isFile()) continue;
        result.filesRemoved += 1;
        result.bytesRemoved += stat.size;
      }
    }
  }

  async function walkForCapturedFrames(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.name === "captured-frames") {
        await measureDirectory(abs);
        await fs.rm(abs, { recursive: true, force: true });
        result.directoriesRemoved += 1;
        continue;
      }
      await walkForCapturedFrames(abs);
    }
  }

  for (const entry of taskEntries) {
    if (!entry.isDirectory() || !SAFE_TASK_ID.test(entry.name)) continue;
    const workDir = path.join(resolvedRoot, entry.name, "work");
    await walkForCapturedFrames(workDir);
  }
  return result;
}

/**
 * 孤儿沙箱启动清扫(T-207 sweep 兜底同族):workspaces 根下 mtime 超过 maxAgeMs
 * (默认 7 天)的任务目录一律清除(采纳/丢弃本会清,残留=进程中途被杀的孤儿)。
 * best-effort:单目录失败吞掉继续。返回清除数。
 */
export async function sweepOrphanSandboxes(
  root: string,
  opts: { maxAgeMs?: number; now?: () => number } = {},
): Promise<number> {
  const maxAgeMs = opts.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const nowMs = (opts.now ?? Date.now)();
  const resolvedRoot = path.resolve(root);
  const entries = await fs
    .readdir(resolvedRoot, { withFileTypes: true })
    .catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!SAFE_TASK_ID.test(entry.name)) continue; // 非任务目录不动
    const abs = path.join(resolvedRoot, entry.name);
    try {
      const stat = await fs.stat(abs);
      if (nowMs - stat.mtimeMs > maxAgeMs) {
        await fs.rm(abs, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // best-effort:单目录失败不阻断其余清扫
    }
  }
  return removed;
}
