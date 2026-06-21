import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./monetization.errors";
import type { MonetizationService } from "./monetization.service";

// Monetization transport (foundation §5.4) — the module's 18 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized positioning
// transport: a `Transport` whose request(endpoint, input, ctx) switches on
// endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope (list
// for *.list / funnel.byOutput, single-resource otherwise). A persisted op reached
// with NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never masks
// a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from MONETIZATION_OP_IDS (adding the module = registering it).

export const MONETIZATION_OP_IDS = [
  "products.list",
  "products.create",
  "products.get",
  "products.patch",
  "products.retire",
  "products.offers.list",
  "products.offers.create",
  "outputs.products.list",
  "outputs.products.link",
  "outputs.products.unlink",
  "leads.list",
  "leads.create",
  "leads.get",
  "leads.patch",
  "leads.conversions.list",
  "leads.conversions.create",
  "monetization.funnel.get",
  "monetization.funnel.byOutput",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createMonetizationTransport(
  serviceFactory: () => MonetizationService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        productId?: string;
        outputId?: string;
        leadId?: string;
      };

      switch (endpoint.id) {
        case "products.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            status?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listProducts(ctx, {
            status: q.status,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "products.create": {
          const b = (body ?? {}) as {
            name: string;
            kind: string;
            tier?: string;
            deliveryWeight?: string;
            targetPersona?: string;
          };
          const dto = await service.createProduct(ctx, b);
          return { data: dto, meta: { requestId } };
        }
        case "products.get": {
          const dto = await service.getProduct(ctx, p.productId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "products.patch": {
          const b = (body ?? {}) as Record<string, unknown>;
          const dto = await service.patchProduct(
            ctx,
            p.productId ?? "",
            b as never,
          );
          return { data: dto, meta: { requestId } };
        }
        case "products.retire": {
          const dto = await service.retireProduct(ctx, p.productId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "products.offers.list": {
          const rows = await service.listOffers(ctx, p.productId ?? "");
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        case "products.offers.create": {
          const b = (body ?? {}) as {
            price: number;
            currency?: string;
            validFrom?: string;
            validTo?: string;
            note?: string;
          };
          const dto = await service.createOffer(ctx, p.productId ?? "", b);
          return { data: dto, meta: { requestId } };
        }
        case "outputs.products.list": {
          const rows = await service.listProductsByOutput(
            ctx,
            p.outputId ?? "",
          );
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        case "outputs.products.link": {
          const b = (body ?? {}) as {
            productId: string;
            contentRole?: string;
          };
          const dto = await service.linkOutputProduct(ctx, p.outputId ?? "", {
            productId: b.productId,
            contentRole: b.contentRole ?? null,
          });
          return { data: dto, meta: { requestId } };
        }
        case "outputs.products.unlink": {
          const result = await service.unlinkOutputProduct(
            ctx,
            p.outputId ?? "",
            p.productId ?? "",
          );
          return { data: result, meta: { requestId } };
        }
        case "leads.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            status?: string;
            source?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listLeads(ctx, {
            status: q.status,
            source: q.source,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "leads.create": {
          const b = (body ?? {}) as {
            source?: string;
            surveySource?: string;
            attributedContentId?: string;
            attributionMethod?: string;
            attributionConfidence?: string;
            status?: string;
          };
          const dto = await service.createLead(ctx, b);
          return { data: dto, meta: { requestId } };
        }
        case "leads.get": {
          const dto = await service.getLead(ctx, p.leadId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "leads.patch": {
          const b = (body ?? {}) as {
            status?: string;
            attributedContentId?: string;
            attributionMethod?: string;
            attributionConfidence?: string;
          };
          const dto = await service.patchLead(ctx, p.leadId ?? "", b);
          return { data: dto, meta: { requestId } };
        }
        case "leads.conversions.list": {
          const rows = await service.listConversions(ctx, p.leadId ?? "");
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        case "leads.conversions.create": {
          const b = (body ?? {}) as {
            productId?: string;
            offerId?: string;
            eventType: string;
            value?: number;
            occurredAt?: string;
          };
          const dto = await service.createConversion(ctx, p.leadId ?? "", b);
          return { data: dto, meta: { requestId } };
        }
        case "monetization.funnel.get": {
          const q = (query ?? {}) as {
            productId?: string;
            periodStart?: string;
            periodEnd?: string;
          };
          const dto = await service.getFunnel(ctx, {
            productId: q.productId ?? null,
            periodStart: q.periodStart ?? null,
            periodEnd: q.periodEnd ?? null,
          });
          return { data: dto, meta: { requestId } };
        }
        case "monetization.funnel.byOutput": {
          const rows = await service.getFunnelForOutput(ctx, p.outputId ?? "");
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
