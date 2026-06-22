import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./learnings.errors";
import type { LearningsService } from "./learnings.service";

// Learnings transport (foundation §5.4) — the module's 4 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized reviews
// transport: a `Transport` whose request(endpoint,input,ctx) switches on
// endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope
// (list for learnings.list, single-resource otherwise). A persisted op reached with
// NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never
// masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from LEARNINGS_OP_IDS (adding the module = registering it). The
// service already maps rows → contract DTOs (learnings.schema.ts), so the transport
// only threads ctx + shapes the envelope.

export const LEARNINGS_OP_IDS = [
  "learnings.list",
  "learnings.create",
  "learnings.applications.create",
  "learnings.evaluate",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createLearningsTransport(
  serviceFactory: () => LearningsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op is persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { learningId?: string };

      switch (endpoint.id) {
        case "learnings.list": {
          // The contract query is paginationQuery (page/pageSize, 1-based). Convert
          // to the repo's limit/offset (mirrors the other list transports).
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listLearnings(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "learnings.create": {
          const b = (body ?? {}) as { title: string; insight?: string };
          const learning = await service.createLearning(ctx, b);
          return { data: learning, meta: { requestId } };
        }
        case "learnings.applications.create": {
          const b = (body ?? {}) as {
            projectId: string;
            applicationNote?: string;
          };
          const application = await service.applyLearning(
            ctx,
            p.learningId ?? "",
            b,
          );
          return { data: application, meta: { requestId } };
        }
        case "learnings.evaluate": {
          const b = (body ?? {}) as {
            validationStatus?: "candidate" | "validated" | "discarded";
          };
          const learning = await service.evaluateLearning(
            ctx,
            p.learningId ?? "",
            b,
          );
          return { data: learning, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
