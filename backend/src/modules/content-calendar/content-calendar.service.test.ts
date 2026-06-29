import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createContentCalendarService,
  type ContentCalendarService,
  type PlatformAccountPort,
  type PublishingPort,
  type CandidatePort,
  type NotificationsPort,
} from "./content-calendar.service";
import {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./content-calendar.errors";

// Step 3 (service) — RequestContext + §7.2 state machine + reconcile + attainment.
// Fixed clock/now/nextId; pglite db; stubbed peer ports. Asserts: account-ownership
// guard, transition valid/invalid/idempotent, C-3 candidate-validation-only,
// not-both-bound, reconcile planned→published/missed + single 断更 notification on the
// edge (idempotent), attainment math, cadence null-not-throw + upsert-same-row.

const ACC = "acct-1";
const CLOCK = "2026-07-20T00:00:00.000Z"; // "today" for reconcile/overdue

const ctx: RequestContext = {
  userId: "user-a",
  requestId: "req-1",
  source: "user",
};

// Default stubs: account owned, no output published, candidate exists, notify spy.
function makeService(
  db: Db,
  overrides: {
    platformAccounts?: Partial<PlatformAccountPort>;
    publishing?: Partial<PublishingPort>;
    candidates?: Partial<CandidatePort>;
    notify?: NotificationsPort["notify"];
  } = {},
): { service: ContentCalendarService; notify: ReturnType<typeof vi.fn>; candidateCreateSpy: ReturnType<typeof vi.fn> } {
  let seq = 0;
  const notify = vi.fn(async () => {});
  const candidateCreateSpy = vi.fn();
  const platformAccounts: PlatformAccountPort = {
    getAccount: overrides.platformAccounts?.getAccount ?? (async () => ({})),
  };
  const publishing: PublishingPort = {
    isOutputPublished:
      overrides.publishing?.isOutputPublished ?? (async () => false),
  };
  const candidates: CandidatePort = {
    exists: overrides.candidates?.exists ?? (async () => true),
  };
  const notifications: NotificationsPort = {
    notify: overrides.notify ?? notify,
  };
  const service = createContentCalendarService({
    db,
    now: () => CLOCK,
    nextId: (p: string) => `${p}-${++seq}`,
    clock: { now: () => CLOCK },
    platformAccounts,
    publishing,
    candidates,
    notifications,
  });
  return { service, notify, candidateCreateSpy };
}

describe("content-calendar service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("guards account ownership on listCalendar/createEntry", async () => {
    const { service } = makeService(db, {
      platformAccounts: {
        getAccount: async () => {
          throw new OwnershipError("OwnershipError: platform account not found");
        },
      },
    });
    await expect(
      service.listCalendar(
        ctx,
        ACC,
        { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" },
        { limit: 50, offset: 0 },
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      service.createEntry(ctx, ACC, { plannedAt: "2026-07-21T09:00:00.000Z" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("transitions planned → published (stamps publishedAt), planned → missed, missed → published", async () => {
    const { service } = makeService(db);
    const e1 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-21T09:00:00.000Z",
    });
    const pub = await service.transition(ctx, e1.id, { status: "published" });
    expect(pub.status).toBe("published");
    expect(pub.publishedAt).toBe(CLOCK);

    const e2 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-22T09:00:00.000Z",
    });
    const missed = await service.transition(ctx, e2.id, { status: "missed" });
    expect(missed.status).toBe("missed");
    // late recover.
    const recovered = await service.transition(ctx, e2.id, {
      status: "published",
    });
    expect(recovered.status).toBe("published");
    expect(recovered.publishedAt).toBe(CLOCK);
  });

  it("rejects an invalid transition (published → planned) and no-ops same-status", async () => {
    const { service } = makeService(db);
    const e = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-21T09:00:00.000Z",
    });
    await service.transition(ctx, e.id, { status: "published" });
    await expect(
      service.transition(ctx, e.id, { status: "planned" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // planned → planned idempotent no-op.
    const e2 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-23T09:00:00.000Z",
    });
    const same = await service.transition(ctx, e2.id, { status: "planned" });
    expect(same.status).toBe("planned");
    expect(same.id).toBe(e2.id);
  });

  it("C-3: createEntry with an unknown candidateId throws ValidationError (never creates one)", async () => {
    const existsSpy = vi.fn(async () => false);
    const { service } = makeService(db, { candidates: { exists: existsSpy } });
    await expect(
      service.createEntry(ctx, ACC, {
        plannedAt: "2026-07-21T09:00:00.000Z",
        candidateId: "cand-x",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(existsSpy).toHaveBeenCalledWith(ctx, "cand-x");
  });

  it("rejects an entry bound to BOTH a contentOutput and a candidate", async () => {
    const { service } = makeService(db);
    await expect(
      service.createEntry(ctx, ACC, {
        plannedAt: "2026-07-21T09:00:00.000Z",
        contentOutputId: "out-1",
        candidateId: "cand-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reconciles a bound-published slot → published, an overdue slot → missed (one 断更, idempotent)", async () => {
    // Output out-pub is published; out-none never publishes. Both planned well before
    // the fixed clock so the overdue path triggers for the unpublished one.
    const isOutputPublished = vi.fn(async (_ctx, id: string) => id === "out-pub");
    const { service, notify } = makeService(db, {
      publishing: { isOutputPublished },
    });
    await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-10T09:00:00.000Z",
      contentOutputId: "out-pub",
    });
    await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-10T09:00:00.000Z",
      contentOutputId: "out-none",
    });

    const window = {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T00:00:00.000Z",
    };
    const a1 = await service.attainment(ctx, ACC, window);
    expect(a1.publishedCount).toBe(1);
    expect(a1.missedCount).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![1]).toMatchObject({
      type: "cadence_gap",
      accountId: ACC,
    });

    // A second reconcile does NOT re-fire (the slot is already missed, not planned).
    notify.mockClear();
    const a2 = await service.attainment(ctx, ACC, window);
    expect(a2.missedCount).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("computes attainment math: weekly cadence, 4-week window, 3 published / 1 missed", async () => {
    const { service } = makeService(db);
    await service.upsertCadence(ctx, ACC, {
      frequency: "weekly",
      preferredSlots: [],
    });
    // 4-week window. 3 published (manually), 1 missed (overdue, unpublished, no output).
    const window = {
      from: "2026-06-22T00:00:00.000Z",
      to: "2026-07-20T00:00:00.000Z",
    };
    const e1 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-06-23T09:00:00.000Z",
    });
    const e2 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-06-30T09:00:00.000Z",
    });
    const e3 = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-07T09:00:00.000Z",
    });
    await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-08T09:00:00.000Z", // overdue vs clock 07-20 → missed
    });
    await service.transition(ctx, e1.id, { status: "published" });
    await service.transition(ctx, e2.id, { status: "published" });
    await service.transition(ctx, e3.id, { status: "published" });

    const a = await service.attainment(ctx, ACC, window);
    expect(a.expectedCount).toBe(4); // 28 days / 7 = 4 weeks
    expect(a.publishedCount).toBe(3);
    expect(a.missedCount).toBe(1);
    expect(a.attainmentRatio).toBe(0.75);
    expect(typeof a.gapDays).toBe("number");
    expect(typeof a.isLagging).toBe("boolean");
  });

  it("cadence: getCadence returns null (not throw) when none; upsert twice updates same row", async () => {
    const { service } = makeService(db);
    expect(await service.getCadence(ctx, ACC)).toBeNull();
    const c1 = await service.upsertCadence(ctx, ACC, {
      frequency: "weekly",
      preferredSlots: [],
    });
    const c2 = await service.upsertCadence(ctx, ACC, {
      frequency: "daily",
      preferredSlots: [{ weekday: 1, time: "09:00" }],
    });
    expect(c2.id).toBe(c1.id);
    expect(c2.frequency).toBe("daily");
    const got = await service.getCadence(ctx, ACC);
    expect(got?.frequency).toBe("daily");
  });

  it("upsertCadence rejects an unknown frequency", async () => {
    const { service } = makeService(db);
    await expect(
      service.upsertCadence(ctx, ACC, {
        frequency: "hourly",
        preferredSlots: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reschedules a missed entry to a future plannedAt → planned (implicit)", async () => {
    const { service } = makeService(db);
    const e = await service.createEntry(ctx, ACC, {
      plannedAt: "2026-07-10T09:00:00.000Z",
    });
    await service.transition(ctx, e.id, { status: "missed" });
    const updated = await service.updateEntry(ctx, e.id, {
      plannedAt: "2026-07-28T09:00:00.000Z", // future vs clock 07-20
    });
    expect(updated.status).toBe("planned");
    expect(updated.plannedAt).toBe("2026-07-28T09:00:00.000Z");
  });
});
