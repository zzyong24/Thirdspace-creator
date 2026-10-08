import {workspaceObjectIdentity} from "./workspace-object-identity";
import { createHash } from "node:crypto";
import type { Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { ObjectStorageForCtx } from "./assets.service";
import { accountKeyPrefix } from "./object-storage";
import { ConflictError, UploadValidationError, requireAccountId } from "./assets.errors";
import { createPendingDocumentRepository, type DocumentCommit, type DocumentCommitAuthorization } from "./pending-document.repository";

export interface PendingDocumentInput {
  /** backend 依据真实 call/evidence 派生，禁止直接透传模型自报的键。 */
  operationKey: string;
  name: string;
  sourceUrl: string;
  fullText: string;
}
export interface PendingDocumentReceipt {
  assetId: string;
  fileId: string;
  name: string;
  sourceUrl: string;
  checksum: string;
  byteLength: number;
  committedAt: string;
}
// SEMANTIC_BOUNDARY_ALLOW: 摘要只固定提交身份与完整字节，不进行语义选择。
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function missingObject(error: unknown) {
  const value = error as { code?: string; name?: string } | null;
  return value?.code === "ENOENT" || value?.name === "NoSuchKey";
}
function receipt(row: DocumentCommit): PendingDocumentReceipt {
  if (!row.committedAt) throw new ConflictError("正文尚未完成提交");
  return { assetId: row.assetId, fileId: row.fileId, name: row.name, sourceUrl: row.sourceUrl,
    checksum: row.checksum, byteLength: row.byteLength, committedAt: row.committedAt };
}

/** assets 模块独占存储与落库。已提交回执只表示历史事实，不保证素材后来未被用户删除。 */
export function createPendingDocumentService(deps: {
  db: Db;
  objectStorageForCtx: ObjectStorageForCtx;
  now: () => string;
  /** 必填：backend 执行属主提供事务内权限/租约守卫，Worker 不获得该回调或数据库。 */
  authorize: DocumentCommitAuthorization;
}) {
  const repo = createPendingDocumentRepository(deps.db, deps.authorize);
  return {
    async submit(ctx: RequestContext, input: PendingDocumentInput, signal?: AbortSignal): Promise<PendingDocumentReceipt> {
      ctx = { ...ctx };
      const { operationKey, name, sourceUrl, fullText } = input;
      const workspace=workspaceObjectIdentity(ctx);
      if (!ctx.userId || !operationKey?.trim() || operationKey.length > 4096 ||
        !name?.trim() || name.length > 1000 || !fullText?.trim()) {
        throw new UploadValidationError("正文提交参数不完整");
      }
      let url: URL;
      try { url = new URL(sourceUrl); } catch { throw new UploadValidationError("正文来源 URL 无效"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || sourceUrl.length > 16384) {
        throw new UploadValidationError("正文来源 URL 无效");
      }
      if (fullText.length > 2 * 1024 * 1024) throw new UploadValidationError("正文超过 2 MiB 限制");
      const bytes = new TextEncoder().encode(fullText);
      if (bytes.byteLength > 2 * 1024 * 1024) throw new UploadValidationError("正文超过 2 MiB 限制");
      const identity = hash(JSON.stringify([ctx.userId, workspace.identity, operationKey]));
      const checksum = hash(bytes);
      const row = await repo.prepare(ctx, operationKey, {
        id: `document-commit-${identity}`, userId: ctx.userId, ...workspace.stamp,
        inputDigest: hash(JSON.stringify([name, sourceUrl, checksum])),
        assetId: `asset-document-${identity}`, fileId: `afile-document-${identity}`,
        storageKey: `${workspace.prefix}document/committed-${identity}.txt`,
        name, sourceUrl, checksum, byteLength: bytes.byteLength,
        createdAt: deps.now(), committedAt: null,
      }, signal);
      if (row.committedAt) return receipt(row);
      signal?.throwIfAborted();
      const storage = await deps.objectStorageForCtx(ctx);
      signal?.throwIfAborted();
      let stored: Uint8Array | null;
      try { stored = await storage.getObject(row.storageKey); }
      catch (error) { if (!missingObject(error)) throw error; stored = null; }
      signal?.throwIfAborted();
      if (stored === null) {
        // LocalFS 原子发布完整文件；S3 PutObject 也只发布完整对象。同键并发只允许同一摘要。
        await storage.putObject({ storageKey: row.storageKey, bytes, mimeType: "text/plain", assetType: "document" });
        stored = await storage.getObject(row.storageKey);
      }
      signal?.throwIfAborted();
      if (stored.byteLength !== row.byteLength || hash(stored) !== row.checksum) {
        throw new ConflictError("已准备的正文字节与提交摘要不符");
      }
      return receipt(await repo.commit(ctx, operationKey, row, fullText, deps.now(), signal));
    },
  };
}
