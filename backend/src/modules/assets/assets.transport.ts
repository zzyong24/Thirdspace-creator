import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { AssetsService } from "./assets.service";
import type {
  AssetRow,
  AssetFileRow,
  MaterialLinkRow,
} from "./assets.repository";
import type {
  AssetResource,
  AssetFileResource,
  AssetUpload,
} from "./assets.schema";
import type { MaterialLinkResource } from "@creatoros/contract";

// Assets transport (foundation §5.4) — the module's 7 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// knowledge/projects transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, mints a per-ctx service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from ASSET_OP_IDS (adding the module = registering it).

export const ASSET_OP_IDS = [
  "assets.downloadUrl",
  "assets.list",
  "assets.uploads.create",
  "assets.uploads.complete",
  "assets.get",
  "assets.files.create",
  "assets.trash",
  "assets.restore",
  "assets.favorite.toggle",
  "assets.usage.list",
] as const;

// [T-061] file: the asset's CURRENT asset_file row (投影 mimeType/fileSize/尺寸/时长
// 进 assetResource;此前 list 不带 → 前端 fixture 兜底显示 octet-stream/0B)。null =
// headless row(无文件)→ 字段落 null,诚实不编。
function toAssetResource(row: AssetRow, file: AssetFileRow | null): AssetResource {
  return {
    id: row.id,
    userId: row.userId,
    // currentFileId is nullable in the DB until the first file is linked; the
    // contract DTO is a non-null `id`. A completed asset always has one set; the
    // transport coerces the pre-link null to "" so the wire shape stays valid for
    // the rare (never-listed) headless row.
    currentFileId: row.currentFileId ?? "",
    assetType: row.assetType as AssetResource["assetType"],
    name: row.name,
    description: row.description,
    status: row.status as AssetResource["status"],
    isFavorite: row.isFavorite ?? false,
    mimeType: file?.mimeType ?? null,
    fileSize: file?.fileSize ?? null,
    width: file?.width ?? null,
    height: file?.height ?? null,
    durationMs: file?.durationMs ?? null,
    // [T-146 切片 a] 文档抽取投影(current file 派生)。materialSummary 从 mediaMetadata 取
    // (asset-classify 的 aiDescription 与它同库不同键,互不干扰)。非文档/未抽 → null(诚实不编)。
    extractStatus: file?.extractStatus ?? null,
    materialSummary: extractMaterialSummary(file),
    extractedText: file?.extractedText ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// [T-146 切片 a] 从 current file 的 mediaMetadata 取「资料要点卡」。存在且为对象 → 原样透传
// (wire 已声明 record<string, unknown> nullable);缺省/形状不对 → null(不构造空壳冒充有卡)。
function extractMaterialSummary(
  file: AssetFileRow | null,
): Record<string, unknown> | null {
  const meta = (file?.mediaMetadata ?? null) as Record<string, unknown> | null;
  const summary = meta?.materialSummary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    return summary as Record<string, unknown>;
  }
  return null;
}

// 用料反查 row → contract materialLinkResource. MaterialLinkRow ($inferSelect)
// already carries the wire fields; coerce the nullable contentOutputId and
// narrow entityType to the DTO union.
function toMaterialLinkResource(row: MaterialLinkRow): MaterialLinkResource {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    entityType: row.entityType as MaterialLinkResource["entityType"],
    entityId: row.entityId,
    role: row.role,
    stage: row.stage,
    addedByType: row.addedByType,
    priority: row.priority,
    createdAt: row.createdAt,
  };
}

function toAssetFileResource(row: AssetFileRow): AssetFileResource {
  return {
    id: row.id,
    assetId: row.assetId,
    versionNumber: row.versionNumber,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    checksum: row.checksum,
    width: row.width ?? null,
    height: row.height ?? null,
    durationMs: row.durationMs ?? null,
    mediaMetadata: (row.mediaMetadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createAssetsTransport(
  serviceFactory: (ctx: RequestContext) => AssetsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All 7 ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);
      // [T-061] Resolve one asset row's current file for the 投影(单行 case 共用)。
      const withFile = async (row: AssetRow): Promise<AssetResource> => {
        const files = row.currentFileId
          ? await service.listFilesByIds(ctx, [row.currentFileId])
          : [];
        return toAssetResource(row, files[0] ?? null);
      };

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { assetId?: string; uploadId?: string };
      const q = (query ?? {}) as { page?: number; pageSize?: number };

      switch (endpoint.id) {
        case "assets.list": {
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const rows = await service.listAssets(ctx, {
            limit: pageSize,
            cursor: null,
          });
          const fileIds = rows
            .map((r) => r.currentFileId)
            .filter((v): v is string => Boolean(v));
          const filesById = new Map(
            (await service.listFilesByIds(ctx, fileIds)).map(
              (f) => [f.id, f] as const,
            ),
          );
          return {
            data: rows.map((r) =>
              toAssetResource(r, r.currentFileId ? filesById.get(r.currentFileId) ?? null : null),
            ),
            meta: {
              requestId: ctx.requestId,
              page,
              pageSize,
              total: rows.length,
            },
          };
        }
        case "assets.uploads.create": {
          const b = (body ?? {}) as {
            assetType: string;
            mimeType: string;
            fileSize: number;
          };
          const dto: AssetUpload = await service.createUpload(ctx, b);
          return { data: dto, meta: { requestId: ctx.requestId } };
        }
        case "assets.uploads.complete": {
          const b = (body ?? {}) as { name: string };
          const row = await service.completeUpload(ctx, p.uploadId ?? "", b);
          return {
            data: await withFile(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.downloadUrl": {
          // [T-055d SPEC §7.2] 下载 = 复制:签名 GET URL + 建议保存名。
          const dto = await service.getDownloadUrl(ctx, p.assetId ?? "");
          return { data: dto, meta: { requestId: ctx.requestId } };
        }
        case "assets.get": {
          const row = await service.getAsset(ctx, p.assetId ?? "");
          return {
            data: await withFile(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.files.create": {
          const b = (body ?? {}) as { storageKey: string };
          const row = await service.addAssetFile(ctx, p.assetId ?? "", b);
          return {
            data: toAssetFileResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.trash": {
          const row = await service.trashAsset(ctx, p.assetId ?? "");
          return {
            data: await withFile(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.restore": {
          const row = await service.restoreAsset(ctx, p.assetId ?? "");
          return {
            data: await withFile(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.favorite.toggle": {
          const row = await service.toggleFavorite(ctx, p.assetId ?? "");
          return {
            data: await withFile(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.usage.list": {
          const rows = await service.listAssetUsage(ctx, p.assetId ?? "");
          return {
            data: rows.map(toMaterialLinkResource),
            meta: {
              requestId: ctx.requestId,
              page: 1,
              pageSize: rows.length,
              total: rows.length,
            },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
