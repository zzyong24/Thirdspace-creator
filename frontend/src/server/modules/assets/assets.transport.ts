import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { AssetsService } from "./assets.service";
import type { AssetRow, AssetFileRow } from "./assets.repository";
import type {
  AssetResource,
  AssetFileResource,
  AssetUpload,
} from "./assets.schema";

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
  "assets.list",
  "assets.uploads.create",
  "assets.uploads.complete",
  "assets.get",
  "assets.files.create",
  "assets.trash",
  "assets.restore",
] as const;

function toAssetResource(row: AssetRow): AssetResource {
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
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
          return {
            data: rows.map(toAssetResource),
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
            data: toAssetResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.get": {
          const row = await service.getAsset(ctx, p.assetId ?? "");
          return {
            data: toAssetResource(row),
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
            data: toAssetResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "assets.restore": {
          const row = await service.restoreAsset(ctx, p.assetId ?? "");
          return {
            data: toAssetResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
