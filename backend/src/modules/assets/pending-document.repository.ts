import { and, eq, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { pendingDocumentCommits } from "../../schema/pending-document-commits";
import { assets, assetFiles } from "./assets.db-schema";
import { ConflictError } from "./assets.errors";

export type DocumentCommit = typeof pendingDocumentCommits.$inferSelect;
export type DocumentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DocumentCommitAuthorization = (ctx: RequestContext, operationKey: string, tx: DocumentTransaction) => Promise<void>;

export function createPendingDocumentRepository(db: Db, authorize: DocumentCommitAuthorization) {
  const scope = (row: DocumentCommit) => and(
    eq(pendingDocumentCommits.id, row.id), eq(pendingDocumentCommits.userId, row.userId),
    eq(pendingDocumentCommits.accountId, row.accountId),
  );
  function check(row: DocumentCommit | undefined, expected: DocumentCommit): DocumentCommit {
    if (!row || row.inputDigest !== expected.inputDigest) throw new ConflictError("正文提交键已绑定其他内容");
    return row;
  }
  return {
    async prepare(ctx: RequestContext, operationKey: string, expected: DocumentCommit, signal?: AbortSignal) {
      return db.transaction(async (tx) => {
        const existing = (await tx.select().from(pendingDocumentCommits).where(scope(expected)))[0];
        if (existing) {
          check(existing, expected);
          if (existing.committedAt) return existing;
        }
        signal?.throwIfAborted();
        await authorize(ctx, operationKey, tx);
        signal?.throwIfAborted();
        await tx.insert(pendingDocumentCommits).values(expected).onConflictDoNothing();
        signal?.throwIfAborted();
        // 必须使用唯一插入胜者的身份，不能继续使用本次预生成对象。
        return check((await tx.select().from(pendingDocumentCommits).where(scope(expected)))[0], expected);
      });
    },
    async commit(ctx: RequestContext, operationKey: string, expected: DocumentCommit, fullText: string, committedAt: string, signal?: AbortSignal) {
      return db.transaction(async (tx) => {
        const existing = check((await tx.select().from(pendingDocumentCommits).where(scope(expected)))[0], expected);
        if (existing.committedAt) return existing;
        // 这里由执行属主在同事务内重新检查当前租约、取消、真实归属；准备字节不代表授权。
        // prepare 与 commit 都先取得执行权限锁、再锁回执，避免相反的锁顺序。
        signal?.throwIfAborted();
        await authorize(ctx, operationKey, tx);
        signal?.throwIfAborted();
        const row = check((await tx.select().from(pendingDocumentCommits).where(scope(expected)).for("update"))[0], expected);
        if (row.committedAt) return row;
        signal?.throwIfAborted();
        await tx.insert(assets).values({
          id: row.assetId, userId: row.userId, accountId: row.accountId, currentFileId: row.fileId,
          assetType: "document", name: row.name, status: "pending", createdAt: committedAt, updatedAt: committedAt,
        });
        signal?.throwIfAborted();
        await tx.insert(assetFiles).values({
          id: row.fileId, assetId: row.assetId, versionNumber: 1, storageKey: row.storageKey,
          mimeType: "text/plain", fileSize: row.byteLength, checksum: row.checksum,
          mediaMetadata: { sourceUrl: row.sourceUrl }, extractedText: fullText, extractStatus: "done", createdAt: committedAt,
        });
        signal?.throwIfAborted();
        const committed = (await tx.update(pendingDocumentCommits).set({ committedAt }).where(scope(row)).returning())[0];
        // 等待数据库写入期间停止时回滚整个事务，不留下素材半成品。
        signal?.throwIfAborted();
        return committed!;
      });
    },
  };
}
