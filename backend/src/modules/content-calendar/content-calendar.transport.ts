import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./content-calendar.errors";
import type { ContentCalendarService } from "./content-calendar.service";
import type { PreferredSlot } from "./content-calendar.repository";

// ContentCalendar transport (foundation §5.4) — the module's 8 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the platform-account
// transport: a `Transport` whose request(endpoint, input, ctx) switches on endpoint.id,
// threads ctx into the service, and returns the SPEC §14 envelope (list for
// accounts.calendar.list, single-resource otherwise). A persisted op reached with NO
// ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this transport
// does not own throw UnsupportedOperationError so the composite never masks a real
// error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from CONTENT_CALENDAR_OP_IDS (adding the module = registering it).

export const CONTENT_CALENDAR_OP_IDS = [
  "accounts.calendar.list",
  "accounts.calendar.entries.create",
  "calendar.entries.update",
  "calendar.entries.transition",
  "calendar.entries.delete",
  "accounts.cadence.get",
  "accounts.cadence.upsert",
  "accounts.cadence.attainment",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createContentCalendarTransport(
  serviceFactory: () => ContentCalendarService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { accountId?: string; entryId?: string };

      switch (endpoint.id) {
        case "accounts.calendar.list": {
          const q = (query ?? {}) as {
            from?: string;
            to?: string;
            page?: number;
            pageSize?: number;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listCalendar(
            ctx,
            p.accountId ?? "",
            { from: q.from ?? "", to: q.to ?? "" },
            { limit: pageSize, offset: (page - 1) * pageSize },
          );
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "accounts.calendar.entries.create": {
          const b = (body ?? {}) as {
            projectId?: string;
            plannedDate?: string;
            plannedAt?: string;
            contentOutputId?: string;
            candidateId?: string;
            note?: string;
          };
          const created = await service.createEntry(ctx, p.accountId ?? "", {
            projectId: b.projectId,
            plannedDate: b.plannedDate,
            plannedAt: b.plannedAt,
            contentOutputId: b.contentOutputId ?? null,
            candidateId: b.candidateId ?? null,
            note: b.note,
          });
          return { data: created, meta: { requestId } };
        }
        case "calendar.entries.update": {
          const b = (body ?? {}) as {
            plannedAt?: string;
            plannedDate?: string;
            contentOutputId?: string;
            candidateId?: string;
            note?: string;
          };
          const updated = await service.updateEntry(ctx, p.entryId ?? "", {
            plannedAt: b.plannedAt,
            plannedDate: b.plannedDate,
            contentOutputId: b.contentOutputId,
            candidateId: b.candidateId,
            note: b.note,
          });
          return { data: updated, meta: { requestId } };
        }
        case "calendar.entries.transition": {
          const b = (body ?? {}) as { status: string };
          const moved = await service.transition(ctx, p.entryId ?? "", {
            status: b.status,
          });
          return { data: moved, meta: { requestId } };
        }
        case "calendar.entries.delete": {
          const deleted = await service.deleteEntry(ctx, p.entryId ?? "");
          return { data: deleted, meta: { requestId } };
        }
        case "accounts.cadence.get": {
          const cadence = await service.getCadence(ctx, p.accountId ?? "");
          return { data: cadence, meta: { requestId } };
        }
        case "accounts.cadence.upsert": {
          const b = (body ?? {}) as {
            frequency: string;
            preferredSlots?: PreferredSlot[];
          };
          const upserted = await service.upsertCadence(ctx, p.accountId ?? "", {
            frequency: b.frequency,
            preferredSlots: b.preferredSlots ?? [],
          });
          return { data: upserted, meta: { requestId } };
        }
        case "accounts.cadence.attainment": {
          const q = (query ?? {}) as { from?: string; to?: string };
          const a = await service.attainment(ctx, p.accountId ?? "", {
            from: q.from ?? "",
            to: q.to ?? "",
          });
          return { data: a, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
