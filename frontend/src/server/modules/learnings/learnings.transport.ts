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
          const q = (query ?? {}) as { limit?: number; offset?: number };
          const { rows, total } = await service.listLearnings(ctx, {
            limit: q.limit ?? 20,
            offset: q.offset ?? 0,
          });
          return { data: rows, meta: { requestId, total } };
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
