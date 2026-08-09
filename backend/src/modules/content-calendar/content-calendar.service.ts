import { calendarDate, type RequestContext } from "@creatoros/contract";
import { requireAccountId, type Db } from "@creatoros/backend";
import {
  createContentCalendarRepository,
  type ContentCalendarRepository,
  type RepoDeps,
  type PreferredSlot,
} from "./content-calendar.repository";
import {
  toContentCalendarEntryDto,
  toPublishingCadenceDto,
  type ContentCalendarEntryResource,
  type PublishingCadenceResource,
  type CadenceAttainmentResource,
} from "./content-calendar.schema";
import {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./content-calendar.errors";

// ContentCalendar service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createContentCalendarRepository(db, { now, nextId, userId: ctx.userId })) so scoping
// is structural. The service owns the §7.2 entry state machine + the cadence
// 达成率/断更 (attainment / gap) computation.
//
// Peer modules are reached ONLY through narrow injected PORTS (never a cross-module
// repository import; foundation §1 modular-monolith rule). The composition root binds
// these ports to the REAL public services (PlatformAccountService.getAccount,
// PublishingService.resolvePublication/getRecentPublications, CandidateService
// existence read, NotificationsService notify seam). A null/unwired soft-dep port is
// tolerated where the plan marks it soft (Candidate FK validation).
//
// Determinism (C-5): all "today / overdue / window" math comes from the injected
// `clock.now()` or the request's `from`/`to` — NEVER Date.now / Math.random / fetch.

// Public transition is legacy compatibility only. A real publication is never
// writable through this state-machine endpoint.
const ALLOWED: Record<string, ReadonlyArray<string>> = {
  planned: ["missed"],
  missed: ["planned"],
  published: [],
};

const VALID_FREQUENCIES = new Set([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "custom",
]);

const VALID_STATUSES = new Set(["planned", "published", "missed"]);

const DAY_MS = 86_400_000;

// Per-frequency grace window (days) after plannedAt before a still-unpublished slot is
// 断更 (missed). Deterministic helper — plan OQ4.
export function graceForFrequency(frequency: string): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekly":
      return 2;
    case "biweekly":
      return 3;
    case "monthly":
      return 5;
    default:
      return 2; // custom / unknown → weekly-equivalent grace
  }
}

// Expected publish count across [from,to] for a frequency. Deterministic from the
// window length (NOT wall-clock). `custom` projects from the preferredSlots count over
// the number of whole weeks in the window (plan OQ3).
function expectedCount(
  frequency: string,
  from: string,
  to: string,
  preferredSlots: PreferredSlot[],
): number {
  const days = Math.max(
    0,
    Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS),
  );
  const weeks = days / 7;
  switch (frequency) {
    case "daily":
      return Math.max(1, Math.round(days));
    case "weekly":
      return Math.max(1, Math.round(weeks));
    case "biweekly":
      return Math.max(1, Math.round(weeks / 2));
    case "monthly":
      return Math.max(1, Math.round(days / 30));
    case "custom":
      return Math.max(1, Math.round(weeks) * Math.max(1, preferredSlots.length));
    default:
      return 1;
  }
}

export interface Clock {
  now(): string; // ISO-8601 — the deterministic reference instant (C-5)
}

// Narrow injected peer ports (no cross-module repo import). Bound to the real public
// services at the composition root; stubbed in tests.
export interface PlatformAccountPort {
  // Throws OwnershipError when the account is not the caller's (the ownership gate).
  getAccount(ctx: RequestContext, accountId: string): Promise<unknown>;
}
export interface PublishingPort {
  // C-4 read-only reconcile hook: resolve whether the bound output has a published
  // Publication. Returns true if the calendar should flip the slot to published.
  isOutputPublished(
    ctx: RequestContext,
    contentOutputId: string,
  ): Promise<boolean>;
}
export interface IdentityTimezonePort {
  getEffectiveTimezone(ctx: RequestContext): Promise<string | null>;
}
export interface ScheduleProject {
  id: string;
  title: string;
  status: string;
  source: "manual" | "topic" | "imported";
  currentStage: string;
  updatedAt: string;
  outputs: Array<{ id: string; status: string }>;
}
export interface ProjectsSchedulePort {
  // The adapter must resolve by the same ctx user/account and throw the shared
  // OwnershipError for a missing or foreign project.
  getScheduleProject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ScheduleProject>;
}
export interface ProjectPublicationFact {
  publicationId: string;
  publishedAt: string;
}
export interface CalendarRequestContext {
  referenceInstant: string;
  effectiveTimezone: string;
  today: string;
}
export interface PublishingSchedulePort {
  getProjectPublicationFact(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ProjectPublicationFact | null>;
}
export interface CandidatePort {
  // C-3 FK validation: the Candidate must already be formalized (we never create one).
  exists(ctx: RequestContext, candidateId: string): Promise<boolean>;
}
export interface NotificationsPort {
  // 断更 / data-refresh-due seam. Best-effort; idempotent fire is the caller's concern
  // (only on the planned→missed edge).
  notify(
    ctx: RequestContext,
    payload: { type: string; accountId: string; message: string },
  ): Promise<void>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  clock: Clock;
  platformAccounts: PlatformAccountPort;
  publishing: PublishingPort;
  candidates: CandidatePort;
  notifications: NotificationsPort;
  identity: IdentityTimezonePort;
  projects: ProjectsSchedulePort;
  schedulePublishing: PublishingSchedulePort;
}

export interface CreateEntryInput {
  plannedAt?: string;
  plannedDate?: string;
  projectId?: string;
  contentOutputId?: string | null;
  candidateId?: string | null;
  note?: string;
}
export interface UpdateEntryInput {
  plannedAt?: string;
  plannedDate?: string;
  contentOutputId?: string | null;
  candidateId?: string | null;
  note?: string;
}
export interface UpsertCadenceInput {
  frequency: string;
  preferredSlots: PreferredSlot[];
}
export interface WindowQuery {
  from: string;
  to: string;
}
export interface Pagination {
  limit: number;
  offset: number;
}

export interface LaggingAccount {
  accountId: string;
  gapDays: number;
  attainmentRatio: number;
}

export interface ContentCalendarService {
  listCalendar(
    ctx: RequestContext,
    accountId: string,
    window: WindowQuery,
    pagination: Pagination,
  ): Promise<{ rows: ContentCalendarEntryResource[]; total: number }>;
  createEntry(
    ctx: RequestContext,
    accountId: string,
    body: CreateEntryInput,
  ): Promise<ContentCalendarEntryResource>;
  updateEntry(
    ctx: RequestContext,
    entryId: string,
    patch: UpdateEntryInput,
  ): Promise<ContentCalendarEntryResource>;
  transition(
    ctx: RequestContext,
    entryId: string,
    body: { status: string },
  ): Promise<ContentCalendarEntryResource>;
  deleteEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<{ id: string; deleted: true }>;
  getCadence(
    ctx: RequestContext,
    accountId: string,
  ): Promise<PublishingCadenceResource | null>;
  upsertCadence(
    ctx: RequestContext,
    accountId: string,
    body: UpsertCadenceInput,
  ): Promise<PublishingCadenceResource>;
  attainment(
    ctx: RequestContext,
    accountId: string,
    window: WindowQuery,
  ): Promise<CadenceAttainmentResource>;

  // Thin Wave-4 Dashboard reads (§9 验收 #4 "哪个账号断更了"). getLaggingAccounts scans
  // attainment per owned account; getCalendarForDashboard is declared for the Dashboard
  // query service (signature only this wave).
  getLaggingAccounts(
    ctx: RequestContext,
    accountIds: string[],
    window: WindowQuery,
  ): Promise<LaggingAccount[]>;
  listActiveProjectSchedules(
    ctx: RequestContext,
    accountId: string,
  ): Promise<ContentCalendarEntryResource[]>;
  reconcileProjectSchedule(
    ctx: RequestContext,
    entryId: string,
  ): Promise<ContentCalendarEntryResource>;
  getCalendarRequestContext(
    ctx: RequestContext,
  ): Promise<CalendarRequestContext>;
}

export function createContentCalendarService(
  deps: ServiceDeps,
): ContentCalendarService {
  const { db, now, nextId, clock } = deps;

  // [T-332 S2] 每个公开方法入口先 requireAccountId(SPEC §4.2:未选号 = 引导态禁
  // 读写,抛 AccountRequiredError);repo 以 ctx 当前号 baked 构造,by-id 读写叠号
  // (§4.5 号一致性门)。显式 accountId 参数(路由 /accounts/:accountId/…)必须与
  // ctx 当前号一致——不一致按跨号处理(OwnershipError 404,§4.5/§4.6,防「从 A 号
  // 工作区写 B 号日历」的绕过)。
  function repoFor(
    ctx: RequestContext,
    currentAccountId: string,
  ): ContentCalendarRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      accountId: currentAccountId,
    };
    return createContentCalendarRepository(db, repoDeps);
  }

  // 显式 accountId 参数与 ctx 当前号的一致性门(§4.5 同语义,404 不泄露存在)。
  function assertCurrentAccount(
    currentAccountId: string,
    paramAccountId: string,
  ): void {
    if (paramAccountId !== currentAccountId) {
      throw new OwnershipError(
        `OwnershipError: account not found: ${paramAccountId}`,
      );
    }
  }

  function normalizeTimezone(value: string | null): string {
    if (value) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return value;
      } catch {
        // fall through to the one contract-defined fallback
      }
    }
    console.warn(
      "[content-calendar] identity timezone missing or invalid; falling back to UTC",
    );
    return "UTC";
  }

  function dateInTimezone(instant: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  async function calendarContext(
    ctx: RequestContext,
  ): Promise<CalendarRequestContext> {
    const referenceInstant = clock.now();
    const effectiveTimezone = normalizeTimezone(
      await deps.identity.getEffectiveTimezone(ctx),
    );
    return {
      referenceInstant,
      effectiveTimezone,
      today: dateInTimezone(referenceInstant, effectiveTimezone),
    };
  }

  function assertCalendarDate(value: string): void {
    if (!calendarDate.safeParse(value).success) {
      throw new ValidationError(
        `ValidationError: invalid plannedDate '${value}'`,
      );
    }
  }

  async function assertProjectSchedulable(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ScheduleProject> {
    const project = await deps.projects.getScheduleProject(ctx, projectId);
    if (
      project.source === "imported" ||
      project.status === "completed" ||
      project.status === "archived" ||
      project.currentStage === "review"
    ) {
      throw new ConflictError(
        `ConflictError: project ${projectId} cannot be scheduled`,
      );
    }
    if (
      await deps.schedulePublishing.getProjectPublicationFact(ctx, projectId)
    ) {
      throw new ConflictError(
        `ConflictError: project ${projectId} is already published`,
      );
    }
    return project;
  }

  // Cross-module FK validation (C-3) — never create a Candidate, only validate it.
  async function validateBindings(
    ctx: RequestContext,
    contentOutputId: string | null | undefined,
    candidateId: string | null | undefined,
  ): Promise<void> {
    if (contentOutputId != null && candidateId != null) {
      throw new ValidationError(
        "ValidationError: a calendar entry cannot bind both a contentOutputId and a candidateId",
      );
    }
    if (candidateId != null) {
      const ok = await deps.candidates.exists(ctx, candidateId);
      if (!ok) {
        throw new ValidationError(
          `ValidationError: candidate not found or not formalized: ${candidateId}`,
        );
      }
    }
  }

  // The reconcile pass (C-4): read already-ingested publishing reality, flipping
  // planned slots to published (bound output published) or missed (grace elapsed, no
  // publication). Deterministic on clock.now(). Fires exactly ONE notification on a
  // fresh planned→missed edge (never re-fired for already-missed). Returns nothing;
  // attainment re-reads the rows after.
  async function reconcile(
    ctx: RequestContext,
    accountId: string,
    window: WindowQuery,
    cadence: PublishingCadenceResource | null,
  ): Promise<void> {
    // 调用链上游已断言 accountId === ctx 当前号(assertCurrentAccount)。
    const repo = repoFor(ctx, accountId);
    const entries = await repo.entriesForAttainment(accountId, window);
    const nowMs = Date.parse(clock.now());
    const grace = graceForFrequency(cadence?.frequency ?? "weekly");
    let projectToday: string | undefined;
    for (const entry of entries) {
      if (entry.status !== "planned") continue;
      if (entry.projectId) {
        const fact =
          await deps.schedulePublishing.getProjectPublicationFact(
            ctx,
            entry.projectId,
          );
        if (fact) {
          await repo.setEntryStatus(entry.id, {
            status: "published",
            publishedAt: fact.publishedAt,
          });
          continue;
        }
        if (projectToday === undefined) {
          projectToday = (await calendarContext(ctx)).today;
        }
        if (entry.plannedDate < projectToday) {
          await repo.setEntryStatus(entry.id, {
            status: "missed",
            publishedAt: null,
          });
        }
        continue;
      }
      if (entry.contentOutputId) {
        const published = await deps.publishing.isOutputPublished(
          ctx,
          entry.contentOutputId,
        );
        if (published) {
          await repo.setEntryStatus(entry.id, {
            status: "published",
            publishedAt: clock.now(),
          });
          continue;
        }
      }
      const overdueAt = Date.parse(entry.plannedAt) + grace * DAY_MS;
      if (overdueAt < nowMs) {
        await repo.setEntryStatus(entry.id, { status: "missed" });
        await deps.notifications.notify(ctx, {
          type: "cadence_gap",
          accountId,
          message: `账号断更：计划 ${entry.plannedAt} 未发布`,
        });
      }
    }
  }

  async function attainmentFor(
    ctx: RequestContext,
    accountId: string,
    window: WindowQuery,
  ): Promise<CadenceAttainmentResource> {
    // 调用链上游已断言 accountId === ctx 当前号(assertCurrentAccount)。
    const repo = repoFor(ctx, accountId);
    const cadence = await repo.getCadence(accountId);
    const cadenceDto = cadence ? toPublishingCadenceDto(cadence) : null;
    await reconcile(ctx, accountId, window, cadenceDto);
    const entries = await repo.entriesForAttainment(accountId, window);

    let plannedCount = 0;
    let publishedCount = 0;
    let missedCount = 0;
    let lastPublishedAtMs: number | null = null;
    for (const e of entries) {
      if (e.status === "planned") plannedCount++;
      else if (e.status === "published") {
        publishedCount++;
        const ts = e.publishedAt ? Date.parse(e.publishedAt) : Date.parse(e.plannedAt);
        if (lastPublishedAtMs === null || ts > lastPublishedAtMs) {
          lastPublishedAtMs = ts;
        }
      } else if (e.status === "missed") missedCount++;
    }

    const expected = expectedCount(
      cadenceDto?.frequency ?? "weekly",
      window.from,
      window.to,
      cadenceDto?.preferredSlots ?? [],
    );
    const attainmentRatio = publishedCount / Math.max(expected, 1);

    // gapDays: whole days from the last published instant to `to` (or from window start
    // if nothing published). Deterministic from timestamps — no wall-clock.
    const toMs = Date.parse(window.to);
    const referenceMs = lastPublishedAtMs ?? Date.parse(window.from);
    const gapDays = Math.max(0, Math.floor((toMs - referenceMs) / DAY_MS));
    const isLagging =
      gapDays > graceForFrequency(cadenceDto?.frequency ?? "weekly");

    return {
      accountId,
      from: window.from,
      to: window.to,
      plannedCount,
      publishedCount,
      missedCount,
      expectedCount: expected,
      attainmentRatio,
      gapDays,
      isLagging,
    };
  }

  return {
    async listCalendar(ctx, accountId, window, pagination) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.listCalendar");
      assertCurrentAccount(acc, accountId); // 号一致性门(§4.5)
      await deps.platformAccounts.getAccount(ctx, accountId); // ownership gate
      const { rows, total } = await repoFor(ctx, acc).listEntries(accountId, {
        from: window.from,
        to: window.to,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      return { rows: rows.map(toContentCalendarEntryDto), total };
    },

    async createEntry(ctx, accountId, body) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.createEntry");
      assertCurrentAccount(acc, accountId); // 写路径 stamp 必须来自 ctx 当前号(§4.6)
      await deps.platformAccounts.getAccount(ctx, accountId); // ownership gate
      if (body.projectId !== undefined || body.plannedDate !== undefined) {
        if (!body.projectId || !body.plannedDate) {
          throw new ValidationError(
            "ValidationError: projectId and plannedDate must be provided together",
          );
        }
        if (
          body.plannedAt !== undefined ||
          body.contentOutputId != null ||
          body.candidateId != null
        ) {
          throw new ValidationError(
            "ValidationError: a project schedule cannot bind a legacy calendar target",
          );
        }
        assertCalendarDate(body.plannedDate);
        const { today } = await calendarContext(ctx);
        if (body.plannedDate < today) {
          throw new ValidationError(
            "ValidationError: plannedDate cannot be before today",
          );
        }
        await assertProjectSchedulable(ctx, body.projectId);
        const repo = repoFor(ctx, acc);
        const existing = await repo.findActiveProjectSchedule(body.projectId);
        if (existing) {
          if (existing.plannedDate === body.plannedDate) {
            return toContentCalendarEntryDto(existing);
          }
          throw new ConflictError(
            `ConflictError: project ${body.projectId} already has an active schedule`,
          );
        }
        try {
          const row = await repo.createEntry(accountId, {
            projectId: body.projectId,
            plannedDate: body.plannedDate,
            plannedAt: `${body.plannedDate}T12:00:00.000Z`,
            contentOutputId: null,
            candidateId: null,
            note: body.note,
          });
          return toContentCalendarEntryDto(row);
        } catch (error) {
          // The partial unique index closes the race between the pre-read and
          // insert. Re-read to preserve same-day idempotency under concurrency.
          const raced = await repo.findActiveProjectSchedule(body.projectId);
          if (raced) {
            if (raced.plannedDate === body.plannedDate) {
              return toContentCalendarEntryDto(raced);
            }
            throw new ConflictError(
              `ConflictError: project ${body.projectId} already has an active schedule`,
            );
          }
          throw error;
        }
      }
      if (!body.plannedAt) {
        throw new ValidationError(
          "ValidationError: plannedAt is required for a legacy calendar entry",
        );
      }
      await validateBindings(ctx, body.contentOutputId, body.candidateId);
      const row = await repoFor(ctx, acc).createEntry(accountId, {
        plannedAt: body.plannedAt,
        plannedDate: body.plannedAt.slice(0, 10),
        contentOutputId: body.contentOutputId ?? null,
        candidateId: body.candidateId ?? null,
        note: body.note,
      });
      return toContentCalendarEntryDto(row);
    },

    async updateEntry(ctx, entryId, patch) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.updateEntry");
      const repo = repoFor(ctx, acc);
      const existing = await repo.getEntry(entryId); // ownership gate
      if (existing.status === "published") {
        throw new ConflictError(
          `ConflictError: published calendar entry ${entryId} cannot be updated`,
        );
      }
      if (existing.projectId) {
        if (
          patch.plannedAt !== undefined ||
          patch.contentOutputId !== undefined ||
          patch.candidateId !== undefined
        ) {
          throw new ValidationError(
            "ValidationError: a project schedule cannot bind a legacy calendar target",
          );
        }
        if (patch.plannedDate === undefined) {
          if (patch.note === undefined) {
            return toContentCalendarEntryDto(existing);
          }
          return toContentCalendarEntryDto(
            await repo.updateEntry(entryId, { note: patch.note }),
          );
        }
        assertCalendarDate(patch.plannedDate);
        const { today } = await calendarContext(ctx);
        if (patch.plannedDate < today) {
          throw new ValidationError(
            "ValidationError: plannedDate cannot be before today",
          );
        }
        await assertProjectSchedulable(ctx, existing.projectId);
        if (patch.plannedDate === existing.plannedDate) {
          return toContentCalendarEntryDto(existing);
        }
        const row = await repo.updateEntry(entryId, {
          plannedDate: patch.plannedDate,
          plannedAt: `${patch.plannedDate}T12:00:00.000Z`,
          note: patch.note,
          status: existing.status === "missed" ? "planned" : undefined,
          publishedAt: existing.status === "missed" ? null : undefined,
        });
        return toContentCalendarEntryDto(row);
      }
      if (patch.plannedDate !== undefined) {
        throw new ValidationError(
          "ValidationError: plannedDate requires a project schedule",
        );
      }
      await validateBindings(ctx, patch.contentOutputId, patch.candidateId);
      // missed → planned implicit reschedule when plannedAt moves into the future.
      let statusReset: string | undefined;
      if (
        patch.plannedAt !== undefined &&
        existing.status === "missed" &&
        Date.parse(patch.plannedAt) > Date.parse(clock.now())
      ) {
        statusReset = "planned";
      }
      const row = await repo.updateEntry(entryId, {
        plannedAt: patch.plannedAt,
        plannedDate: patch.plannedAt?.slice(0, 10),
        contentOutputId: patch.contentOutputId,
        candidateId: patch.candidateId,
        note: patch.note,
        status: statusReset,
      });
      return toContentCalendarEntryDto(row);
    },

    async transition(ctx, entryId, body) {
      const next = body.status;
      if (!VALID_STATUSES.has(next)) {
        throw new ValidationError(
          `ValidationError: unknown calendar entry status '${next}'`,
        );
      }
      const acc = requireAccountId(ctx.accountId, "contentCalendar.transition");
      const repo = repoFor(ctx, acc);
      const existing = await repo.getEntry(entryId); // ownership gate
      if (next === "published") {
        throw new ConflictError(
          "ConflictError: publication status is reconciled from publishing facts",
        );
      }
      if (existing.projectId) {
        throw new ConflictError(
          "ConflictError: project schedule status is system-derived",
        );
      }
      const current = existing.status;
      // Idempotency: same-status transition is a no-op (returns existing DTO).
      if (next === current) {
        return toContentCalendarEntryDto(existing);
      }
      if (!ALLOWED[current]?.includes(next)) {
        throw new ConflictError(
          `ConflictError: calendar entry ${entryId} cannot transition ${current} → ${next}`,
        );
      }
      const row = await repo.setEntryStatus(entryId, {
        status: next,
      });
      return toContentCalendarEntryDto(row);
    },

    async deleteEntry(ctx, entryId) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.deleteEntry");
      const repo = repoFor(ctx, acc);
      const existing = await repo.getEntry(entryId);
      if (existing.status === "published") {
        throw new ConflictError(
          `ConflictError: published calendar entry ${entryId} cannot be deleted`,
        );
      }
      // T-724：归档项目的既有排期是只读历史。不能只靠前端隐藏按钮；旧页面或
      // 直接请求也必须经过同一项目生命周期门，归档动作本身不删除日历记录。
      if (existing.projectId) {
        await assertProjectSchedulable(ctx, existing.projectId);
      }
      return repo.deleteEntry(entryId);
    },

    async getCadence(ctx, accountId) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.getCadence");
      assertCurrentAccount(acc, accountId); // 号一致性门(§4.5)
      await deps.platformAccounts.getAccount(ctx, accountId); // ownership gate
      const row = await repoFor(ctx, acc).getCadence(accountId);
      return row ? toPublishingCadenceDto(row) : null;
    },

    async upsertCadence(ctx, accountId, body) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.upsertCadence");
      assertCurrentAccount(acc, accountId); // 写路径 stamp 必须来自 ctx 当前号(§4.6)
      await deps.platformAccounts.getAccount(ctx, accountId); // ownership gate
      if (!VALID_FREQUENCIES.has(body.frequency)) {
        throw new ValidationError(
          `ValidationError: unknown cadence frequency '${body.frequency}'`,
        );
      }
      for (const slot of body.preferredSlots) {
        if (
          !Number.isInteger(slot.weekday) ||
          slot.weekday < 0 ||
          slot.weekday > 6 ||
          typeof slot.time !== "string"
        ) {
          throw new ValidationError(
            "ValidationError: preferredSlots entries must be { weekday: 0-6, time: string }",
          );
        }
      }
      const row = await repoFor(ctx, acc).upsertCadence(accountId, {
        frequency: body.frequency,
        preferredSlots: body.preferredSlots,
      });
      return toPublishingCadenceDto(row);
    },

    async attainment(ctx, accountId, window) {
      const acc = requireAccountId(ctx.accountId, "contentCalendar.attainment");
      assertCurrentAccount(acc, accountId); // 号一致性门(§4.5;reconcile 会写状态)
      await deps.platformAccounts.getAccount(ctx, accountId); // ownership gate
      return attainmentFor(ctx, accountId, window);
    },

    async getLaggingAccounts(ctx, accountIds, window) {
      const acc = requireAccountId(
        ctx.accountId,
        "contentCalendar.getLaggingAccounts",
      );
      const lagging: LaggingAccount[] = [];
      for (const accountId of accountIds) {
        // [T-332 S2 · ISO-07] 跨号总览无隐式路径:只扫 ctx 当前号(reconcile 会写
        // 入 entry 状态,跨号扫描 = 跨号写)。将来要真·多号总览须走显式 scope=all
        // 产品能力(SPEC §8.2,本期不做)。非当前号直接跳过,不 404(总览语义)。
        if (accountId !== acc) continue;
        // ownership gate per account (skips foreign ids structurally via the port).
        await deps.platformAccounts.getAccount(ctx, accountId);
        const a = await attainmentFor(ctx, accountId, window);
        if (a.isLagging) {
          lagging.push({
            accountId,
            gapDays: a.gapDays,
            attainmentRatio: a.attainmentRatio,
          });
        }
      }
      return lagging;
    },

    async listActiveProjectSchedules(ctx, accountId) {
      const acc = requireAccountId(
        ctx.accountId,
        "contentCalendar.listActiveProjectSchedules",
      );
      assertCurrentAccount(acc, accountId);
      await deps.platformAccounts.getAccount(ctx, accountId);
      const rows = await repoFor(ctx, acc).listActiveProjectSchedules(accountId);
      return rows.map(toContentCalendarEntryDto);
    },

    async reconcileProjectSchedule(ctx, entryId) {
      const acc = requireAccountId(
        ctx.accountId,
        "contentCalendar.reconcileProjectSchedule",
      );
      const repo = repoFor(ctx, acc);
      const existing = await repo.getEntry(entryId);
      if (!existing.projectId) {
        throw new ValidationError(
          `ValidationError: calendar entry ${entryId} is not a project schedule`,
        );
      }
      if (existing.status === "published") {
        return toContentCalendarEntryDto(existing);
      }
      const fact =
        await deps.schedulePublishing.getProjectPublicationFact(
          ctx,
          existing.projectId,
        );
      if (fact) {
        return toContentCalendarEntryDto(
          await repo.setEntryStatus(entryId, {
            status: "published",
            publishedAt: fact.publishedAt,
          }),
        );
      }
      const { today } = await calendarContext(ctx);
      if (existing.status === "planned" && existing.plannedDate < today) {
        return toContentCalendarEntryDto(
          await repo.setEntryStatus(entryId, {
            status: "missed",
            publishedAt: null,
          }),
        );
      }
      return toContentCalendarEntryDto(existing);
    },

    async getCalendarRequestContext(ctx) {
      requireAccountId(
        ctx.accountId,
        "contentCalendar.getCalendarRequestContext",
      );
      return calendarContext(ctx);
    },
  };
}

export { OwnershipError, ConflictError, ValidationError };
