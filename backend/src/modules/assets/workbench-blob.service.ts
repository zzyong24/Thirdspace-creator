import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { ObjectStorageForCtx } from "./assets.service";
import { accountKeyPrefix } from "./object-storage";

/** 工作台可持久保存的产物类型；扩展类型须先明确存储与预览契约。 */
export type WorkbenchBlobMime =
  | "text/html"
  | "text/markdown"
  | "text/csv"
  | "image/png"
  | "application/pdf";

/** 单份快照最大 20 MiB，避免把无界模型输出直接写入对象存储。 */
export const WORKBENCH_BLOB_MAX_BYTES = 20 * 1024 * 1024;

const EXTENSIONS: Readonly<Record<WorkbenchBlobMime, string>> = {
  "text/html": "html",
  "text/markdown": "md",
  "text/csv": "csv",
  "image/png": "png",
  "application/pdf": "pdf",
};

export interface WorkbenchBlobScope {
  taskId: string;
  operationId: string;
  mime: WorkbenchBlobMime;
}

export interface WorkbenchBlobInput extends WorkbenchBlobScope {
  bytes: Uint8Array;
}

export interface WorkbenchBlobRef extends WorkbenchBlobScope {
  hash: string;
}

export interface WorkbenchBlobReceipt {
  hash: string;
  size: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredId(value: string | null | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    throw new Error(`${name} 无效`);
  }
  return value;
}

function requireMime(mime: WorkbenchBlobMime): string {
  if (!Object.hasOwn(EXTENSIONS, mime)) throw new Error("不支持的产物 MIME");
  return EXTENSIONS[mime];
}

function requireHash(hash: string): void {
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("产物哈希无效");
  }
}

/**
 * key 只由已认证上下文、可信执行操作 ID 与内容哈希生成。账号头段沿用现有
 * ObjectStoragePort 分区；账号原值再进入哈希段，避免安全字符收窄后的碰撞。
 * 此函数不对模型开放，读取方也只能提供作用域与哈希，不能指定任意 key。
 */
function scopedKey(ctx: RequestContext, scope: WorkbenchBlobScope, hash: string): string {
  const userId = requiredId(ctx.userId, "userId");
  const accountId = requiredId(ctx.accountId, "accountId");
  if (accountId.length > 128) throw new Error("accountId 无效");
  const taskId = requiredId(scope.taskId, "taskId");
  const operationId = requiredId(scope.operationId, "operationId");
  const ext = requireMime(scope.mime);
  requireHash(hash);
  return `${accountKeyPrefix(accountId)}workbench/${sha256(userId)}/${sha256(accountId)}/${sha256(taskId)}/${sha256(operationId)}/${hash}.${ext}`;
}

function isMissing(error: unknown): boolean {
  const candidate = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return candidate?.code === "ENOENT" || candidate?.name === "NoSuchKey" ||
    candidate?.name === "NotFound" || candidate?.$metadata?.httpStatusCode === 404;
}

/**
 * 只经现有对象存储端口操作字节，不持有数据库连接。调用者必须提供服务端验证过的
 * RequestContext 和任务/操作 ID；模型参数不能用来构造这些可信字段。
 */
export function createWorkbenchBlobService(objectStorageForCtx: ObjectStorageForCtx) {
  async function verify(
    storage: Awaited<ReturnType<ObjectStorageForCtx>>,
    key: string,
    hash: string,
    mime: WorkbenchBlobMime,
    expectedSize?: number,
  ): Promise<Uint8Array> {
    const [head, bytes] = await Promise.all([
      storage.headObject(key),
      storage.getObject(key),
    ]);
    if (head.mimeType !== mime || head.fileSize !== bytes.byteLength ||
        bytes.byteLength === 0 || bytes.byteLength > WORKBENCH_BLOB_MAX_BYTES ||
        (expectedSize !== undefined && bytes.byteLength !== expectedSize) ||
        sha256(bytes) !== hash) {
      throw new Error("已保存的产物字节或 MIME 校验不匹配");
    }
    return Uint8Array.from(bytes);
  }

  return {
    async submit(ctx: RequestContext, input: WorkbenchBlobInput): Promise<WorkbenchBlobReceipt> {
      // 先复制字节，防止调用方在异步存储期间修改同一 Uint8Array。
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 ||
          input.bytes.byteLength > WORKBENCH_BLOB_MAX_BYTES) {
        throw new Error("产物字节为空或超出大小上限");
      }
      const bytes = Uint8Array.from(input.bytes);
      const hash = sha256(bytes);
      const key = scopedKey(ctx, input, hash);
      const storage = await objectStorageForCtx(ctx);

      try {
        await storage.getObject(key);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await storage.putObject({ storageKey: key, bytes, mimeType: input.mime, assetType: "workbench" });
      }
      // 重试与新写入均按真实回读复核；已有同键坏字节绝不覆盖。
      await verify(storage, key, hash, input.mime, bytes.byteLength);
      return { hash, size: bytes.byteLength };
    },

    async read(ctx: RequestContext, ref: WorkbenchBlobRef): Promise<Uint8Array> {
      const key = scopedKey(ctx, ref, ref.hash);
      const storage = await objectStorageForCtx(ctx);
      try {
        return await verify(storage, key, ref.hash, ref.mime);
      } catch (error) {
        if (isMissing(error)) throw new Error("产物不存在或无权读取");
        throw error;
      }
    },

    /** 对账专用三态查询：只有对象存储明确 404 才返回 absent，其它异常都保持 unknown。 */
    async inspect(ctx: RequestContext, ref: WorkbenchBlobRef): Promise<"present" | "absent" | "unknown"> {
      const key = scopedKey(ctx, ref, ref.hash);
      try {
        const storage = await objectStorageForCtx(ctx);
        await verify(storage, key, ref.hash, ref.mime);
        return "present";
      } catch (error) {
        return isMissing(error) ? "absent" : "unknown";
      }
    },
  };
}

export type WorkbenchBlobService = ReturnType<typeof createWorkbenchBlobService>;
