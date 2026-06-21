// ContentCalendar module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for
// this module"). The transport mappers + the contract test validate their outputs
// against these; the contract is the single source of truth for the wire shape
// (contract/src/resources/content-calendar.ts, contract v0.4).
//
// Topology (verified against platform-account.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The op responses are
// reachable as ENDPOINTS.<opKey>.response:
//   listCalendar / createEntry / updateEntry / transitionEntry → contentCalendarEntryResource
//   deleteEntry → { id, deleted }
//   getCadence → publishingCadenceResource (nullable)
//   upsertCadence → publishingCadenceResource
//   getCadenceAttainment → cadenceAttainmentResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  ContentCalendarEntryRow,
  PublishingCadenceRow,
  PreferredSlot,
} from "./content-calendar.repository";

export const contentCalendarEntryResource = ENDPOINTS.createEntry.response;
export const publishingCadenceResource = ENDPOINTS.upsertCadence.response;
export const cadenceAttainmentResource =
  ENDPOINTS.getCadenceAttainment.response;

// Derive the inferred output types structurally (zod 4's z.infer<T> === T["_output"]).
// The frontend package does not declare `zod` directly, so we read the phantom output
// type (mirrors platform-account).
export type ContentCalendarEntryResource =
  (typeof contentCalendarEntryResource)["_output"];
export type PublishingCadenceResource =
  (typeof publishingCadenceResource)["_output"];
export type CadenceAttainmentResource =
  (typeof cadenceAttainmentResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change is
// caught once.
export function toContentCalendarEntryDto(
  row: ContentCalendarEntryRow,
): ContentCalendarEntryResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    plannedAt: row.plannedAt,
    contentOutputId: row.contentOutputId ?? null,
    candidateId: row.candidateId ?? null,
    status: row.status as ContentCalendarEntryResource["status"],
    note: row.note,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPublishingCadenceDto(
  row: PublishingCadenceRow,
): PublishingCadenceResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    frequency: row.frequency as PublishingCadenceResource["frequency"],
    preferredSlots: (row.preferredSlots ?? []) as PreferredSlot[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
