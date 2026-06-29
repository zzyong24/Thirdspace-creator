import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "@creatoros/backend";
import type { TaxonomyService } from "./taxonomy.service";

// Taxonomy transport (Step 4) — the module's contract ops served over REAL SQL,
// behind the same /api/v1/dispatch route. Mirrors the realized persistence
// transport (backend/src/persistence-transport.ts): a `Transport` whose
// `request(endpoint, input, ctx)` switches on `endpoint.id`, delegates to the
// service, and returns the SPEC §14 envelope. A persisted op reached with NO
// ctx is an unauthenticated dispatch → AuthenticationError (→ 401). Ops this
// transport does not own throw UnsupportedOperationError so the composite falls
// back to the mock without masking real errors.
//
// The opId → service mapping is the registry this module owns; the composite in
// persistence-client builds PERSISTED_OPS from TAXONOMY_OP_IDS (no edits to
// unrelated handlers — adding the module = registering it).

export const TAXONOMY_OP_IDS = [
  "taxonomy.tags.list",
  "taxonomy.tags.create",
  "taxonomy.tags.patch",
  "taxonomy.tags.delete",
  "taxonomy.entityTags.assign",
  "taxonomy.entityTags.remove",
  "taxonomy.entityTags.listForEntity",
  "taxonomy.entityTags.listEntitiesForTag",
] as const;

const listMeta = (total: number) => ({
  requestId: "persistence",
  page: 1,
  pageSize: 20,
  total,
});
const singleMeta = { requestId: "persistence" };

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createTaxonomyTransport(
  serviceFactory: (ctx: RequestContext) => TaxonomyService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op this transport owns is a persisted (owned) op. No ctx ⇒ the
      // dispatch was unauthenticated ⇒ reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { tagId?: string };
      const q = (query ?? {}) as {
        limit?: number;
        offset?: number;
        entityType?: string;
        entityId?: string;
      };
      const b = (body ?? {}) as Record<string, unknown>;

      switch (endpoint.id) {
        case "taxonomy.tags.list": {
          const rows = await service.listTags(ctx, q);
          return { data: rows, meta: listMeta(rows.length) };
        }
        case "taxonomy.tags.create":
          return {
            data: await service.createTag(ctx, {
              name: b.name as string,
              color: b.color as string | undefined,
              kind: b.kind as string | undefined,
            }),
            meta: singleMeta,
          };
        case "taxonomy.tags.patch":
          return {
            data: await service.renameTag(ctx, p.tagId ?? "", {
              name: b.name as string | undefined,
              color: b.color as string | undefined,
              kind: b.kind as string | undefined,
            }),
            meta: singleMeta,
          };
        case "taxonomy.tags.delete":
          return {
            data: await service.deleteTag(ctx, p.tagId ?? ""),
            meta: singleMeta,
          };
        case "taxonomy.entityTags.assign": {
          const rows = await service.assignTags(ctx, {
            entityType: b.entityType as string,
            entityId: b.entityId as string,
            tagIds: (b.tagIds ?? []) as string[],
          });
          return { data: rows, meta: listMeta(rows.length) };
        }
        case "taxonomy.entityTags.remove": {
          await service.removeTag(ctx, {
            entityType: b.entityType as string,
            entityId: b.entityId as string,
            tagId: b.tagId as string,
          });
          // The contract response is a single EntityTagResource, but detach is
          // idempotent and returns no row; surface a null payload + single meta.
          return { data: null, meta: singleMeta };
        }
        case "taxonomy.entityTags.listForEntity": {
          const rows = await service.listTagsForEntity(ctx, {
            entityType: q.entityType as string,
            entityId: q.entityId as string,
          });
          return { data: rows, meta: listMeta(rows.length) };
        }
        case "taxonomy.entityTags.listEntitiesForTag": {
          const rows = await service.listEntitiesForTag(ctx, p.tagId ?? "", q);
          return { data: rows, meta: listMeta(rows.length) };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
