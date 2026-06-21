// ContentCalendar module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports ContentCalendar ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared db,
// the transport factory + op-id list the composite merges, CONTENT_CALENDAR_DDL, the
// contract DTOs, and the error classes the dispatch route maps. No cross-module
// repository import — peer modules are reached via narrow injected ports
// (PlatformAccountPort / PublishingPort / CandidatePort / NotificationsPort) bound to
// the real public services at the composition root.
//
// getLaggingAccounts is the thin Wave-4 Dashboard read (§9 验收 #4 "哪个账号断更了"):
// a scoped scan of cadence attainment per owned account. getCalendarForDashboard is
// declared on the service for the Dashboard query service (signature this wave).

export {
  createContentCalendarService,
  type ContentCalendarService,
  type ServiceDeps as ContentCalendarServiceDeps,
  type PlatformAccountPort,
  type PublishingPort,
  type CandidatePort,
  type NotificationsPort,
  type Clock as ContentCalendarClock,
  type LaggingAccount,
  type CreateEntryInput,
  type UpdateEntryInput,
  type UpsertCadenceInput,
  type WindowQuery,
  graceForFrequency,
} from "./content-calendar.service";

export {
  createContentCalendarRepository,
  type ContentCalendarRepository,
  type RepoDeps,
  type ContentCalendarEntryRow,
  type PublishingCadenceRow,
  type PreferredSlot,
} from "./content-calendar.repository";

export {
  createContentCalendarTransport,
  CONTENT_CALENDAR_OP_IDS,
} from "./content-calendar.transport";

export { CONTENT_CALENDAR_DDL } from "./content-calendar.db-schema";

export {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./content-calendar.errors";

export {
  contentCalendarEntryResource,
  publishingCadenceResource,
  cadenceAttainmentResource,
  toContentCalendarEntryDto,
  toPublishingCadenceDto,
  type ContentCalendarEntryResource,
  type PublishingCadenceResource,
  type CadenceAttainmentResource,
} from "./content-calendar.schema";
