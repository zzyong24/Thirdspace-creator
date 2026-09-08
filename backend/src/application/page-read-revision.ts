import { sql } from "drizzle-orm";
import type { Db } from "../db";

/** 缓存失效元数据；不返回业务内容，页面仍须验证当前用户/账号。 */
export function createPageReadRevisionReader(db: Db) {
  return async (): Promise<string> => {
    const result = await db.execute(sql`select version::text as version from page_read_revision where id = 1`);
    const row = result.rows[0] as { version?: unknown } | undefined;
    if (typeof row?.version !== "string") throw new Error("PAGE_READ_REVISION_UNAVAILABLE");
    return row.version;
  };
}
