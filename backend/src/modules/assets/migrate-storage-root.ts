// [T-162] 存储目录迁移 —— 用户改「媒体存储目录」时,把旧 root 下所有对象整棵树
// (含 T-157 的 `<accountId>/<assetType>/<uuid>` 分区 + `.meta.json` sidecar)拷到新 root。
// storageKey 是相对 root 的 → DB 里每个 asset 的 storageKey 不用改,只搬物理文件。
//
// 事务性(copy-verify,配合 service 层 swap-delete):本函数只做**拷贝 + 校验**(风险步),
// 抛错即调用方**不 persist 新 rootPath**(旧目录原封、系统仍可读旧 blob)。删旧目录由调用方
// 在 persist 成功后 best-effort 做。fs.cp 内部处理跨设备(rename 跨盘会失败,cp 不会)。

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface StorageMigrationResult {
  /** 拷贝的文件数(含 sidecar)。 */
  readonly migrated: number;
  /** 无需迁移(同路径 / 旧目录不存在或空)。 */
  readonly skipped: boolean;
}

/** 递归数一个目录下的文件数(不存在 → 抛,调用方 catch 成 skipped)。 */
async function countFiles(root: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      total += await countFiles(full);
    } else if (ent.isFile()) {
      total += 1;
    }
  }
  return total;
}

/**
 * 把 `oldRoot` 下所有文件拷到 `newRoot`(保留相对结构)。**不删 oldRoot**(调用方 persist
 * 配置成功后再删)。拷贝或校验失败 → 抛错(调用方据此不 persist 新路径)。
 *
 * - 同路径(resolve 后相等)→ no-op(skipped)。
 * - oldRoot 不存在 / 空 → 无文件可搬(skipped)。
 * - 否则:`fs.cp(recursive, force)` 合并进 newRoot(newRoot 已由 service 层 mkdir),
 *   再数 newRoot 文件数 ≥ oldRoot 原文件数(合并只增不减)→ 通过。
 */
export async function migrateStorageRoot(
  oldRoot: string,
  newRoot: string,
): Promise<StorageMigrationResult> {
  if (path.resolve(oldRoot) === path.resolve(newRoot)) {
    return { migrated: 0, skipped: true };
  }

  // 旧目录不存在 / 读不了 → 无文件可搬。
  let oldCount: number;
  try {
    oldCount = await countFiles(oldRoot);
  } catch {
    return { migrated: 0, skipped: true };
  }
  if (oldCount === 0) return { migrated: 0, skipped: true };

  // 拷贝旧树 → 新(合并;fs.cp 跨设备安全)。抛错(权限/空间)→ 调用方不 persist。
  await fs.cp(oldRoot, newRoot, { recursive: true, force: true });

  // 校验:合并后新目录文件数应 ≥ 旧目录原文件数。
  const afterCount = await countFiles(newRoot);
  if (afterCount < oldCount) {
    throw new Error(
      `storage migration verify failed: newRoot has ${afterCount} files, expected ≥ ${oldCount}`,
    );
  }

  return { migrated: oldCount, skipped: false };
}
