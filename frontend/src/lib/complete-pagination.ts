export type CompletePage<T> =
  | ReadonlyArray<T>
  | {
      readonly rows: ReadonlyArray<T>;
      readonly hasNext?: boolean;
    };

export interface CollectAllPagesOptions<T> {
  readonly pageSize: number;
  readonly getKey: (row: T) => string;
  readonly fetchPage: (
    page: number,
    pageSize: number,
  ) => Promise<CompletePage<T>>;
  readonly maxPages?: number;
}

/**
 * 收齐 page/pageSize 接口，同时防御服务端重复页或错误 hasNext 导致的死循环。
 * 顺序按首次出现稳定保留；服务端提供 hasNext 时优先采用，否则以短页为末页。
 */
export async function collectAllPages<T>(
  options: CollectAllPagesOptions<T>,
): Promise<T[]> {
  const { pageSize, getKey, fetchPage } = options;
  const maxPages = options.maxPages ?? 1_000;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize 必须是正整数");
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("maxPages 必须是正整数");
  }

  const collected: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page, pageSize);
    const normalized = Array.isArray(result)
      ? { rows: result as ReadonlyArray<T>, hasNext: undefined }
      : (result as { readonly rows: ReadonlyArray<T>; readonly hasNext?: boolean });
    if (normalized.rows.length === 0) return collected;

    let added = 0;
    for (const row of normalized.rows) {
      const key = getKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
      added += 1;
    }
    if (added === 0) return collected;

    const shouldContinue =
      normalized.hasNext ?? normalized.rows.length >= pageSize;
    if (!shouldContinue) return collected;
    if (page === maxPages) {
      throw new Error(`分页超过保护上限(${maxPages} 页)，已停止读取`);
    }
  }
  return collected;
}
