import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
  UnsupportedOperationError,
} from "./positioning.errors";
import type { PositioningService } from "./positioning.service";

// Positioning transport (foundation §5.4) — the module's 7 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized learnings
// transport: a `Transport` whose request(endpoint,input,ctx) switches on
// endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope
// (list for statements.list, single-resource otherwise). A persisted op reached
// with NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never
// masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from POSITIONING_OP_IDS (adding the module = registering it).
//
// `positioning.profile.get` returns the profile or 404 if none — the FE 定位中心
// page reads via pages.positioning.get (empty-state safe) instead; the bare
// profile.get is the contract op (nullable-or-404 per the table). Here we map a
// null profile to an OwnershipError-equivalent 404 by returning the contract DTO
// only when present; the service.getProfile returns null, so we throw via the
// shared OwnershipError to surface 404 (cross-tenant-safe, never reveals existence).

export const POSITIONING_OP_IDS = [
  "positioning.profile.get",
  "positioning.profile.upsert",
  "positioning.statements.list",
  "positioning.statements.create",
  "positioning.statements.get",
  "positioning.gate.evaluate",
  "pages.positioning.get",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createPositioningTransport(
  serviceFactory: () => PositioningService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { statementId?: string };

      switch (endpoint.id) {
        case "positioning.profile.get": {
          const profile = await service.getProfile(ctx);
          if (!profile) {
            // Nullable-or-404 (contract table). No profile → 404 (cross-tenant
            // -safe). The FE page reads pages.positioning.get (empty-state safe).
            throw new OwnershipError("OwnershipError: no creator profile");
          }
          return { data: profile, meta: { requestId } };
        }
        case "positioning.profile.upsert": {
          const b = (body ?? {}) as {
            persona?: string;
            field?: string;
            audience?: string;
            differentiation?: string;
            capabilities?: string[];
          };
          const profile = await service.upsertProfile(ctx, {
            persona: b.persona ?? "",
            field: b.field ?? "",
            audience: b.audience ?? "",
            differentiation: b.differentiation ?? "",
            capabilities: b.capabilities ?? [],
          });
          return { data: profile, meta: { requestId } };
        }
        case "positioning.statements.list": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listStatements(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "positioning.statements.create": {
          const b = (body ?? {}) as {
            oneLiner: string;
            keywords: string[];
            productAnchorIds?: string[];
          };
          const statement = await service.createStatementVersion(ctx, {
            oneLiner: b.oneLiner,
            keywords: b.keywords,
            productAnchorIds: b.productAnchorIds ?? [],
          });
          return { data: statement, meta: { requestId } };
        }
        case "positioning.statements.get": {
          const statement = await service.getStatement(
            ctx,
            p.statementId ?? "",
          );
          return { data: statement, meta: { requestId } };
        }
        case "positioning.gate.evaluate": {
          const b = (body ?? {}) as {
            subjectType: "candidate" | "project";
            subjectId: string;
            statementId?: string;
          };
          const result = await service.evaluateGate(ctx, b);
          return { data: result, meta: { requestId } };
        }
        case "pages.positioning.get": {
          const center = await service.getPositioningCenter(ctx);
          return { data: center, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
