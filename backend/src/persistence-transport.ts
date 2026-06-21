import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import type { ProjectRepository } from "./repositories/project-repository";
import { AuthenticationError } from "./errors";

// Thrown for operations this transport does not implement, so a caller can fall
// back to another transport (e.g. the FE mock) without masking real errors.
export class UnsupportedOperationError extends Error {
  constructor(public readonly operationId: string) {
    super(`persistence: operation not implemented: ${operationId}`);
    this.name = "UnsupportedOperationError";
  }
}

const listMeta = (total: number) => ({
  requestId: "persistence",
  page: 1,
  pageSize: 20,
  total,
});
const singleMeta = { requestId: "persistence" };

type Input = { params?: unknown; query?: unknown; body?: unknown };

// Persistence-backed Transport for the Projects entity operations. Stage-16
// real SQL behind the same /api/v1/dispatch route the FE already calls — the
// contract and HttpTransport are unchanged.
//
// Task 8 threads `RequestContext` per request: the transport takes a
// `repoFactory(ctx)` (NOT a pre-built repo) so each persisted op runs against a
// repository bound to the caller's `ctx.userId` (creates stamp it; Wave-2
// Projects tightens list/get filters to `eq(projects.userId, ctx.userId)` — this
// task only plumbs ctx so it *can*). A persisted op reached with NO ctx is an
// unauthenticated dispatch → AuthenticationError (→ 401, foundation §2).
export function createPersistenceTransport(
  repoFactory: (ctx: RequestContext) => ProjectRepository,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op this transport owns is a persisted (owned) op. No ctx ⇒ the
      // dispatch was unauthenticated ⇒ reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const repo = repoFactory(ctx);

      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { projectId?: string; stage?: string };

      switch (endpoint.id) {
        case "projects.list": {
          const rows = await repo.list();
          return { data: rows, meta: listMeta(rows.length) };
        }
        case "projects.get":
          return { data: await repo.get(p.projectId ?? ""), meta: singleMeta };
        case "projects.create":
          return {
            data: await repo.create((body ?? {}) as { title: string; brief?: string }),
            meta: singleMeta,
          };
        case "projects.patch":
          return {
            data: await repo.patch(
              p.projectId ?? "",
              (body ?? {}) as { title?: string; brief?: string; starred?: boolean },
            ),
            meta: singleMeta,
          };
        case "projects.archive":
          return { data: await repo.archive(p.projectId ?? ""), meta: singleMeta };
        case "projects.stage.transition":
          return {
            data: await repo.transition(
              p.projectId ?? "",
              (p.stage ?? "") as never,
            ),
            meta: singleMeta,
          };
        case "projects.activity.list": {
          const rows = await repo.listActivity(p.projectId ?? "");
          return { data: rows, meta: listMeta(rows.length) };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
