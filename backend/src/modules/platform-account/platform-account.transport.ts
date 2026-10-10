import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./platform-account.errors";
import type { PlatformAccountService } from "./platform-account.service";

// PlatformAccount transport (foundation §5.4) — the module's 5 contract ops served
// over REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// candidate/monetization transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope (list for accounts.list, single-resource otherwise). A persisted op reached
// with NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never masks a
// real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from PLATFORM_ACCOUNT_OP_IDS (adding the module = registering it).

export const PLATFORM_ACCOUNT_OP_IDS = [
  "accounts.list",
  "accounts.collectionPlanReadiness",
  "accounts.bindingCapabilities",
  "accounts.create",
  "accounts.get",
  "accounts.update",
  "accounts.archive",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createPlatformAccountTransport(
  serviceFactory: () => PlatformAccountService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { accountId?: string };

      switch (endpoint.id) {
        case "accounts.collectionPlanReadiness": {
          const data = await service.getCollectionPlanReadiness(ctx, p.accountId ?? "");
          return {data, meta: {requestId}};
        }
        case "accounts.bindingCapabilities":{const data=await service.getBindingCapabilities(ctx);return {data,meta:{requestId,page:1,pageSize:Math.max(1,data.length),total:data.length}};}
        case "accounts.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            platform?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listAccounts(ctx, {
            platform: q.platform,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "accounts.create": {
          const b = (body ?? {}) as {
            platform: string;
            accountHandle: string;
            idempotencyKey?:string;
            secretReference?: string;
            followerBaseline?: number;
          };
          const created = await service.createAccount(ctx, {
            platform: b.platform,
            accountHandle: b.accountHandle,
            idempotencyKey: b.idempotencyKey,
            secretReference: b.secretReference ?? null,
            followerBaseline: b.followerBaseline,
          });
          return { data: created, meta: { requestId } };
        }
        case "accounts.get": {
          const got = await service.getAccount(ctx, p.accountId ?? "");
          return { data: got, meta: { requestId } };
        }
        case "accounts.update": {
          const b = (body ?? {}) as {
            accountHandle?: string;
            secretReference?: string;
            followerBaseline?: number;
            status?: "active" | "archived";
          };
          const updated = await service.updateAccount(ctx, p.accountId ?? "", {
            accountHandle: b.accountHandle,
            secretReference: b.secretReference,
            followerBaseline: b.followerBaseline,
            status: b.status,
          });
          return { data: updated, meta: { requestId } };
        }
        case "accounts.archive": {
          const archived = await service.archiveAccount(ctx, p.accountId ?? "");
          return { data: archived, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
