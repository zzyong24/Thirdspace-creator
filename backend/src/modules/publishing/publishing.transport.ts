import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./publishing.errors";
import type { PublishingService } from "./publishing.service";
import type {
  PublicationRow,
  PublicationRevisionRow,
} from "./publishing.repository";
import type {
  PublicationResource,
  PublicationRevisionResource,
} from "./publishing.schema";

// Publishing transport (foundation §5.4) — the module's contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// production/artifacts transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from PUBLISHING_OP_IDS (adding the module = registering it).

export const PUBLISHING_OP_IDS = [
  "outputs.publications.list",
  "outputs.publications.create",
  "outputs.publications.register",
  "publications.get",
  "publications.revisions.create",
  "publications.revisions.list",
  "publications.transition",
] as const;

function toPublicationResource(row: PublicationRow): PublicationResource {
  return {
    id: row.id,
    contentOutputId: row.contentOutputId,
    platform: row.platform as PublicationResource["platform"],
    accountReference: row.accountReference,
    status: row.status as PublicationResource["status"],
    // currentRevisionId is non-nullable in the contract (id, non-empty string).
    // createPublication auto-mints revision-1 (OQ4) so this is always a real id;
    // coerce a defensive null to "" should a legacy row ever lack one (the FE keys
    // off the publication id, not this, for routing).
    currentRevisionId: row.currentRevisionId ?? "",
    externalId: row.externalId ?? null,
    externalUrl: row.externalUrl ?? null,
    scheduledAt: row.scheduledAt ?? null,
    publishedAt: row.publishedAt ?? null,
    removedAt: row.removedAt ?? null,
    // [T-073] 平台侧可见性(非空 = 抖音端「仅自己可见/已隐藏」;列表读侧默认过滤)。
    hiddenAt: row.hiddenAt ?? null,
    // [T-033] 平台侧审核状态原值(detail 导出 .xlsx「审核状态」列,如「已通过」/「仅自己可见」/
    // 「私密」/「审核中」/「未通过」);列表默认按 '已通过' 过滤,NULL = 旧数据向后兼容视为可见。
    platformStatus: row.platformStatus ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevisionResource(
  row: PublicationRevisionRow,
): PublicationRevisionResource {
  return {
    id: row.id,
    publicationId: row.publicationId,
    revisionNumber: row.revisionNumber,
    title: row.title,
    description: row.description,
    coverAssetId: row.coverAssetId ?? null,
    category: row.category,
    series: row.series,
    platformTags: (row.platformTags ?? []) as string[],
    platformSettings: (row.platformSettings ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

function paginationFrom(query: unknown): {
  limit: number;
  offset: number;
  includeHidden?: boolean;
} {
  // The contract paginationQuery is { page, pageSize } (1-based). Map it to the
  // repository's limit/offset. Tolerate a raw { limit, offset } too (the
  // module's own tests drive the transport directly).
  // [T-033] includeHidden: ?hidden=1 全显私密/未通过,默认过滤(双闸 hidden_at + 未通过)。
  const q = (query ?? {}) as {
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
    hidden?: unknown;
  };
  const limit = q.limit ?? q.pageSize ?? 20;
  const offset =
    q.offset ?? (typeof q.page === "number" ? (q.page - 1) * limit : 0);
  // hidden=true / "true" / 1 都视为开;'false'/0/undefined → 默认过滤。
  let includeHidden = false;
  if (q.hidden === true || q.hidden === "true" || q.hidden === 1) {
    includeHidden = true;
  }
  return { limit, offset, includeHidden };
}

export function createPublishingTransport(
  serviceFactory: () => PublishingService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All owned ops are persisted. No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        outputId?: string;
        publicationId?: string;
      };

      switch (endpoint.id) {
        case "outputs.publications.list": {
          const page = paginationFrom(query);
          const rows = await service.listPublications(ctx, p.outputId ?? "", page);
          return {
            data: rows.map(toPublicationResource),
            meta: {
              requestId,
              page: Math.floor(page.offset / page.limit) + 1,
              pageSize: page.limit,
              total: rows.length,
            },
          };
        }
        case "outputs.publications.create": {
          const b = (body ?? {}) as {
            platform: string;
            accountReference: string;
          };
          const row = await service.createPublication(ctx, p.outputId ?? "", b);
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        case "outputs.publications.register": {
          // [T-055h③/T-063c] 登记已发布:粘链接解析出的 external_id 直接落一条
          // published publication —— 复用数据底座的 createImportedPublication
          // (幂等于 (platform, externalId),重复登记返回既有行)。contract 的
          // currentRevisionId 非空,故行上没有 revision 时补铸一条(title 取 body.title,
          // 缺省空)再回读 —— 与 createPublication 的 OQ4 auto-mint 同语义。
          const b = (body ?? {}) as {
            platform: string;
            externalId: string;
            externalUrl?: string | null;
            publishedAt?: string | null;
            title?: string;
          };
          let row = await service.createImportedPublication(
            ctx,
            p.outputId ?? "",
            {
              platform: b.platform,
              externalId: b.externalId,
              externalUrl: b.externalUrl ?? null,
              publishedAt: b.publishedAt ?? null,
            },
          );
          if (!row.currentRevisionId) {
            await service.createRevision(ctx, row.id, {
              title: b.title ?? "",
              description: "",
            });
            row = await service.getPublication(ctx, row.id);
          }
          // [T-321 治本] 登记已发布顺带把属主项目跃迁到「已发布/复盘」态,绑定后立刻显已发布
          //   (不用等日拉)。best-effort:内部吞错,绝不阻断登记主流程。
          await service.markOwnerPublished(ctx, p.outputId ?? "");
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        case "publications.get": {
          const row = await service.getPublication(ctx, p.publicationId ?? "");
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        case "publications.revisions.create": {
          const b = (body ?? {}) as {
            title: string;
            description: string;
            // SPEC §8「多平台 标签」:可选标签集随新版本一起落库(append 不可变 revision)。
            platformTags?: string[];
          };
          const row = await service.createRevision(
            ctx,
            p.publicationId ?? "",
            b,
          );
          return { data: toRevisionResource(row), meta: { requestId } };
        }
        case "publications.revisions.list": {
          const page = paginationFrom(query);
          const rows = await service.listRevisions(
            ctx,
            p.publicationId ?? "",
            page,
          );
          return {
            data: rows.map(toRevisionResource),
            meta: {
              requestId,
              page: Math.floor(page.offset / page.limit) + 1,
              pageSize: page.limit,
              total: rows.length,
            },
          };
        }
        case "publications.transition": {
          const b = (body ?? {}) as { status: string };
          const row = await service.transition(ctx, p.publicationId ?? "", b);
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
