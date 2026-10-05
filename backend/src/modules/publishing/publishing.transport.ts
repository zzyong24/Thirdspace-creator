import { ENDPOINTS,iso8601, type Endpoint, type RequestContext, type Transport } from "@creatoros/contract";
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
  "publications.visualNotes.export",
  "outputs.publications.list",
  "outputs.publications.create",
  "outputs.publications.register",
  "publications.get",
  "publications.revisions.create",
  "publications.revisions.list",
  "publications.transition",
] as const;

export function toPublicationResource(row: PublicationRow): PublicationResource {
  // [B-02] currentRevisionId 在 contract 里是非空 id(z.string().min(1))。所有写路径
  //   (createPublication auto-mint / register 补铸 / createImportedPublication 原子建
  //   revision-1)都保证它是真实 id;存量 null 由迁移 0040 回填。真为 null = 数据不变量被
  //   破坏 —— 诚实抛错让上游 500 暴露,绝不用 "" 占位伪装(空串会让 client 的 Zod parse 整
  //   条响应失败,毒化 publication list/detail)。
  if (!row.currentRevisionId) {
    throw new Error(
      `publishing invariant violation: publication ${row.id} has no current revision`,
    );
  }
  return {
    id: row.id,
    contentOutputId: row.contentOutputId,
    accountId:row.accountId,groupId:row.groupId??null,
    platform: row.platform as PublicationResource["platform"],
    accountReference: row.accountReference,
    status: row.status as PublicationResource["status"],
    currentRevisionId: row.currentRevisionId,
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

export function toRevisionResource(
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

// [DATA-M03] register 入口规范化辅助:契约输入未在 dispatch 层做 Zod 校验,故在 transport
//   兜底,防脏值落库后毒化 publicationResource 的读回解析(见 register handler 注释)。
function normalizePublishedAt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // 与输出 publicationResource.publishedAt 同一 iso8601 校验;非法 → null(回退 now)。
  return iso8601.safeParse(trimmed).success ? trimmed : null;
}

function normalizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function paginationFrom(query: unknown): {
  limit: number;
  offset: number;
} {
  // The contract paginationQuery is { page, pageSize } (1-based). Map it to the
  // repository's limit/offset. Tolerate a raw { limit, offset } too (the
  // module's own tests drive the transport directly).
  const q = (query ?? {}) as {
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
  };
  const limit = q.limit ?? q.pageSize ?? 20;
  const offset =
    q.offset ?? (typeof q.page === "number" ? (q.page - 1) * limit : 0);
  // 旧 hidden 参数由结构解析自然忽略；T-595 后下游不再维护可见性分支。
  return { limit, offset };
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
        case "publications.visualNotes.export": {
          const parsed=ENDPOINTS.exportPublicationVisualNote.body!.parse(body);
          return {data:await service.exportVisualNote(ctx,p.publicationId??"",parsed.revisionId,parsed.pageIndex),meta:{requestId}};
        }
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
          // published publication。[T-323 治本] 改走 registerOwnerPublication —— 它内部
          // 处理「作品已被日拉自动建的 imported 空壳占用」:命中空壳时把作品重锚到用户手动
          // 项目的 output + 归档空壳(而非返回锚在空壳上的既有行,让用户项目永远卡立项)。
          // 幂等于 (platform, externalId);属主项目跃迁已发布(markOwnerPublished)已合并进
          // 该方法(best-effort,内部吞错不阻断登记),故此处不再单独调。contract 的
          // currentRevisionId 非空,行上没有 revision 时补铸一条(title 取 body.title,缺省
          // 空)再回读 —— 与 createPublication 的 OQ4 auto-mint 同语义。
          const b = (body ?? {}) as {
            platform: string;
            externalId: string;
            externalUrl?: string | null;
            publishedAt?: string | null;
            title?: string;
          };
          // [DATA-M03] 入口规范化(dispatch 不按 contract 校验 body,故在此兜底,防脏值毒化
          //   publicationResource 的解析):
          //   - publishedAt:非合法 ISO8601 → null(输出是 iso8601|null,落脏串会让读回解析失败;
          //     置 null 后 repo 回退到 now,不阻断登记这条事实)。
          //   - externalUrl:trim;空串 → null(resource 允许任意字符串,仅做去空白/空值归一)。
          const normExternalUrl = normalizeExternalUrl(b.externalUrl);
          const normPublishedAt = normalizePublishedAt(b.publishedAt);
          let row = await service.registerOwnerPublication(
            ctx,
            p.outputId ?? "",
            {
              platform: b.platform,
              externalId: b.externalId,
              externalUrl: normExternalUrl,
              publishedAt: normPublishedAt,
              // [B-02] 登记项目标题带进原子补铸的 revision-1(currentRevisionId 恒非空;
              //   下方补铸分支仅为存量 null 行自愈,新建路径不再触发)。
              title: b.title ?? "",
            },
          );
          if (!row.currentRevisionId) {
            // 存量兜底:迁移前遗留的 null-current 行(理论上迁移 0040 已清)—— 补铸一版避免
            //   toPublicationResource 抛不变量错。
            await service.createRevision(ctx, row.id, {
              title: b.title ?? "",
              description: "",
            });
            row = await service.getPublication(ctx, row.id);
          }
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
